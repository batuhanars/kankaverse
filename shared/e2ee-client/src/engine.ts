// E2EE motoru: tek kullanıcı için cihaz, gruplar ve mesaj çözme/şifreleme. Tüm MLS durum işlemleri
// `withLock`'tan geçer (E1 §1.7). Ağ, depo, kilit ve sağlayıcı enjekte edilir (ports.ts): testler sahte
// sunucuyla, web ve mobil kendi adaptörleriyle çalışır.
import {
  frank,
  newFrankingKey,
  RandomUnavailableError,
  textPayload,
  toBase64,
  type Group,
} from '@kankaverse/e2ee-core'
import { fromB64, toB64 } from './b64'
import { DeviceRemovedError, groupForSend, openChannel, syncChannel, type ChannelInfo } from './channelSync'
import type { E2eeContext } from './context'
import { DeviceBrokenError, ensureDevice } from './deviceSetup'
import { Hydrator, type OwnEntry, type OwnPlain, type Resolution, type WireMessage } from './hydrate'
import { digestOf, LocalStore, type StoredStatus } from './localStore'
import type { E2eeApi, EngineDeps, Vault, WarningHandler, WithLock } from './ports'
import { OFFLINE_API, withViewCache } from './viewCache'
import { processWelcomes } from './welcomes'

export type { WarningHandler }

/** Güvenli rastgelelik yoksa motor BAŞLAMAZ (§5): anahtarlar tahmin edilebilir olurdu. */
function assertRandom(): void {
  const g = (globalThis as { crypto?: { getRandomValues?: unknown } }).crypto
  if (typeof g?.getRandomValues !== 'function') {
    throw new RandomUnavailableError('crypto.getRandomValues yok: E2EE başlatılamaz')
  }
}

/** Hydrate çıktısına eklenen alanlar: düz metin `content`'e yazılır, çözülemeyenin durumu işaretlenir. */
export interface Hydrated {
  content: string
  e2eeStatus?: StoredStatus
}

const MAX_HISTORY_PAGES = 10 // geçmiş sayfası sınırı: ilk girişte sonsuza kadar geriye gitme
const PAGE_SIZE = 50

/** Bildirim için tek mesaj çözme sonucu (E3 §3.1). */
export type NotificationPreview =
  | { kind: 'text'; body: string } // çözüldü ya da daha önce çözülmüştü (depodan)
  | { kind: 'hidden' } // iptal edilmiş cihazdan: bildirim gösterilmez
  | { kind: 'unavailable' } // diğer her durum: çağıran genel metni gösterir

function previewOf(r: Resolution | undefined): NotificationPreview {
  if (r?.kind === 'hidden') return { kind: 'hidden' }
  if (r?.kind === 'record' && r.record.status === 'ok') return { kind: 'text', body: r.record.body }
  return { kind: 'unavailable' }
}

/** `openLocal` bağımlılıkları: ağ ve uyarı yok. */
export type LocalEngineDeps = Omit<EngineDeps, 'api' | 'onWarn'>

export interface SentCipher {
  ciphertext: string
  epoch: number
  /** E4: base64 (32 bayt) mesaj taahhüdü. Yalnız `franking` bayrağı açıkken (v2 yük); API'ye `frankingTag` olarak gider. */
  frankingTag?: string
}

/** Şikâyet kanıtı öğesi (E4 §3.3 `evidence`): yalnız yerelde çözülmüş (`ok`) mesajlar. */
export interface EvidenceItem {
  messageId: string
  body: string
  sentAt: number
  fk?: string
}

/** Hedef mesajdan önce kanıta giren en çok mesaj sayısı (E4 §3.3). */
export const EVIDENCE_CONTEXT = 5

export class E2eeEngine {
  readonly userId: string
  private api: E2eeApi
  private store: LocalStore
  private vault: Vault
  private withLock: WithLock
  private onWarn: WarningHandler
  private log: (message: string, error?: unknown) => void
  private yieldToUi: EngineDeps['yieldToUi']
  private metric: EngineDeps['metric']
  private own: OwnPlain = new Map()
  /** `/e2ee/status` bayrağı (E4 §2.2): true iken v2 yük + frankingTag gönderilir. */
  private franking = false

  private constructor(
    userId: string,
    deps: LocalEngineDeps,
    vault: Vault,
    api: E2eeApi | null,
    onWarn: WarningHandler,
  ) {
    this.userId = userId
    this.vault = vault
    this.store = new LocalStore(vault, deps.provider)
    // Çevrimiçi yolda her channelState görünümü depoya yazar (E3 §9.1, tek nokta); yerel motorda ağ yok.
    this.api = api ? withViewCache(api, this.store) : OFFLINE_API
    this.withLock = deps.withLock
    this.onWarn = onWarn
    this.log = deps.log ?? ((m, e) => console.error(m, e))
    this.yieldToUi = deps.yieldToUi
    this.metric = deps.metric
  }

  /** `null` = bu hesap için E2EE kapalı (bayrak/izin listesi). Cihaz kurulamazsa hata (uyarı ayrıca verilir). */
  static async start(userId: string, deps: EngineDeps): Promise<E2eeEngine | null> {
    assertRandom()
    const { data } = await deps.api.status()
    if (!data.enabled) return null
    const vault = await deps.openVault(userId)
    const engine = new E2eeEngine(userId, deps, vault, deps.api, deps.onWarn)
    engine.franking = data.franking === true
    try {
      await engine.run(async () => {
        await ensureDevice(deps.api, engine.store, deps.provider)
        await engine.rememberFrankingFlag()
      })
    } catch (e) {
      if (e instanceof DeviceBrokenError) deps.onWarn('', 'device-broken')
      throw e
    }
    return engine
  }

  /**
   * Yalnız yerel depoyu açar (E3 §9.1): AĞ PORTU YOK, cihaz kaydı/KeyPackage/Welcome yok. Cihaz yoksa
   * `null`. Dönen motorun ağlı metodları çağrılmaz; yalnız `decryptOffline` ve depo okumaları (`quoteText`).
   */
  static async openLocal(userId: string, deps: LocalEngineDeps): Promise<E2eeEngine | null> {
    assertRandom()
    const t0 = Date.now()
    const vault = await deps.openVault(userId)
    const t1 = Date.now()
    const engine = new E2eeEngine(userId, deps, vault, null, () => {}) // uyarı yok: önbellek bayat olabilir
    const hasDevice = (await engine.store.loadDevice()) !== null
    engine.franking = (await engine.store.loadFlags()).franking === true // ağsız: son bilinen bayrak
    // Soğuk açılış ölçümü (E3 Rev.3 k.5): yalnız süre.
    deps.metric?.('push-step vault-open', t1 - t0, 1)
    deps.metric?.('push-step device-open', Date.now() - t1, 1)
    return hasDevice ? engine : null
  }

  /** Bayrağı depoya yazar (yalnız değişince): ağsız motor (hızlı cevap) son bilineni kullanır. */
  private async rememberFrankingFlag(): Promise<void> {
    const flags = await this.store.loadFlags()
    if ((flags.franking === true) !== this.franking) {
      await this.store.saveFlags({ ...flags, franking: this.franking })
    }
  }

  /**
   * Grup şifrelemesi + taahhüt (E4 §2.1). Bayrak kapalı: v1, `frankingTag` yok. Açık: mesaj başına yeni `fk`,
   * v2 yük, `tag = frank(fk, {kanal, gönderen cihaz, gövde, sentAt})`. Düz bilgi (`fk` dahil) `own`'a girer.
   */
  private async seal(
    ctx: E2eeContext,
    group: Group,
    channelId: string,
    text: string,
  ): Promise<SentCipher> {
    const sentAt = Date.now()
    const fk = this.franking ? newFrankingKey() : undefined
    const fkB64 = fk && toBase64(fk)
    const sealed = await group.encrypt(textPayload(text, sentAt, fkB64))
    // Şifreleme anahtarı tüketir: POST başarısız olsa bile durum geri alınamaz, hemen diske.
    await ctx.store.saveGroup(channelId, group)
    const entry: OwnEntry = { body: text, sentAt, fk: fkB64 }
    this.own.set(digestOf(sealed.ciphertext), entry)
    const out: SentCipher = { ciphertext: toB64(sealed.ciphertext), epoch: sealed.epoch }
    if (fk) {
      const senderDeviceId = (await ctx.getDevice()).deviceId ?? ''
      out.frankingTag = toBase64(frank(fk, { channelId, senderDeviceId, body: text, sentAt }))
    }
    return out
  }

  private run<T>(task: (ctx: E2eeContext) => Promise<T>): Promise<T> {
    return this.withLock(`kv-e2ee:${this.userId}`, () => task(this.context()))
  }

  private context(): E2eeContext {
    let device: Awaited<ReturnType<LocalStore['loadDevice']>> = null
    return {
      api: this.api,
      store: this.store,
      warn: this.onWarn,
      yieldToUi: this.yieldToUi,
      metric: this.metric,
      getDevice: async () => {
        device ??= await this.store.loadDevice()
        if (!device) throw new DeviceBrokenError('Yerel cihaz yok')
        return device
      },
    }
  }

  open(channelId: string): Promise<ChannelInfo> {
    return this.run((ctx) => openChannel(ctx, channelId))
  }

  /** e2ee:welcome: yeni Welcome'lar işlenir, katılınan kanallar eşitlenir. */
  onWelcome(): Promise<string[]> {
    return this.run(async (ctx) => {
      const joined = await processWelcomes(ctx)
      for (const id of joined) await syncChannel(ctx, id)
      return joined
    })
  }

  /** e2ee:commit ve e2ee:devices-changed: yerel grup varsa commit'leri işle, üyelik farkını kapat. */
  onGroupChanged(channelId: string): Promise<void> {
    return this.run(async (ctx) => {
      await syncChannel(ctx, channelId)
    })
  }

  /**
   * Metni şifreler. `null` = DM şifresiz kalacak (karşı taraf uygun değil), çağıran düz gönderir.
   * Düz metin özetle eşleşecek şekilde bellekte tutulur: WS yankısı HTTP cevabından önce gelirse,
   * kendi mesajımızı çözemediğimiz için ekran buradan okur.
   */
  encrypt(channelId: string, text: string): Promise<SentCipher | null> {
    return this.run(async (ctx) => {
      const group = await groupForSend(ctx, channelId)
      if (!group) return null
      return this.seal(ctx, group, channelId, text)
    })
  }

  /**
   * Hafif şifreleme (E3 Rev.3 §10 k.3, bildirimden hızlı cevap): YALNIZ yerel grupla şifreler, AĞA ÇIKMAZ
   * (`encrypt`'in aksine `channelState`/Welcome/grup kurma yok). Yerel grup yok → `null` (çağıran şifresiz sohbet
   * sayıp düz gönderir; sunucu şifreli kanala düz mesajı reddeder). Cihaz gruptan çıkarılmışsa fırlatır: düz
   * metin asla gönderilmesin. Durum hemen diske (anahtar tüketildi); düz metin `rememberSent` için bellekte kalır.
   */
  encryptOffline(channelId: string, text: string): Promise<SentCipher | null> {
    return this.run(async (ctx) => {
      const group = await ctx.store.loadGroup(channelId)
      if (!group) return null
      if (!group.isActive) throw new DeviceRemovedError()
      return this.seal(ctx, group, channelId, text)
    })
  }

  /** Sunucu mesajı kabul etti: kendi düz metnimizi kalıcı yaz (yeniden başlatınca geçmiş yerelden gelir). */
  rememberSent(msg: WireMessage): Promise<void> {
    return this.run(async (ctx) => {
      if (!msg.ciphertext) return
      const digest = digestOf(fromB64(msg.ciphertext))
      const own = this.own.get(digest)
      if (own === undefined) return
      await ctx.store.saveMessage({
        id: msg.id,
        channelId: msg.channelId,
        status: 'ok',
        body: own.body,
        digest,
        sentAt: own.sentAt,
        ...(own.fk !== undefined && { fk: own.fk }),
      })
    })
  }

  /** Mesajları (eskiden yeniye) çözüp `content`'e düz metni yazar; iptal cihazdan gelenleri eler. */
  hydrate<T extends WireMessage & { content: string }>(channelId: string, asc: T[]): Promise<T[]> {
    if (!asc.some((m) => m.encrypted)) return Promise.resolve(asc)
    return this.run((ctx) => this.hydrateIn(ctx, channelId, asc))
  }

  /**
   * Sayfa (yeniden eskiye) için çözme. Sayfanın en eski şifreli mesajı henüz çözülmemişse daha eski
   * sayfaları da çekip HEPSİNİ eskiden yeniye çözer: MLS ileri sararken atlanan anahtarları az tutar,
   * en yeni sayfayı önce çözmek aradaki mesajları kalıcı kaybettirirdi.
   */
  hydrateHistory<T extends WireMessage & { content: string }>(
    channelId: string,
    descPage: T[],
    loadOlder: (beforeId: string) => Promise<T[]>,
  ): Promise<T[]> {
    if (!descPage.some((m) => m.encrypted)) return Promise.resolve(descPage)
    return this.run(async (ctx) => {
      const h = new Hydrator(ctx, channelId, this.own)
      let all = descPage
      let last = descPage
      for (
        let i = 0;
        i < MAX_HISTORY_PAGES &&
        last.length === PAGE_SIZE &&
        !(await this.pageHasResolved(h, last));
        i++
      ) {
        last = await loadOlder(all[all.length - 1].id)
        all = [...all, ...last]
      }
      return (await this.hydrateIn(ctx, channelId, [...all].reverse(), h)).reverse()
    })
  }

  private async pageHasResolved(h: Hydrator, page: WireMessage[]): Promise<boolean> {
    for (const m of page) if (await h.isResolved(m)) return true
    return false
  }

  private async hydrateIn<T extends WireMessage & { content: string }>(
    ctx: E2eeContext,
    channelId: string,
    asc: T[],
    hydrator = new Hydrator(ctx, channelId, this.own),
  ): Promise<T[]> {
    let resolved = new Map<string, Resolution>()
    try {
      resolved = await hydrator.resolveAll(asc)
    } catch (e) {
      this.log('[e2ee] çözme durdu', e) // uyarı guardUntrusted'da verildi; kalanlar "çözülemedi" görünür
    }
    return asc.flatMap((m) => this.apply(m, resolved.get(m.id)))
  }

  private apply<T extends WireMessage & { content: string }>(m: T, r: Resolution | undefined): T[] {
    if (!m.encrypted) return [m]
    if (r?.kind === 'hidden') return []
    const plain = { ...m, ciphertext: undefined } // şifreli yük ekran durumunda tutulmaz
    if (r?.kind === 'record') {
      return [{ ...plain, content: r.record.body, e2eeStatus: r.record.status }]
    }
    return [{ ...plain, content: '', e2eeStatus: 'undecryptable' as const }]
  }

  /**
   * Bildirim görevi için TEK mesajı ağsız çözer (E3 §9.1). Depoda kayıt varsa onu döner; yoksa yerel grup +
   * önbellekteki cihaz görünümüyle tek deneme. Başarıda düz metin ve grup durumu yazılır (sohbet açılınca
   * ikinci çözme yok). Başarısızlık (DecryptError, grup/görünüm yok) `unavailable`'dır ve kalıcı HİÇBİR
   * başarısızlık kaydı yazılmaz: eksik commit olabilir, karar çevrimiçi yolun. Kuyruktan geçer (`run`).
   */
  async decryptOffline(msg: WireMessage): Promise<NotificationPreview> {
    try {
      const done = await this.run((ctx) =>
        new Hydrator(ctx, msg.channelId, this.own, true).resolveAll([msg]),
      )
      return previewOf(done.get(msg.id))
    } catch (e) {
      // İçerik/yük asla loglanmaz: yalnız hata türünün adı.
      this.log(`[e2ee] çevrimdışı çözülemedi: ${e instanceof Error ? e.name : typeof e}`)
      return { kind: 'unavailable' }
    }
  }

  /** Yanıt alıntısının düz metni depodan; yoksa null (arayüz "Şifreli mesaj" der). */
  async quoteText(messageId: string): Promise<string | null> {
    const rec = await this.run((ctx) => ctx.store.loadMessage(messageId))
    return rec?.status === 'ok' ? rec.body : null
  }

  /**
   * Şikâyet kanıtı (E4 §4): hedef mesaj + kanalda ondan önceki en çok 5 mesaj, YALNIZ yerel depoda `ok` olanlar.
   * `olderMessages` hedeften ÖNCEKİ mesajlardır (çağıran verir; sıra önemsiz, motor zamana göre en yakın 5'i alır).
   * Motor yalnız depodan okur, çözme yapmaz. Hedef `ok` değilse (çözülememiş/doğrulanmamış) kanıt boş döner:
   * sunucu hedefin listede olmasını şart koşar, şikâyet yalnız referansla gider. Sıra: hedef önce, sonra eskiden yeniye.
   */
  collectEvidence(
    channelId: string,
    targetMessageId: string,
    olderMessages: Pick<WireMessage, 'id' | 'createdAt'>[],
  ): Promise<EvidenceItem[]> {
    return this.run(async (ctx) => {
      const nearest = [...olderMessages]
        .filter((m) => m.id !== targetMessageId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : -1))
        .slice(0, EVIDENCE_CONTEXT)
        .reverse()
      const out: EvidenceItem[] = []
      const target = await this.evidenceOf(ctx, channelId, targetMessageId)
      if (!target) return out
      out.push(target)
      for (const m of nearest) {
        const item = await this.evidenceOf(ctx, channelId, m.id, Date.parse(m.createdAt))
        if (item) out.push(item)
      }
      return out
    })
  }

  private async evidenceOf(
    ctx: E2eeContext,
    channelId: string,
    messageId: string,
    fallbackSentAt = 0,
  ): Promise<EvidenceItem | null> {
    const rec = await ctx.store.loadMessage(messageId)
    if (rec?.status !== 'ok' || rec.channelId !== channelId) return null
    return {
      messageId,
      body: rec.body,
      sentAt: rec.sentAt ?? fallbackSentAt, // E4 öncesi kayıt: v1 olduğundan zaten "doğrulanmamış" gider
      ...(rec.fk !== undefined && { fk: rec.fk }),
    }
  }

  /** Çıkış: bu kullanıcının tüm yerel şifreli deposunu siler. */
  async destroy(): Promise<void> {
    this.own.clear()
    await this.vault.destroy()
  }
}
