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

  /**
   * Yeni sürüm indirilip kuruluma hazır olunca çağrılır → cb({ version }).
   * Abonelikten çıkış fonksiyonu döner. (Ham ipcRenderer olayı web'e sızdırılmaz.)
   */
  onUpdateReady: (cb) => {
    const handler = (_event, info) => cb(info)
    ipcRenderer.on('update:ready', handler)
    return () => ipcRenderer.removeListener('update:ready', handler)
  },

  /**
   * C31b: algılanan oyun değişince cb({ ref, epicName? } | null). Süreç listesi/yol çıkmaz, yalnız ref.
   * Abonelikten çıkış fonksiyonu döner.
   */
  onGameActivity: (cb) => {
    const handler = (_event, activity) => cb(activity)
    ipcRenderer.on('game:activity', handler)
    ipcRenderer.send('game:request-current')
    return () => ipcRenderer.removeListener('game:activity', handler)
  },

  /** C31b: sunucudaki elle oyun listesini algılayıcıya ver ([{ id, executables }]). */
  setGameList: (list) => ipcRenderer.send('games:set-list', list),

  /** C31b: ekran seçici bu adı içeren pencereyi seçili açsın (null temizler). */
  setShareHint: (name) => ipcRenderer.send('share:set-hint', name),

  /** İndirilen güncellemeyi kurup uygulamayı yeniden başlatır. */
  installUpdate: () => ipcRenderer.send('update:install'),

  /**
   * C74: gelen arama penceresini göster. Ana pencere öndeyse main göstermez (uygulama içi şerit yeter).
   * @param {{ channelId: string, name: string, subtitle: string, avatarUrl: string | null,
   *   initial: string, acceptLabel: string, rejectLabel: string }} data
   */
  showIncomingCall: (data) => ipcRenderer.send('call:show', data),

  /** C74: arama bitti (kabul/ret/iptal/zaman aşımı) → pencereyi kapat. */
  hideIncomingCall: () => ipcRenderer.send('call:hide'),

  /**
   * C74: arama penceresinde butona basılınca cb({ action: 'accept' | 'reject', channelId }).
   * Abonelikten çıkış fonksiyonu döner.
   */
  onCallAction: (cb) => {
    const handler = (_event, e) => cb(e)
    ipcRenderer.on('call:action', handler)
    return () => ipcRenderer.removeListener('call:action', handler)
  },
})
