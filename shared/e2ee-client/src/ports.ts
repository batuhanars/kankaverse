// Platforma özgü kısımların arayüzleri (E1 §6.3). Motor bunları kullanır, uygulamaz: web ve mobil
// kendi adaptörlerini enjekte eder. Böylece MLS akışı tek yerde durur, depolama/ağ/kilit istemciye ait kalır.
import type { Argon2idFn, BackupKdfParams, CryptoProvider } from '@kankaverse/e2ee-core'

/** Sunucunun cihaz kaydı için döndürdüğü cihaz bilgisi (iptal edilmişler dahil). */
export interface E2eeDeviceInfo {
  deviceId: string
  signatureKey: string
  revokedAt: string | null
  /** E7: sahibin kimlik anahtarının bu cihaza attığı imza (base64); yoksa/bayrak kapalıysa null ya da alan yok. */
  identitySig?: string | null
  identityVersion?: number | null
}

/** E7: kullanıcının kimlik açık anahtarı (base64) ve sürümü. */
export interface E2eeIdentityInfo {
  publicKey: string
  version: number
}

/** Kanal üyesi: cihazları (iptaller dahil) ve katılım zamanı (E2 §2.3; yalnız GROUP_DM'de dolu, 1-1'de null). */
export interface E2eeMemberInfo {
  userId: string
  joinedAt?: string | null
  /** E7: kimlik yoksa, bayrak kapalıysa ya da eski sunucuda null/yok: istemci bugünkü davranışa döner. */
  identity?: E2eeIdentityInfo | null
  devices: E2eeDeviceInfo[]
}

/** Gruptan ayrılmış/çıkarılmış üye: yaprakları hâlâ gruptayken doğrulama onları tanımalı (E2 §2.3). */
export interface E2eeFormerMemberInfo {
  userId: string
  leftAt: string
  devices: E2eeDeviceInfo[]
}

export interface E2eeChannelState {
  encrypted: boolean
  epoch: number | null
  groupId: string | null
  createdAt: string | null
  members: E2eeMemberInfo[]
  /** E2 §2.3: 1-1'de hep []. Eski sunucu yanıtında/önbelleğinde yok sayılır. */
  formerMembers?: E2eeFormerMemberInfo[]
}

/** Cihaz görünümünün çıkarıldığı alt küme (önbelleğe de bu yazılır, E3 §9.1). */
export type E2eeViewSnapshot = Pick<E2eeChannelState, 'members' | 'formerMembers' | 'createdAt'>

export interface E2eeCommitRow {
  epoch: number
  commit: string
  senderDeviceId: string
  /** Commit'in sunucuca kabul zamanı (ISO). Eski sunucuda yok: "yeni cihaz" satırı yerel saatle yazılır. */
  createdAt?: string
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
  | ({
      configured: true
      keyVersion: number
      snapshots: BackupSnapshotInfo[]
      /** E7 §2.3: BMK ile sarılı kimlik (base64) ve sürümü; yoksa null/alan yok. */
      wrappedIdentity?: string | null
      identityVersion?: number | null
    } & BackupKeyMaterial)

/** E7: `GET /e2ee/users/:userId/devices` cihaz satırı (yalnız etkinler). */
export interface E2eeUserDevice {
  deviceId: string
  platform: string
  signatureKey: string
  createdAt: string
  identitySig: string | null
  identityVersion: number | null
  /** C79: yalnız KENDİ listende gelir (oturumun cihaz adı, son kullanım). Başkasının listesinde alan yoktur. */
  label?: string | null
  activityAt?: string | null
}

/** C79: sınır doluyken yer açmak için çıkarılan cihaz (`POST /e2ee/devices` yanıtı). */
export interface EvictedDevice {
  platform: string
  label: string | null
  activityAt: string
}

/** E7: kimlik kurulum/sıfırlama gövdesi. İmzalar yalnız çağıranın kendi etkin cihazlarına. */
export interface IdentityMaterial {
  publicKey: string
  signatures: { deviceId: string; sig: string }[]
}

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
/** E7 §5.4: `messagesExist(…, true)` yanıtındaki üst veri (içerik yok). `createdAt` ISO. */
export interface ExistingMeta {
  id: string
  createdAt: string
  author: { id: string; username: string; avatarUrl: string | null; avatarAnimatedUrl?: string | null }
}

export interface E2eeApi {
  /** `franking`: E4 §2.2, true iken istemci v2 yük (parmak izi) gönderir; eski sunucuda yok = false. */
  status(): Promise<
    Reply<{ enabled: boolean; franking?: boolean; backup?: boolean; transfer?: boolean; identity?: boolean }>
  >
  /** Platform bilgisini (web/android) adaptör ekler; motor bilmez. */
  registerDevice(signatureKey: string): Promise<Reply<{ deviceId: string; evicted?: EvictedDevice | null }>>
  available(): Promise<Reply<{ available: number }>>
  /** C69: park cihazı yeniden bağlama. Nonce base64(32 bayt), 2 dk, tek kullanımlık. */
  rebindChallenge(): Promise<Reply<{ nonce: string }>>
  /** Ham Ed25519 imzası base64(64 bayt). Hata: 400 E2EE_REBIND_NONCE_INVALID, 403 E2EE_REBIND_REJECTED. */
  rebind(deviceId: string, signature: string): Promise<Reply<{ deviceId: string }>>
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
  /**
   * E5a Rev.2 §4.7: kanalda hâlâ var olan (silinmemiş) mesaj kimlikleri; `ids` 1..500. İçerik yok.
   * E7 §5.4: `meta` true ise var olanların yazanı ve zamanı da döner (yerel arama sonucu).
   */
  messagesExist(
    channelId: string,
    ids: string[],
    meta?: boolean,
  ): Promise<Reply<{ existing: string[]; meta?: ExistingMeta[] }>>
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
  /** E5b aktarım uçları (§3.2). Çağıranın cihazı oturumdan çözülür. 410 E2EE_TRANSFER_EXPIRED, 409 _STATE, 403 _ROLE. */
  transferCreate(commit: string): Promise<Reply<{ id: string; expiresAt: string }>>
  transferPending(): Promise<Reply<TransferPending | null>>
  transferGet(id: string): Promise<Reply<TransferView>>
  transferAccept(id: string, pub: string): Promise<Reply<{ id: string; status: TransferStatus }>>
  transferReveal(id: string, pub: string, nonce: string): Promise<Reply<{ id: string; status: TransferStatus }>>
  transferUpload(id: string, blob: { size: number; sha256: string }): Promise<Reply<{ url: string }>>
  transferCommit(id: string, blob: { size: number; sha256: string }): Promise<Reply<{ id: string; status: TransferStatus }>>
  transferBlob(id: string): Promise<Reply<{ url: string; size: number; sha256: string }>>
  transferDone(id: string): Promise<Reply<{ id: string; status: TransferStatus }>>
  transferCancel(id: string): Promise<Reply<{ id: string; status: TransferStatus }>>
  /** E7 §3.2: kullanıcının kimliği ve etkin cihazları (kendisi ya da ortak DM). */
  userDevices(userId: string): Promise<Reply<{ identity: E2eeIdentityInfo | null; devices: E2eeUserDevice[] }>>
  /** İlk kurulum (sürüm 1). Kimlik varsa 409 E2EE_IDENTITY_EXISTS. */
  identityCreate(body: IdentityMaterial): Promise<Reply<{ version: number }>>
  /** Sıfırlama: reauth, sürüm sunucuda +1 (imzalar o sürümle atılmış olmalı). */
  identityReset(body: IdentityMaterial & Reauth): Promise<Reply<{ version: number }>>
  /** Kendi etkin cihazına imza. 409 E2EE_IDENTITY_VERSION, 404 E2EE_IDENTITY_NOT_FOUND. */
  signDevice(deviceId: string, body: { identityVersion: number; sig: string }): Promise<Reply<null>>
  /** Kimliği BMK ile sarılı olarak yedeğe yazar. 409 E2EE_BACKUP_KEY_VERSION / E2EE_IDENTITY_VERSION. */
  backupPutIdentity(body: { wrappedIdentity: string; identityVersion: number; keyVersion: number }): Promise<Reply<null>>
}

/** E5b: cihaz bilgisi (onay ekranı). `name` oturumdaki cihaz adı ("Chrome, Windows"); IP yok. */
export interface TransferDeviceInfo {
  platform: string | null
  name: string | null
  createdAt: string | null
}

/** `GET /e2ee/transfer/pending`: eski cihaza gösterilecek açık istek. */
export interface TransferPending {
  id: string
  newDevice: TransferDeviceInfo
  createdAt: string
  expiresAt: string
}

export type TransferStatus = 'PENDING' | 'ACCEPTED' | 'REVEALED' | 'UPLOADED' | 'DONE' | 'CANCELLED' | 'EXPIRED'

/** `GET /e2ee/transfer/:id`: rolüne göre karşı tarafın açık malzemesi (base64). */
export interface TransferView {
  id: string
  status: TransferStatus
  expiresAt: string
  newDeviceId: string
  oldDeviceId: string | null
  /** Yalnız yeni cihaza: eski cihazın geçici açık anahtarı. */
  oldPub?: string
  /** Yalnız eski cihaza: taahhüt ve (açıldıysa) yeni cihazın anahtarı + rastgeleliği. */
  commit?: string
  newPub?: string
  nonce?: string
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
  /**
   * İsteğe bağlı toplu okuma (E7 §5.3 ölçümü): bölümün tüm satırları tek seferde. Mobilde tek tek okuma köprü
   * çağrısı başına ~7 ms; 10 bin kayıtta toplu okuma 35 kat hızlı. Açılamayan satır atlanır. Yoksa keys + get.
   */
  entries?(store: VaultStore): Promise<[string, Uint8Array][]>
  /** Cihaz + grup durumunu siler, çözülmüş mesajlar kalır (oturum zinciri değişti, anahtarlar geçersiz). */
  resetDeviceState(): Promise<void>
  /** Bu kullanıcının tüm deposunu (anahtar dahil) siler. */
  destroy(): Promise<void>
}

/** Aynı ada sahip işler art arda çalışır (web: SerialQueue + Web Locks; mobil: yalnız SerialQueue). */
export type WithLock = <T>(name: string, task: () => Promise<T>) => Promise<T>

export type WarningKind = 'unknown-device' | 'removed' | 'device-broken'
/** `null` = o kanalın uyarısı kalktı (örn. çıkarılan cihaz geri eklenip yeniden katıldı). */
export type WarningHandler = (channelId: string, kind: WarningKind | null) => void

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
