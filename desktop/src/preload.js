const { contextBridge, ipcRenderer } = require('electron')

/**
 * Güvenli köprü — web tarafı yalnız bu dar API'yi görür.
 * nodeIntegration kapalı; Node/IPC başka bir yüzeyi buradan açma.
 */
contextBridge.exposeInMainWorld('kankaverse', {
  /** Web'in masaüstü istemcisinde çalıştığını anlamasını sağlar. */
  isElectron: true,

  /** Native bildirim tıklanınca çağrılır → main process pencereyi öne getirir. */
  focusWindow: () => ipcRenderer.send('focus-window'),

  /**
   * Okunmamış bildirim sayısını görev çubuğu/dock rozetine yansıtır.
   * @param {number} count 0 rozeti kaldırır.
   */
  setBadge: (count) => ipcRenderer.send('set-badge', count),

  /** Masaüstü ayarlarını oku (openAtLogin, startMinimized, closeToTray). */
  getDesktopSettings: () => ipcRenderer.invoke('desktop:get-settings'),

  /** Tek bir masaüstü ayarını değiştir; güncel ayar nesnesini döndürür. */
  setDesktopSetting: (key, value) => ipcRenderer.invoke('desktop:set-setting', key, value),
})
