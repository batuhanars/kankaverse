// Platforma özgü kısımların arayüzleri (E1 §6.3). Motor bunları kullanır, uygulamaz: web ve mobil
// kendi adaptörlerini enjekte eder. Böylece MLS akışı tek yerde durur, depolama/ağ/kilit istemciye ait kalır.
import type { Argon2idFn, BackupKdfParams, CryptoProvider } from '@kankaverse/e2ee-core'

/** Sunucunun cihaz kaydı için döndürdüğü cihaz bilgisi (iptal edilmişler dahil). */
export interface E2eeDeviceInfo {
  deviceId: string
  signatureKey: string
  revokedAt: string | null
}

export interface E2eeChannelState {
  encrypted: boolean
  epoch: number | null
  groupId: string | null
  createdAt: string | null
  members: { userId: string; devices: E2eeDeviceInfo[] }[]
}

export interface E2eeCommitRow {
  epoch: number
  commit: string
  senderDeviceId: string
}

export interface E2eeWelcomeRow {
  id: string
  channelId: string
  epoch: number
  welcome: string
}

export interface E2eeWelcomeItem {
  deviceId: string
  welcome: string
}

/** Envelope açılmış yanıt: `data` gerçek yük (axios yanıtıyla aynı şekil). */
export interface Reply<T> {
  data: T
}

/** Yedek uçlarının yük şekilleri (E5a §3.2). Baytlar base64; `keyVersion` anahtar sürümü. */
export interface BackupKeyMaterial {
  salt: string
  params: BackupKdfParams
  wrappedKey: string
}

/** Hassas işlem doğrulaması (Sprint 2B reauth): mevcut şifre, 2FA varsa TOTP. */
export interface Reauth {
  currentPassword: string
  totpCode?: string
}

export interface BackupSnapshotInfo {
  deviceId: string
  size: number
  updatedAt: string
}

/** `GET /e2ee/backup`: yedek kurulu değilse yalnız `configured: false` ve görüntü listesi. */
export type BackupInfo =
  | { configured: false; snapshots: BackupSnapshotInfo[] }
  | ({ configured: true; keyVersion: number; snapshots: BackupSnapshotInfo[] } & BackupKeyMaterial)

/** Görüntü yükleme/commit gövdesi: `sha256` şifreli baytların küçük harf hex özeti. */
export interface SnapshotRef {
  deviceId: string
  size: number
  sha256: string
  keyVersion: number
}

/**
 * Sunucu uçları (E1 §2). Baytlar base64 metin. Hata, `response.data.error` makine kodunu taşıyan bir
 * nesne olarak fırlatılır (axios hatası zaten böyle; mobil adaptör aynı şekli üretir).
 */
export interface E2eeApi {
  /** `franking`: E4 §2.2, true iken istemci v2 yük (parmak izi) gönderir; eski sunucuda yok = false. */
  status(): Promise<Reply<{ enabled: boolean; franking?: boolean; backup?: boolean }>>
  /** Platform bilgisini (web/android) adaptör ekler; motor bilmez. */
  registerDevice(signatureKey: string): Promise<Reply<{ deviceId: string }>>
  available(): Promise<Reply<{ available: number }>>
  uploadKeyPackages(
    keyPackages: string[],
    lastResort?: string,
  ): Promise<Reply<{ available: number }>>
  channelState(channelId: string): Promise<Reply<E2eeChannelState>>
  claim(
    channelId: string,
    deviceIds: string[],
  ): Promise<Reply<{ deviceId: string; keyPackage: string }[]>>
  createGroup(
    channelId: string,
    groupId: string,
    commit: string,
    welcomes: E2eeWelcomeItem[],
  ): Promise<Reply<{ epoch: number }>>
  postCommit(
    channelId: string,
    epoch: number,
    commit: string,
    welcomes: E2eeWelcomeItem[],
  ): Promise<Reply<{ epoch: number }>>
  commits(channelId: string, since: number): Promise<Reply<E2eeCommitRow[]>>
  welcomes(): Promise<Reply<E2eeWelcomeRow[]>>
  ackWelcome(id: string): Promise<Reply<null>>
  /** E5a yedek uçları (§3.2). Hata kodları: E2EE_BACKUP_KEY_VERSION (409), E2EE_BACKUP_NOT_CONFIGURED (404) vb. */
  backupGet(): Promise<Reply<BackupInfo>>
  /** Kurulum (keyVersion 1) ya da şifre değişimi (aynı keyVersion, yeniden sarma). */
  backupPutKey(body: BackupKeyMaterial & { keyVersion: number }): Promise<Reply<{ keyVersion: number }>>
  /** "Şifremi unuttum": reauth + yeni anahtar kaydı. keyVersion sunucuda +1, yanıtta döner. */
  backupReset(body: BackupKeyMaterial & Reauth): Promise<Reply<{ keyVersion: number }>>
  backupDelete(reauth: Reauth): Promise<Reply<null>>
  snapshotPresign(ref: SnapshotRef): Promise<Reply<{ url: string }>>
  snapshotCommit(ref: SnapshotRef): Promise<Reply<{ deviceId: string; size: number; keyVersion: number }>>
  /** Kendi görüntüm için kısa ömürlü indirme adresi + bütünlük özeti. */
  snapshotGetUrl(
    deviceId: string,
  ): Promise<Reply<{ url: string; deviceId: string; size: number; sha256: string; keyVersion: number }>>
}

/**
 * Presigned adrese ham bayt aktarımı (E5a §4). Gövde `application/octet-stream`; Authorization BAŞLIĞI
 * GÖNDERİLMEZ (adres kendi imzasını taşır, API token'ı depoya sızmasın). Hata fırlatır.
 */
export interface BlobTransport {
  put(url: string, bytes: Uint8Array): Promise<void>
  get(url: string): Promise<Uint8Array>
}

/** Vault bölümleri: cihaz anahtarları, MLS grup durumu, çözülmüş mesajlar. */
export type VaultStore = 'device' | 'groups' | 'messages'

/**
 * Şifreli yerel depo, kullanıcı başı. Şifreleme adaptörün işidir (depo anahtarı, rastgele IV, AAD=konum);
 * motor yalnız düz baytları verir/alır. Bozuk/çözülemeyen kayıt hata fırlatır (sessizce null DEĞİL).
 */
export interface Vault {
  get(store: VaultStore, key: string): Promise<Uint8Array | null>
  put(store: VaultStore, key: string, bytes: Uint8Array): Promise<void>
  delete(store: VaultStore, key: string): Promise<void>
  /** Bölümdeki tüm anahtarlar (yedek görüntüsü `messages` bölümünü bununla gezer). */
  keys(store: VaultStore): Promise<string[]>
  /** Cihaz + grup durumunu siler, çözülmüş mesajlar kalır (oturum zinciri değişti, anahtarlar geçersiz). */
  resetDeviceState(): Promise<void>
  /** Bu kullanıcının tüm deposunu (anahtar dahil) siler. */
  destroy(): Promise<void>
}

/** Aynı ada sahip işler art arda çalışır (web: SerialQueue + Web Locks; mobil: yalnız SerialQueue). */
export type WithLock = <T>(name: string, task: () => Promise<T>) => Promise<T>

export type WarningKind = 'unknown-device' | 'removed' | 'device-broken'
export type WarningHandler = (channelId: string, kind: WarningKind) => void

/** Motoru kuran platform bağımlılıkları. */
export interface EngineDeps {
  api: E2eeApi
  /** Kullanıcının şifreli deposunu açar (web: önce başka hesapların kalıntısını siler). */
  openVault(userId: string): Promise<Vault>
  withLock: WithLock
  /** Web: webProvider (WebCrypto). Mobil: pureProvider (saf noble). */
  provider: CryptoProvider
  /** Yedek anahtarı türetimi (E5a §2.4): web Worker'da noble, mobil native modül. */
  argon2: Argon2idFn
  /** Yedek görüntüsünü presigned adrese yükler/indirir. */
  blob: BlobTransport
  onWarn: WarningHandler
  /** İsteğe bağlı günlük; içerik (mesaj metni, anahtar) ASLA verilmez. Varsayılan: console.error. */
  log?: (message: string, error?: unknown) => void
  /**
   * Toplu çözmede iki mesaj arasında olay döngüsüne dönmek için (mobil: setTimeout 0). Yoksa (web) dönülmez.
   * Neden: ardışık `await` mikro görevdir, JS iş parçacığını bırakmaz; çözme ~70 ms/mesaj, arayüz donardı.
   */
  yieldToUi?: () => Promise<void>
  /** İsteğe bağlı ölçüm: yalnız süre (ms) ve adet. İçerik ASLA verilmez. */
  metric?: (name: string, ms: number, count: number) => void
}
