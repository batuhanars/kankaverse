// E2EE motoru: tek kullanıcı için cihaz, gruplar ve mesaj çözme/şifreleme. Tüm MLS durum işlemleri
// `withLock`'tan geçer (E1 §1.7). Ağ, depo, kilit ve sağlayıcı enjekte edilir (ports.ts): testler sahte
// sunucuyla, web ve mobil kendi adaptörleriyle çalışır.
import { RandomUnavailableError, textPayload } from '@kankaverse/e2ee-core'
import { fromB64, toB64 } from './b64'
import { groupForSend, openChannel, syncChannel, type ChannelInfo } from './channelSync'
import type { E2eeContext } from './context'
import { DeviceBrokenError, ensureDevice } from './deviceSetup'
import { Hydrator, type OwnPlain, type Resolution, type WireMessage } from './hydrate'
import { digestOf, LocalStore, type StoredStatus } from './localStore'
import type { E2eeApi, EngineDeps, Vault, WarningHandler, WithLock } from './ports'
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

export interface SentCipher {
  ciphertext: string
  epoch: number
}

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

  private constructor(userId: string, deps: EngineDeps, vault: Vault) {
    this.userId = userId
    this.api = deps.api
    this.vault = vault
    this.store = new LocalStore(vault, deps.provider)
    this.withLock = deps.withLock
    this.onWarn = deps.onWarn
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
    const engine = new E2eeEngine(userId, deps, vault)
    try {
      await engine.run(() => ensureDevice(deps.api, engine.store, deps.provider))
    } catch (e) {
      if (e instanceof DeviceBrokenError) deps.onWarn('', 'device-broken')
      throw e
    }
    return engine
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
      const sealed = await group.encrypt(textPayload(text, Date.now()))
      // Şifreleme anahtarı tüketir: POST başarısız olsa bile durum geri alınamaz, hemen diske.
      await ctx.store.saveGroup(channelId, group)
      this.own.set(digestOf(sealed.ciphertext), text)
      return { ciphertext: toB64(sealed.ciphertext), epoch: sealed.epoch }
    })
  }

  /** Sunucu mesajı kabul etti: kendi düz metnimizi kalıcı yaz (yeniden başlatınca geçmiş yerelden gelir). */
  rememberSent(msg: WireMessage): Promise<void> {
    return this.run(async (ctx) => {
      if (!msg.ciphertext) return
      const digest = digestOf(fromB64(msg.ciphertext))
      const body = this.own.get(digest)
      if (body === undefined) return
      await ctx.store.saveMessage({
        id: msg.id,
        channelId: msg.channelId,
        status: 'ok',
        body,
        digest,
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
   * Bildirim görevi için TEK mesajı çözer (E3 §3.1). Mesaj kuyruktan geçer ve sonucu depoya yazılır; sohbet
   * sonra açılınca aynı mesaj depodan okunur, ikinci kez çözülmez. `hydrateIn` kullanılmaz: o ağ hatasını
   * yutar, burada hatayı "unavailable"dan ayırmak ve hiçbir şeyi kalıcı yazmamak gerekir (resolveAll
   * istisna fırlatırsa depoya dokunulmamıştır; yalnız commit senkronu sonrası DecryptError kalıcı yazılır).
   */
  async decryptForNotification(msg: WireMessage): Promise<NotificationPreview> {
    try {
      const done = await this.run((ctx) =>
        new Hydrator(ctx, msg.channelId, this.own).resolveAll([msg]),
      )
      return previewOf(done.get(msg.id))
    } catch (e) {
      // İçerik/yük asla loglanmaz: yalnız hata türünün adı.
      this.log(`[e2ee] bildirim çözülemedi: ${e instanceof Error ? e.name : typeof e}`)
      return { kind: 'unavailable' }
    }
  }

  /** Yanıt alıntısının düz metni depodan; yoksa null (arayüz "Şifreli mesaj" der). */
  async quoteText(messageId: string): Promise<string | null> {
    const rec = await this.run((ctx) => ctx.store.loadMessage(messageId))
    return rec?.status === 'ok' ? rec.body : null
  }

  /** Çıkış: bu kullanıcının tüm yerel şifreli deposunu siler. */
  async destroy(): Promise<void> {
    this.own.clear()
    await this.vault.destroy()
  }
}
