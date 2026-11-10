// Platforma özgü kısımların arayüzleri (E1 §6.3). Motor bunları kullanır, uygulamaz: web ve mobil
// kendi adaptörlerini enjekte eder. Böylece MLS akışı tek yerde durur, depolama/ağ/kilit istemciye ait kalır.
import type { CryptoProvider } from '@kankaverse/e2ee-core'

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

/**
 * Sunucu uçları (E1 §2). Baytlar base64 metin. Hata, `response.data.error` makine kodunu taşıyan bir
 * nesne olarak fırlatılır (axios hatası zaten böyle; mobil adaptör aynı şekli üretir).
 */
export interface E2eeApi {
  status(): Promise<Reply<{ enabled: boolean }>>
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
