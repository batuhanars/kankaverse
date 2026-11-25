/**
 * Electron preload'un contextBridge üzerinden açtığı `window.kankaverse` API tipi.
 * Tarayıcıda bu nesne TANIMLIDIR (isElectron: false değil, undefined'dır) —
 * `window.kankaverse?.isElectron` ile güvenle kontrol edilebilir.
 */
interface DesktopSettings {
  /** Bilgisayar açıldığında uygulama başlasın mı. */
  openAtLogin: boolean
  /** Açılışta tepsiye küçültülmüş (arka planda) başlasın mı. */
  startMinimized: boolean
  /** Pencere (X) kapatılınca tepside çalışmaya devam etsin mi (false → tamamen çık). */
  closeToTray: boolean
}

/** Masaüstünün algıladığı oyun: ad değil referans (ad sunucudan gelir). */
interface GameActivityRef {
  ref: string
  epicName?: string
}

interface KankaverseElectronBridge {
  /** Electron masaüstü istemcisinde çalışıldığını belirtir. */
  isElectron: true
  /** Ana pencereyi öne getirir (native bildirim tıklanınca). */
  focusWindow: () => void
  /** Görev çubuğu / dock rozetini günceller. 0 → rozeti kaldırır. */
  setBadge: (count: number) => void
  /** Masaüstü ayarlarını oku. */
  getDesktopSettings: () => Promise<DesktopSettings>
  /** Tek bir masaüstü ayarını değiştir; güncel ayarları döndürür. */
  setDesktopSetting: (key: keyof DesktopSettings, value: boolean) => Promise<DesktopSettings>
  /** Yeni sürüm indirilince çağrılır; abonelikten çıkış fonksiyonu döner. Eski kurulumlarda yok. */
  onUpdateReady?: (cb: (info: { version: string }) => void) => () => void
  /** İndirilen güncellemeyi kurup uygulamayı yeniden başlatır. Eski kurulumlarda yok. */
  installUpdate?: () => void
  /** C31b: algılanan oyun değişince çağrılır ({ ref, epicName? } | null); abonelikten çıkış döner. 1.2.0 öncesinde yok. */
  onGameActivity?: (cb: (activity: GameActivityRef | null) => void) => () => void
  /** C31b: sunucudaki elle oyun listesini algılayıcıya verir. */
  setGameList?: (list: Array<{ id: string; executables: string[] }>) => void
  /** C31b: ekran seçici bu adı içeren pencereyi seçili açsın (null temizler). */
  setShareHint?: (name: string | null) => void
  /** C74: gelen arama penceresini göster (ana pencere öndeyse main göstermez). 1.3.0 öncesinde yok. */
  showIncomingCall?: (data: IncomingCallWindowData) => void
  /** C74: gelen arama penceresini kapat. 1.3.0 öncesinde yok. */
  hideIncomingCall?: () => void
  /** C74: arama penceresinde basılan buton; abonelikten çıkış döner. 1.3.0 öncesinde yok. */
  onCallAction?: (cb: (e: { action: 'accept' | 'reject'; channelId: string }) => void) => () => void
}

/** C74 §3: arama penceresine giden yük. Metinler web'de çevrilmiş gelir, pencere metin gömmez. */
interface IncomingCallWindowData {
  channelId: string
  name: string
  subtitle: string
  avatarUrl: string | null
  initial: string
  acceptLabel: string
  rejectLabel: string
}

declare global {
  interface Window {
    kankaverse?: KankaverseElectronBridge
  }
}

export {}
