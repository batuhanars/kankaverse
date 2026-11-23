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
import {
  assertNoStaleLeavesOffline,
  DeviceRemovedError,
  groupForSend,
  openChannel,
  syncChannel,
  type ChannelInfo,
} from './channelSync'
import { BackupManager } from './backup'
import { deriveCallKey } from './callKey'
import { IdentityManager } from './identity'
import { TransferManager } from './transfer'
import type { E2eeContext } from './context'
import { previewInMemory, type PushCommit } from './commitPreview'
import { mentionIdsOf } from './mentionIds'
import { DeviceBrokenError, ensureDevice } from './deviceSetup'
import { Hydrator, type OwnEntry, type OwnPlain, type Resolution, type WireMessage } from './hydrate'
import { type DeviceNotice, digestOf, LocalStore, type StoredMessage, type StoredStatus } from './localStore'
import type { E2eeApi, EngineDeps, Vault, WarningHandler, WithLock } from './ports'
import { OFFLINE_API, withViewCache } from './viewCache'
import { channelRecords, enrichHits, matchRecords, searchable, type LocalSearchHit } from './localSearch'
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

/** Çözme seçenekleri. `localOnly`: eski grup (C62), ağsız ve senkronsuz; yalnız yerel kayıtlar. */
export interface HydrateOptions {
  localOnly?: boolean
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
export type LocalEngineDeps = Omit<EngineDeps, 'api' | 'onWarn' | 'argon2' | 'blob'>

export interface SentCipher {
  ciphertext: string
  epoch: number
  /** E4: base64 (32 bayt) mesaj taahhüdü. Yalnız `franking` bayrağı açıkken (v2 yük); API'ye `frankingTag` olarak gider. */
  frankingTag?: string
  /** E2 Rev.2: metindeki `<@id>` token'larından bahsedilenler (düz üst veri, en çok 20); yoksa alan yok. */
  mentionUserIds?: string[]
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
  /** E7 §5.3: son aranan kanalın çözülmüş `ok` kayıtları (yalnız bellek; depo sürümüyle bayatlar). */
  private searchCache: { channelId: string; version: number; records: StoredMessage[] } | null = null
  /** `/e2ee/status` bayrağı (E4 §2.2): true iken v2 yük + frankingTag gönderilir. */
  private franking = false
  /** E5a yedek motoru: yalnız `start` ile kurulan (ağlı) motorda var; `openLocal` motorunda yok. */
  readonly backup: BackupManager | null
  /** E5b cihazdan cihaza aktarım: ağlı motorda ve `/e2ee/status.transfer` açıkken var. */
  readonly transfer: TransferManager | null
  /** E7 kimlik: ağlı motorda her zaman var (okuma: kod ekranı, cihazlarım); yazma `/e2ee/status.identity` ile. */
  readonly identity: IdentityManager | null
  /** Açılıştaki kimlik eşitlemesi (hiç reddedilmez). Arayüz Cihazlar ekranında bekleyebilir; testler bekler. */
  identitySynced: Promise<void> = Promise.resolve()

  private constructor(
    userId: string,
    deps: LocalEngineDeps,
    vault: Vault,
    api: E2eeApi | null,
    onWarn: WarningHandler,
    backup: Pick<EngineDeps, 'argon2' | 'blob'> | null = null,
    backupEnabled = false,
    transferEnabled = false,
    identityEnabled = false,
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
    this.identity = api
      ? new IdentityManager({
          userId,
          api,
          enabled: identityEnabled,
          run: (task) => this.run(task),
          log: this.log,
        })
      : null
    const identity = this.identity
    this.backup =
      api && backup
        ? new BackupManager({
            userId,
            api,
            blob: backup.blob,
            argon2: backup.argon2,
            enabled: backupEnabled,
            run: (task) => this.run(task),
            log: this.log,
            onKeyAdopted: identity ? () => identity.sync() : undefined,
          })
        : null
    this.transfer =
      api && backup && transferEnabled
        ? new TransferManager({
            userId,
            api,
            blob: backup.blob,
            run: (task) => this.run(task),
            log: this.log,
            identity: identity
              ? { export: () => identity.exportForTransfer(), adopt: (t) => identity.adoptFromTransfer(t) }
              : undefined,
          })
        : null
  }

  /** `null` = bu hesap için E2EE kapalı (bayrak/izin listesi). Cihaz kurulamazsa hata (uyarı ayrıca verilir). */
  static async start(userId: string, deps: EngineDeps): Promise<E2eeEngine | null> {
    assertRandom()
    const { data } = await deps.api.status()
    if (!data.enabled) return null
    const vault = await deps.openVault(userId)
    const engine = new E2eeEngine(
      userId,
      deps,
      vault,
      deps.api,
      deps.onWarn,
      deps,
      data.backup === true,
      data.transfer === true,
      data.identity === true,
    )
    engine.franking = data.franking === true
    try {
      await engine.run(async () => {
        await ensureDevice(deps.api, engine.store, deps.provider, userId)
        await engine.rememberFrankingFlag()
      })
    } catch (e) {
      if (e instanceof DeviceBrokenError) deps.onWarn('', 'device-broken')
      throw e
    }
    // E7 §4.4: geçiş ve imza. Kilit DIŞINDA (ağ çağrıları); hata fırlatmaz, açılışı bekletmez.
    engine.identitySynced = engine.identity?.sync() ?? Promise.resolve()
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

  /** Silinen şifreli mesajın yerel kaydını düşer ve yedeği kirletir (E5a §4.1): silinen içerik yedekte yaşamaz. */
  forgetMessage(messageId: string): Promise<void> {
    return this.run((ctx) => ctx.store.deleteMessage(messageId))
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
    const mentionUserIds = mentionIdsOf(text)
    if (mentionUserIds.length > 0) out.mentionUserIds = mentionUserIds
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
   * E8 §4.1: arama anahtarı (bellekte kalır, kalıcı yazılmaz). `serverEpoch` = token cevabındaki `e2eeEpoch`.
   * Türetilemiyorsa `CallKeyUnavailableError` fırlatır; çağıran aramaya şifresiz BAĞLANMAZ.
   */
  callKey(channelId: string, serverEpoch: number): Promise<{ key: Uint8Array; epoch: number }> {
    return this.run((ctx) => deriveCallKey(ctx, channelId, serverEpoch))
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
      await assertNoStaleLeavesOffline(ctx, channelId, group)
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
  hydrate<T extends WireMessage & { content: string }>(
    channelId: string,
    asc: T[],
    opts: HydrateOptions = {},
  ): Promise<T[]> {
    if (!asc.some((m) => m.encrypted)) return Promise.resolve(asc)
    return this.run((ctx) => this.hydrateIn(ctx, channelId, asc, this.hydrator(ctx, channelId, opts)))
  }

  /**
   * C62: `localOnly` = ayrıldığım/çıkarıldığım grup. Kanal durumu sunucudan istenmez (eski üyeye 403 döner ve
   * tüm sayfa "çözülemedi" sayılırdı), commit senkronu yok: yalnız yerel depodaki kayıtlar gösterilir, kalıcı
   * başarısızlık yazılmaz (çevrimdışı Hydrator ile aynı kurallar).
   */
  private hydrator(ctx: E2eeContext, channelId: string, opts: HydrateOptions): Hydrator {
    return new Hydrator(ctx, channelId, this.own, opts.localOnly === true)
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
    opts: HydrateOptions = {},
  ): Promise<T[]> {
    if (!descPage.some((m) => m.encrypted)) return Promise.resolve(descPage)
    return this.run(async (ctx) => {
      const h = this.hydrator(ctx, channelId, opts)
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
      // `unverified` kayıtta gövde yerelde durur ama ekrana ASLA çıkmaz (E4: "Bu mesaj doğrulanamadı").
      const content = r.record.status === 'unverified' ? '' : r.record.body
      return [{ ...plain, content, e2eeStatus: r.record.status }]
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

  /**
   * C66 §3: push'un taşıdığı commit'lerle ağsız önizleme. Önce mevcut `decryptOffline`; `unavailable` ve commit
   * varsa commit'ler yalnız BELLEKTEKİ taze grup kopyasına uygulanır (hiçbir depo yazımı, ağ çağrısı yok).
   */
  async previewWithCommits(msg: WireMessage, commits: PushCommit[]): Promise<NotificationPreview> {
    const first = await this.decryptOffline(msg)
    if (first.kind !== 'unavailable' || commits.length === 0) return first
    try {
      const body = await this.run((ctx) => previewInMemory(ctx, msg, commits))
      return body === null ? first : { kind: 'text', body }
    } catch (e) {
      this.log(`[e2ee] commit'li önizleme başarısız: ${e instanceof Error ? e.name : typeof e}`)
      return first
    }
  }

  /**
   * E5b §4.4: geçmiş bandı. `asked` = bu cihazda zaten soruldu; `missing` = bu cihazda eksik geçmiş var
   * (hiç kayıt yok ya da cihaz öncesi `undecryptable` kayıt var); `none` = eksik yok (bir daha bakılmasın diye
   * soruldu işaretlenir). Yalnız depo okur; ilk `undecryptable`te durur.
   */
  async historyPrompt(): Promise<'asked' | 'missing' | 'none'> {
    return this.run(async (ctx) => {
      const flags = await ctx.store.loadFlags()
      if (flags.historyAsked) return 'asked'
      // Güncellenen eski cihaz (yeni kayıt değil): bant hiç çıkmaz, sessiz kapı ayarlarda.
      if (!flags.historyFresh) {
        await ctx.store.patchFlags({ historyAsked: true })
        return 'none'
      }
      const ids = await ctx.store.messageIds()
      if (ids.length === 0) return 'missing'
      for (const id of ids) {
        const rec = await ctx.store.loadMessage(id).catch(() => null)
        if (rec?.status === 'undecryptable') return 'missing'
      }
      await ctx.store.patchFlags({ historyAsked: true })
      return 'none'
    })
  }

  /** Bant gösterildi: bu cihazda bir daha sorulmaz (cevap ne olursa olsun, sahip kararı). */
  markHistoryAsked(): Promise<void> {
    return this.run((ctx) => ctx.store.patchFlags({ historyAsked: true }))
  }

  /** Yanıt alıntısının düz metni depodan; yoksa null (arayüz "Şifreli mesaj" der). */
  async quoteText(messageId: string): Promise<string | null> {
    const rec = await this.run((ctx) => ctx.store.loadMessage(messageId))
    return rec?.status === 'ok' ? rec.body : null
  }

  /**
   * E7 §5: şifreli grup DM'de yerel arama. Kayıtlar kilit içinde (yalnız depo) okunur, zenginleştirme kilit
   * dışında (ağ). Aynı kanalın çözülmüş kayıtları bellekte tutulur (§5.3): yazarken her harf yeni sorgu, depo
   * baştan okunmaz. Depo değişince (yeni/silinen kayıt) önbellek bayatlar. Diske düz metin YAZILMAZ.
   * `plain`: gövdeyi aramadan önce düz metne çevirir (bahsetmeler). Ağsız motorda boş döner.
   */
  async searchLocal(channelId: string, query: string, plain?: (body: string) => string): Promise<LocalSearchHit[]> {
    if (!searchable(query) || this.api === OFFLINE_API) return []
    const records = await this.run(async (ctx) => {
      const c = this.searchCache
      if (c?.channelId === channelId && c.version === ctx.store.messagesVersion) return c.records
      const loaded = await channelRecords(ctx, channelId)
      this.searchCache = { channelId, version: ctx.store.messagesVersion, records: loaded }
      return loaded
    })
    const hits = matchRecords(records, query, plain)
    return hits.length ? enrichHits(this.api, channelId, hits) : []
  }

  /** Arama kutusu kapanınca: bellekteki çözülmüş kayıtlar bırakılır. */
  dropSearchCache(): void {
    this.searchCache = null
  }

  /** E2 §3.3: sohbetteki "yeni cihaz eklendi" satırları (yerel depo; mesaj değil, yedeğe girmez). */
  deviceNotices(channelId: string): Promise<DeviceNotice[]> {
    return this.run((ctx) => ctx.store.loadNotices(channelId))
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

  /**
   * C69: korunan çıkış (masaüstü): motor bellekten düşer, yerel depo SİLİNMEZ. Sonraki girişte aynı
   * kullanıcı için yeniden açılır ve park edilmiş cihaz yeniden bağlanır.
   */
  release(): void {
    this.own.clear()
  }

  /** Çıkış: bu kullanıcının tüm yerel şifreli deposunu siler. */
  async destroy(): Promise<void> {
    this.own.clear()
    this.searchCache = null
    await this.vault.destroy()
  }
}
