// E7 kimlik yöneticisi (§4.4-4.8). Kripto e2ee-core'da; burada geçiş, imza yolları, sıfırlama ve güvenlik kodu.
// 🔴 R7: imzayı yalnız kimliği TAŞIYAN cihaz atar; kimlik bu cihaza ancak üç yoldan gelir: ilk kurulum (geçiş),
// yedek (BMK ile sarılı) ve aktarım (kodla doğrulanmış kanal). Sunucunun kimliğiyle yereldeki uyuşmazsa yerel
// kimlik düşer (başka cihazda sıfırlandı); sunucudan gelen açık anahtar ASLA özel anahtar yerine geçmez.
// Hata politikası: `sync` fail-quiet (sohbeti engellemez, log'a yazar); kullanıcı eylemleri (sıfırla) hata fırlatır.
import {
  createIdentity,
  identityFromPrivate,
  safetyCode,
  signDevice,
  unwrapIdentity,
  verifyDevice,
  wrapIdentity,
  type IdentityKeyPair,
  type PublicIdentity,
} from '@kankaverse/e2ee-core'
import { fromB64, toB64 } from './b64'
import type { E2eeContext } from './context'
import { e2eeErrorCode } from './errors'
import type { E2eeApi, E2eeIdentityInfo, E2eeUserDevice, Reauth } from './ports'

export interface IdentityDeps {
  userId: string
  api: E2eeApi
  /** `/e2ee/status.identity`: kapalıysa yazma yok (okuma tarafı sunucu yanıtındaki alanlarla yine çalışır). */
  enabled: boolean
  run: <T>(task: (ctx: E2eeContext) => Promise<T>) => Promise<T>
  log: (message: string, error?: unknown) => void
}

/** Ayarlar → Cihazlar satırı (§4.8). */
export interface OwnDeviceView {
  deviceId: string
  platform: string
  createdAt: string
  verified: boolean
  current: boolean
}

/** Güvenlik kodu ekranı (§4.7). `null` = kişinin kimliği henüz yok ("güncelleyince görünecek"). */
export interface SafetyCodeView {
  groups: string[]
  verified: boolean
}

/** Aktarımda taşınan kimlik (yük içinde, kodla doğrulanmış kanalda). */
export interface TransferIdentity {
  priv: string
  version: number
}

const toPublic = (info: E2eeIdentityInfo): PublicIdentity => ({
  publicKey: fromB64(info.publicKey),
  version: info.version,
})

/** Base64 karşılaştırması: aynı bayt aynı metin (standart, dolgulu base64 tek biçimlidir). */
const sameIdentity = (local: IdentityKeyPair, server: E2eeIdentityInfo) =>
  local.version === server.version && toB64(local.publicKey) === server.publicKey

const isSigned = (identity: PublicIdentity, userId: string, d: E2eeUserDevice) =>
  verifyDevice(identity, userId, {
    deviceId: d.deviceId,
    signatureKey: fromB64(d.signatureKey),
    identitySig: d.identitySig ? fromB64(d.identitySig) : null,
    identityVersion: d.identityVersion,
  })

export class IdentityManager {
  private d: IdentityDeps
  /** Aynı anda tek eşitleme: açılış + yedek açma çakışırsa ikinci çağrı ilkini bekler (çift kurulum denemesi yok). */
  private inflight: Promise<void> | null = null

  constructor(deps: IdentityDeps) {
    this.d = deps
  }

  /**
   * Açılışta, yedek açılınca ve aktarım sonrası çağrılır; tekrar çağrılması güvenlidir (idempotent).
   * Sırası: (1) sunucuda kimlik yoksa kur (geçiş, §4.4); (2) yereldeki bayatsa düşür; (3) yerelde yoksa yedekten
   * al; (4) kimlik buradaysa bu cihazı imzala ve yedekte sarılı kopyası güncel mi bak. Hiçbir hata fırlatmaz.
   */
  sync(): Promise<void> {
    if (!this.d.enabled) return Promise.resolve()
    this.inflight ??= this.syncOnce()
      .catch((e) => this.d.log('[e2ee] kimlik eşitlenemedi', e))
      .finally(() => {
        this.inflight = null
      })
    return this.inflight
  }

  private async syncOnce(): Promise<void> {
    let own = (await this.d.api.userDevices(this.d.userId)).data
    let local = await this.d.run((ctx) => ctx.store.loadIdentity())
    if (!own.identity) {
      if (await this.createFirst(own.devices)) return
      own = (await this.d.api.userDevices(this.d.userId)).data // yarışı başka cihaz kazandı
      if (!own.identity) return
    }
    const server = own.identity
    if (local && !sameIdentity(local, server)) {
      await this.d.run((ctx) => ctx.store.deleteIdentity()) // başka cihazda sıfırlandı: eski kimlik işe yaramaz
      local = null
    }
    if (!local) local = await this.fromBackup(server)
    if (!local) return // imzasız kalır; yollar: yedek şifresi, aktarım, "Bu cihazı doğrula"
    await this.signThisDevice(local, own.devices)
    await this.ensureBackupCopy(local)
  }

  /** §4.4 geçiş: yeni kimlik, kendi etkin cihazlarının hepsi imzalanır (bugünkü güven bir kez kabul, kurul k.5). */
  private async createFirst(devices: E2eeUserDevice[]): Promise<boolean> {
    const identity = createIdentity(1)
    const signatures = devices.map((dev) => ({
      deviceId: dev.deviceId,
      sig: toB64(signDevice(identity, this.d.userId, dev.deviceId, fromB64(dev.signatureKey))),
    }))
    try {
      await this.d.api.identityCreate({ publicKey: toB64(identity.publicKey), signatures })
    } catch (e) {
      if (e2eeErrorCode(e) === 'E2EE_IDENTITY_EXISTS') return false
      throw e
    }
    await this.d.run((ctx) => ctx.store.saveIdentity(identity))
    await this.ensureBackupCopy(identity)
    return true
  }

  /** §4.5-1: BMK bu cihazda açıksa yedekteki sarılı kimliği açar. Sunucunun açık anahtarıyla tutmazsa almaz. */
  private async fromBackup(server: E2eeIdentityInfo): Promise<IdentityKeyPair | null> {
    const bmk = await this.d.run((ctx) => ctx.store.loadBackupKey())
    if (!bmk) return null
    const { data } = await this.d.api.backupGet()
    if (!data.configured || data.keyVersion !== bmk.keyVersion) return null
    if (!data.wrappedIdentity || data.identityVersion !== server.version) return null
    let identity: IdentityKeyPair
    try {
      identity = unwrapIdentity(bmk.bmk, fromB64(data.wrappedIdentity), this.d.userId, server.version, bmk.keyVersion)
    } catch (e) {
      this.d.log('[e2ee] yedekteki kimlik açılamadı', e)
      return null
    }
    if (!sameIdentity(identity, server)) return null
    await this.d.run((ctx) => ctx.store.saveIdentity(identity))
    return identity
  }

  private async signThisDevice(identity: IdentityKeyPair, devices: E2eeUserDevice[]): Promise<void> {
    const deviceId = await this.ownDeviceId()
    const dev = devices.find((x) => x.deviceId === deviceId)
    if (!dev || isSigned(identity, this.d.userId, dev)) return
    const sig = signDevice(identity, this.d.userId, dev.deviceId, fromB64(dev.signatureKey))
    await this.d.api.signDevice(dev.deviceId, { identityVersion: identity.version, sig: toB64(sig) })
  }

  /** BMK bu cihazda açıksa ve yedekteki kopya yoksa/eskiyse sarıp yazar. 409 (arada sıfırlandı) sessizce geçilir. */
  private async ensureBackupCopy(identity: IdentityKeyPair): Promise<void> {
    const bmk = await this.d.run((ctx) => ctx.store.loadBackupKey())
    if (!bmk) return
    const { data } = await this.d.api.backupGet()
    if (!data.configured || data.keyVersion !== bmk.keyVersion) return
    if (data.wrappedIdentity && data.identityVersion === identity.version) return
    const wrapped = wrapIdentity(bmk.bmk, identity, this.d.userId, bmk.keyVersion)
    try {
      await this.d.api.backupPutIdentity({
        wrappedIdentity: toB64(wrapped),
        identityVersion: identity.version,
        keyVersion: bmk.keyVersion,
      })
    } catch (e) {
      const code = e2eeErrorCode(e)
      if (code !== 'E2EE_BACKUP_KEY_VERSION' && code !== 'E2EE_IDENTITY_VERSION') throw e
    }
  }

  // ── Aktarım (§4.5-2, -3) ──────────────────────────────────────────────────

  /** Eski cihaz (O): yükle gönderilecek kimlik; bu cihaz taşımıyorsa null. */
  async exportForTransfer(): Promise<TransferIdentity | null> {
    const local = await this.d.run((ctx) => ctx.store.loadIdentity())
    return local ? { priv: toB64(local.privateKey), version: local.version } : null
  }

  /**
   * Yeni cihaz (N): kodla doğrulanmış yükten gelen kimliği alır. Sunucudaki açık anahtarla tutmazsa ALINMAZ
   * (eski cihaz bayat kimlik taşıyor olabilir). Tutarsa saklar, bu cihazı imzalar.
   */
  async adoptFromTransfer(t: TransferIdentity): Promise<boolean> {
    if (!this.d.enabled) return false
    const own = (await this.d.api.userDevices(this.d.userId)).data
    if (!own.identity) return false
    let identity: IdentityKeyPair
    try {
      identity = identityFromPrivate(fromB64(t.priv), t.version)
    } catch {
      return false
    }
    if (!sameIdentity(identity, own.identity)) return false
    await this.d.run((ctx) => ctx.store.saveIdentity(identity))
    await this.signThisDevice(identity, own.devices)
    await this.ensureBackupCopy(identity)
    return true
  }

  // ── Sıfırlama (§4.6) ──────────────────────────────────────────────────────

  /** Reauth ile yeni kimlik; yalnız bu cihaz imzalanır. Kişilerde "kod değişti" satırı çıkar. Hata fırlatır. */
  async reset(reauth: Reauth): Promise<{ version: number }> {
    const own = (await this.d.api.userDevices(this.d.userId)).data
    const next = (own.identity?.version ?? 0) + 1
    const identity = createIdentity(next)
    const deviceId = await this.ownDeviceId()
    const dev = own.devices.find((x) => x.deviceId === deviceId)
    const signatures = dev
      ? [{ deviceId, sig: toB64(signDevice(identity, this.d.userId, deviceId, fromB64(dev.signatureKey))) }]
      : []
    const { data } = await this.d.api.identityReset({
      publicKey: toB64(identity.publicKey),
      signatures,
      ...reauth,
    })
    // Sunucu sürümü bizim hesapladığımızdan farklıysa (arada başka sıfırlama) imzalar zaten reddedilirdi.
    await this.d.run((ctx) => ctx.store.saveIdentity({ ...identity, version: data.version }))
    await this.ensureBackupCopy({ ...identity, version: data.version })
    return data
  }

  // ── Görünüm (§4.7-4.8) ────────────────────────────────────────────────────

  /** Kendi cihazlarım ve her birinin doğrulanmış olup olmadığı (sunucunun bildirdiği kimlikle). */
  async ownDevices(): Promise<{ hasIdentity: boolean; thisDeviceVerified: boolean; devices: OwnDeviceView[] }> {
    const own = (await this.d.api.userDevices(this.d.userId)).data
    const current = await this.ownDeviceId()
    const local = await this.d.run((ctx) => ctx.store.loadIdentity())
    // Bu cihaz kimliği taşıyorsa onun açık anahtarı esastır (sunucunun söylediği değil).
    const identity = local ?? (own.identity ? toPublic(own.identity) : null)
    const devices = own.devices.map((dev) => ({
      deviceId: dev.deviceId,
      platform: dev.platform,
      createdAt: dev.createdAt,
      verified: identity ? isSigned(identity, this.d.userId, dev) : false,
      current: dev.deviceId === current,
    }))
    return {
      hasIdentity: identity !== null,
      thisDeviceVerified: devices.some((x) => x.current && x.verified),
      devices,
    }
  }

  /** Bu cihaz kimliği taşıyor mu (sıfırlama yalnız taşımayan cihazda anlamlı, §4.6). */
  hasLocalIdentity(): Promise<boolean> {
    return this.d.run(async (ctx) => (await ctx.store.loadIdentity()) !== null)
  }

  /**
   * İki kişinin güvenlik kodu. Karşı tarafın kimliği SABİTLENMİŞ olandır (sunucu o an başka bir şey söylese de);
   * kendi kimliğim bu cihazdakidir, yoksa sunucununki. Biri yoksa null.
   */
  async safetyCode(otherUserId: string): Promise<SafetyCodeView | null> {
    const { pin, local } = await this.d.run(async (ctx) => ({
      pin: (await ctx.store.loadPins())[otherUserId],
      local: await ctx.store.loadIdentity(),
    }))
    if (!pin) return null
    let mine: PublicIdentity | null = local
    if (!mine) {
      const server = (await this.d.api.userDevices(this.d.userId)).data.identity
      mine = server ? toPublic(server) : null
    }
    if (!mine) return null
    const groups = safetyCode(
      { userId: this.d.userId, identity: mine },
      { userId: otherUserId, identity: { publicKey: fromB64(pin.publicKey), version: pin.version } },
    )
    return { groups, verified: pin.verified }
  }

  /** "Doğrulandı olarak işaretle" / "İşareti kaldır". Yalnız bu cihazda (§10-2). */
  async setVerified(otherUserId: string, verified: boolean): Promise<void> {
    await this.d.run(async (ctx) => {
      const pins = await ctx.store.loadPins()
      const pin = pins[otherUserId]
      if (!pin) return
      const { verifiedAt: _old, ...rest } = pin
      pins[otherUserId] = verified ? { ...rest, verified: true, verifiedAt: Date.now() } : { ...rest, verified: false }
      await ctx.store.savePins(pins)
    })
  }

  private async ownDeviceId(): Promise<string> {
    return this.d.run(async (ctx) => (await ctx.getDevice()).deviceId ?? '')
  }
}
