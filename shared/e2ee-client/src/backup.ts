// Şifreli DM yedeği motoru (E5a §4). Şifre ve KEK bu dosyada yalnız bellekte, yerel BMK Vault'ta (şifreli).
// Sunucu yalnız tuz/parametre/SARILMIŞ anahtar ve şifreli görüntü görür; log'a şifre, anahtar, mesaj yazılmaz.
// Yavaş işler (Argon2, ağ) motor kilidinin DIŞINDA; kilit yalnız depo okuma/yazma için tutulur,
// yoksa 64 MiB türetme ya da 25 MB yükleme sohbeti bloklardı.
import {
  BACKUP_KDF_DEFAULT,
  checkBackupPassword,
  deriveBackupKek,
  newBackupKey,
  newBackupSalt,
  openSnapshot,
  sealSnapshot,
  sha256,
  unwrapBackupKey,
  utf8,
  wrapBackupKey,
  type Argon2idFn,
  type BackupKdfParams,
  type BackupPasswordRejection,
} from '@kankaverse/e2ee-core'
import { fromB64, toB64 } from './b64'
import { missingIds } from './backupExists'
import { buildSnapshot, parseSnapshot, pickCandidates, type SnapshotContent } from './backupSnapshot'
import { collectBodies, dropDeleted, mergeCandidates } from './historyRecords'
import type { E2eeContext } from './context'
import type { StoredMessage } from './localStore'
import { BackupLockedError, BackupNotConfiguredError, e2eeErrorCode } from './errors'
import type { BackupInfo, BackupKeyMaterial, BackupSnapshotInfo, BlobTransport, E2eeApi, Reauth } from './ports'

/** İki yedek arası en az süre (§4.3). */
export const BACKUP_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000

type Configured = Extract<BackupInfo, { configured: true }>
export type PasswordResult = { ok: true; keyVersion: number } | { ok: false; reason: BackupPasswordRejection }

export interface BackupState {
  /** `/e2ee/status.backup`: kapalıysa diğer alanlar boş, sunucuya sorulmaz. */
  enabled: boolean
  configured: boolean
  /** Bu cihazda BMK açık VE sunucudaki anahtar sürümüyle aynı sürümde. */
  unlockedHere: boolean
  keyVersion?: number
  lastBackupAt?: number
  snapshots: BackupSnapshotInfo[]
}

export type BackupRunResult =
  | { status: 'skipped'; reason: 'disabled' | 'busy' | 'no-key' | 'not-dirty' | 'too-soon' }
  | { status: 'uploaded'; messages: number; size: number }
  /** Anahtar sürümü değişmiş ya da yedek kapatılmış: yerel BMK düşürüldü, cihaz "yeniden aç" durumunda. */
  | { status: 'key-dropped' }
  /** Geçici hata (ağ, sunucu, depo). Geri çekilme süresi çağıranın işi. */
  | { status: 'failed'; code?: string }

type SkipReason = Extract<BackupRunResult, { status: 'skipped' }>['reason']
type Prepared =
  | { skipped: SkipReason }
  | { bmk: Uint8Array; keyVersion: number; deviceId: string; records: StoredMessage[] }

export interface RestoreResult {
  restored: number
  skipped: number
  /** Açılamayan (kurcalanmış, bozuk, bilinmeyen sürüm) görüntü sayısı. */
  badSnapshots: number
}

export interface BackupDeps {
  userId: string
  api: E2eeApi
  blob: BlobTransport
  argon2: Argon2idFn
  enabled: boolean
  /** Motorun kilit yolu (`withLock`): depoya dokunan her adım bundan geçer. */
  run: <T>(task: (ctx: E2eeContext) => Promise<T>) => Promise<T>
  log: (message: string, error?: unknown) => void
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

export class BackupManager {
  private running = false
  private d: BackupDeps

  constructor(deps: BackupDeps) {
    this.d = deps
  }

  async backupState(): Promise<BackupState> {
    const { key, flags } = await this.d.run(async (ctx) => ({
      key: await ctx.store.loadBackupKey(),
      flags: await ctx.store.loadFlags(),
    }))
    const base = { enabled: this.d.enabled, configured: false, unlockedHere: false, lastBackupAt: flags.lastBackupAt }
    if (!this.d.enabled) return { ...base, snapshots: [] }
    const { data } = await this.d.api.backupGet()
    if (!data.configured) return { ...base, snapshots: data.snapshots }
    return {
      ...base,
      configured: true,
      unlockedHere: key?.keyVersion === data.keyVersion,
      keyVersion: data.keyVersion,
      snapshots: data.snapshots,
    }
  }

  /** Şifre kuralını geçemezse `ok:false` + sebep döner (fırlatmaz). Sunucu hatası fırlar. */
  async setupBackup(password: string, identity: { username: string; email: string }): Promise<PasswordResult> {
    const check = checkBackupPassword(password, identity)
    if (!check.ok) return check
    const bmk = newBackupKey()
    const keyVersion = 1
    const fresh = await this.freshKek(password)
    const { data } = await this.d.api.backupPutKey({ ...this.keyBody(fresh, bmk, keyVersion), keyVersion })
    await this.adopt(bmk, data.keyVersion)
    return { ok: true, keyVersion: data.keyVersion }
  }

  /** Yanlış şifre `BackupPasswordError` olarak yukarı çıkar. Yedek yoksa `BackupNotConfiguredError`. */
  async unlockBackup(password: string): Promise<{ keyVersion: number }> {
    const info = await this.fetchConfigured()
    const bmk = await this.openKey(password, info)
    await this.adopt(bmk, info.keyVersion)
    return { keyVersion: info.keyVersion }
  }

  /** Aynı BMK yeni şifreyle yeniden sarılır; görüntüler yeniden şifrelenmez, keyVersion değişmez. */
  async changeBackupPassword(
    oldPassword: string,
    newPassword: string,
    identity: { username: string; email: string },
  ): Promise<PasswordResult> {
    const check = checkBackupPassword(newPassword, identity)
    if (!check.ok) return check
    const info = await this.fetchConfigured()
    const bmk = await this.openKey(oldPassword, info) // yanlış eski şifre burada BackupPasswordError
    const fresh = await this.freshKek(newPassword)
    await this.d.api.backupPutKey({ ...this.keyBody(fresh, bmk, info.keyVersion), keyVersion: info.keyVersion })
    await this.d.run((ctx) => ctx.store.saveBackupKey({ bmk, keyVersion: info.keyVersion }))
    return { ok: true, keyVersion: info.keyVersion }
  }

  /** "Şifremi unuttum": yeni BMK, eski görüntüler sunucuda silinir. Yeni görüntü bu cihazdan başlar. */
  async resetBackup(
    newPassword: string,
    identity: { username: string; email: string },
    reauth: Reauth,
  ): Promise<PasswordResult> {
    const check = checkBackupPassword(newPassword, identity)
    if (!check.ok) return check
    const info = await this.fetchConfigured()
    const bmk = newBackupKey()
    // Sürüm AAD'de: sunucu keyVersion+1 verecek, istemci önceden bilmek zorunda.
    const fresh = await this.freshKek(newPassword)
    const { data } = await this.d.api.backupReset({ ...this.keyBody(fresh, bmk, info.keyVersion + 1), ...reauth })
    const keyVersion = data.keyVersion
    if (keyVersion !== info.keyVersion + 1) {
      // Başka cihaz arada sıfırladı: yanlış AAD ile sarılı anahtar yedeği açılmaz kılardı, gerçek sürümle yeniden sar.
      await this.d.api.backupPutKey({ ...this.keyBody(fresh, bmk, keyVersion), keyVersion })
    }
    await this.adopt(bmk, keyVersion)
    return { ok: true, keyVersion }
  }

  /** Sunucudaki anahtar + tüm görüntüler ve bu cihazdaki BMK silinir. */
  async deleteBackup(reauth: Reauth): Promise<void> {
    await this.d.api.backupDelete(reauth)
    await this.d.run(async (ctx) => {
      await ctx.store.deleteBackupKey()
      await ctx.store.patchFlags({ backupDirty: false, backupInFlight: false, lastBackupAt: undefined })
    })
  }

  // ── Yedek alma ────────────────────────────────────────────────────────────

  /**
   * Zamanlayıcı ve arka plana geçiş çağırır. Hiçbir hata fırlatmaz, sonuç nesnesi döner (fail-quiet, §1.6).
   * `manual`: kullanıcının "Şimdi yedekle" düğmesi. YALNIZ 6 saat aralığını atlar; değişiklik yoksa yine
   * `not-dirty` döner (sahip bulgusu 2026-11-12: silme sonrası basınca "güncel" deyip eski görüntüyü bırakıyordu).
   */
  async runBackupIfDue(now: number, opts: { manual?: boolean } = {}): Promise<BackupRunResult> {
    if (!this.d.enabled) return { status: 'skipped', reason: 'disabled' }
    if (this.running) return { status: 'skipped', reason: 'busy' }
    this.running = true
    try {
      return await this.runOnce(now, opts.manual === true)
    } catch (e) {
      this.d.log(`[e2ee] yedek durdu: ${e instanceof Error ? e.name : typeof e}`)
      return { status: 'failed', code: e2eeErrorCode(e) }
    } finally {
      this.running = false
    }
  }

  private async runOnce(now: number, manual: boolean): Promise<BackupRunResult> {
    const prep = await this.d.run((ctx) => this.prepare(ctx, now, manual))
    if ('skipped' in prep) return { status: 'skipped', reason: prep.skipped }
    const { bmk, deviceId, keyVersion } = prep
    try {
      const content = buildSnapshot(deviceId, now, await this.dropDeleted(prep.records))
      const sealed = sealSnapshot(bmk, utf8(JSON.stringify(content)), this.d.userId, deviceId, keyVersion)
      const ref = { deviceId, size: sealed.length, sha256: toHex(sha256(sealed)), keyVersion }
      const { data } = await this.d.api.snapshotPresign(ref)
      await this.d.blob.put(data.url, sealed)
      await this.d.api.snapshotCommit(ref)
      // Dirty'ye dokunulmaz: yükleme sürerken gelen yeni mesaj onu zaten tekrar işaretlemiştir.
      await this.d.run((ctx) => ctx.store.patchFlags({ lastBackupAt: now, backupInFlight: false }))
      return { status: 'uploaded', messages: content.messages.length, size: sealed.length }
    } catch (e) {
      return this.failed(e)
    }
  }

  /**
   * Kilit altında: ön koşullar, görüntü kurma ve "yükleme başladı" işareti. Dirty burada TEMİZLENİR, `inFlight`
   * konur: yükleme sırasında gelen mesaj dirty'yi yeniden açar, süreç yarıda ölürse `inFlight` sonraki turu tetikler.
   */
  private async prepare(ctx: E2eeContext, now: number, manual: boolean): Promise<Prepared> {
    const key = await ctx.store.loadBackupKey()
    if (!key) return { skipped: 'no-key' }
    const flags = await ctx.store.loadFlags()
    if (!flags.backupDirty && !flags.backupInFlight) return { skipped: 'not-dirty' }
    if (!manual && flags.lastBackupAt !== undefined && now - flags.lastBackupAt < BACKUP_MIN_INTERVAL_MS) {
      return { skipped: 'too-soon' }
    }
    const deviceId = (await ctx.getDevice()).deviceId
    if (!deviceId) return { skipped: 'no-key' }
    const records = await collectBodies(ctx) // yalnız gövdesi olanlar (§4.2), bozuk tek kayıt durdurmaz
    await ctx.store.patchFlags({ backupDirty: false, backupInFlight: true })
    return { bmk: key.bmk, keyVersion: key.keyVersion, deviceId, records }
  }

  /**
   * Sunucuda artık olmayan (çevrimdışıyken silinmiş) kayıtları yerelden siler ve listeden çıkarır (§4.7).
   * Ağ, kilit DIŞINDA; hata fırlar ve görüntü o tur yüklenmez (kirli kalır, `failed`).
   */
  private dropDeleted(records: StoredMessage[]): Promise<StoredMessage[]> {
    return dropDeleted(this.d.api, this.d.run, records)
  }

  /** 409 (sürüm değişti) ve 404 (yedek kapatıldı): yerel BMK artık geçersiz, düşürülür. Diğerleri tekrar denenir. */
  private async failed(e: unknown): Promise<BackupRunResult> {
    const code = e2eeErrorCode(e)
    this.d.log(`[e2ee] yedek yüklenemedi: ${code ?? (e instanceof Error ? e.name : typeof e)}`)
    const stale = code === 'E2EE_BACKUP_KEY_VERSION' || code === 'E2EE_BACKUP_NOT_CONFIGURED'
    await this.d.run(async (ctx) => {
      if (stale) await ctx.store.deleteBackupKey()
      await ctx.store.patchFlags({ backupDirty: true, backupInFlight: false })
    })
    return stale ? { status: 'key-dropped' } : { status: 'failed', code }
  }

  // ── Geri yükleme ──────────────────────────────────────────────────────────

  /**
   * Tüm görüntüleri indirip açar ve yerelle birleştirir (§4.5). Ağ hatası fırlar (kullanıcı tekrar dener);
   * açılamayan görüntü atlanır ve sayılır. `accessibleEncryptedChannelIds` dışındaki kanalın kaydı yazılmaz.
   */
  async restoreBackup(accessibleEncryptedChannelIds: string[]): Promise<RestoreResult> {
    const key = await this.d.run((ctx) => ctx.store.loadBackupKey())
    if (!key) throw new BackupLockedError()
    const { data: info } = await this.d.api.backupGet()
    const snapshots: SnapshotContent[] = []
    let badSnapshots = 0
    for (const s of info.snapshots) {
      const content = await this.download(s.deviceId, key.bmk, key.keyVersion)
      if (content) snapshots.push(content)
      else badSnapshots++
    }
    const allowed = new Set(accessibleEncryptedChannelIds)
    const picked = [...pickCandidates(snapshots).values()]
    // Sunucuda silinmiş mesaj geri gelmez (§4.7). Kontrol başarısızsa hiçbir şey yazılmaz (hata fırlar).
    const gone = await missingIds(this.d.api, picked.filter((m) => allowed.has(m.channelId)), false)
    const candidates = picked.filter((m) => !gone.has(m.id))
    const counts = await this.d.run(async (ctx) => {
      const restored = await mergeCandidates(ctx, candidates, allowed) // yazılırsa bu cihazın görüntüsü de güncellenir
      return { restored, skipped: picked.length - restored }
    })
    return { ...counts, badSnapshots }
  }

  /** `null` = görüntü bozuk (özet tutmadı, açılamadı, sürüm/cihaz uyuşmadı). Ağ hatası fırlar. */
  private async download(deviceId: string, bmk: Uint8Array, keyVersion: number): Promise<SnapshotContent | null> {
    const { data } = await this.d.api.snapshotGetUrl(deviceId)
    const bytes = await this.d.blob.get(data.url)
    try {
      if (toHex(sha256(bytes)) !== data.sha256) return null
      const plain = openSnapshot(bmk, bytes, this.d.userId, deviceId, keyVersion)
      return parseSnapshot(plain, deviceId)
    } catch {
      return null
    }
  }

  // ── Anahtar yardımcıları ──────────────────────────────────────────────────

  private async fetchConfigured(): Promise<Configured> {
    const { data } = await this.d.api.backupGet()
    if (!data.configured) throw new BackupNotConfiguredError()
    return data
  }

  /** Sunucudaki başlıkla (indirilen parametreler dahil; taban denetimi core'da) KEK türetir, BMK'yi açar. */
  private async openKey(password: string, info: Configured): Promise<Uint8Array> {
    const kek = await deriveBackupKek(password, fromB64(info.salt), info.params, this.d.argon2)
    return unwrapBackupKey(kek, fromB64(info.wrappedKey), this.d.userId, info.keyVersion)
  }

  /** Yeni tuz + hedef parametrelerle şifreden KEK türetir (yavaş; kilit dışında). */
  private async freshKek(password: string): Promise<FreshKek> {
    const salt = newBackupSalt()
    const params = BACKUP_KDF_DEFAULT
    return { salt, params, kek: await deriveBackupKek(password, salt, params, this.d.argon2) }
  }

  /** BMK'yi KEK ile sarar; sunucuya giden gövde (tuz + parametre + sarılmış anahtar). */
  private keyBody(f: FreshKek, bmk: Uint8Array, keyVersion: number): BackupKeyMaterial {
    const wrapped = wrapBackupKey(f.kek, bmk, this.d.userId, keyVersion)
    return { salt: toB64(f.salt), params: f.params, wrappedKey: toB64(wrapped) }
  }

  /** Yeni anahtar bu cihaza yazılır; bu anahtarla bu cihazdan henüz yedek yok: ilk fırsatta alınsın. */
  private adopt(bmk: Uint8Array, keyVersion: number): Promise<void> {
    return this.d.run(async (ctx) => {
      await ctx.store.saveBackupKey({ bmk, keyVersion })
      await ctx.store.patchFlags({ backupDirty: true, backupInFlight: false, lastBackupAt: undefined })
    })
  }
}

interface FreshKek {
  salt: Uint8Array
  params: BackupKdfParams
  kek: Uint8Array
}
