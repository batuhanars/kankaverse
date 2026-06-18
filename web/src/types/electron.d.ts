/**
 * Electron preload'un contextBridge üzerinden açtığı `window.kankaverse` API tipi.
 * Tarayıcıda bu nesne TANIMLIDIR (isElectron: false değil, undefined'dır) —
 * `window.kankaverse?.isElectron` ile güvenle kontrol edilebilir.
 */
interface KankaverseElectronBridge {
  /** Electron masaüstü istemcisinde çalışıldığını belirtir. */
  isElectron: true
  /** Ana pencereyi öne getirir (native bildirim tıklanınca). */
  focusWindow: () => void
  /** Görev çubuğu / dock rozetini günceller. 0 → rozeti kaldırır. */
  setBadge: (count: number) => void
}

declare global {
  interface Window {
    kankaverse?: KankaverseElectronBridge
  }
}

export {}
