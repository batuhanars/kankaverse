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
}

declare global {
  interface Window {
    kankaverse?: KankaverseElectronBridge
  }
}

export {}
