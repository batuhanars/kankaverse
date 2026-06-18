const { contextBridge, ipcRenderer } = require('electron')

/**
 * Picker penceresi için dar IPC köprüsü.
 * Yalnız iki kanal açık:
 *   main → renderer : 'picker:sources'  – kaynak listesi
 *   renderer → main : 'picker:select'   – seçim { id, withAudio }
 *                     'picker:cancel'   – iptal
 */
contextBridge.exposeInMainWorld('pickerBridge', {
  /** main'den kaynak listesini dinle (bir kez tetiklenir). */
  onSources: (callback) => {
    ipcRenderer.once('picker:sources', (_event, sources) => callback(sources))
  },

  /** Kullanıcı bir kaynağı seçip "Paylaş"a bastı. */
  select: (id, withAudio) => {
    ipcRenderer.send('picker:select', { id, withAudio: !!withAudio })
  },

  /** Kullanıcı "İptal"e bastı veya pencereyi kapattı. */
  cancel: () => {
    ipcRenderer.send('picker:cancel')
  },
})
