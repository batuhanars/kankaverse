const { contextBridge, ipcRenderer } = require('electron')

/**
 * Picker penceresi için dar IPC köprüsü.
 * Yalnız iki kanal açık:
 *   main → renderer : 'picker:sources'  – { sources, hint }
 *   renderer → main : 'picker:select'   – seçim { id, withAudio }
 *                     'picker:cancel'   – iptal
 */
contextBridge.exposeInMainWorld('pickerBridge', {
  /** main'den kaynak listesini + (varsa) yayın önerisi ipucunu dinle (bir kez tetiklenir). */
  onSources: (callback) => {
    ipcRenderer.once('picker:sources', (_event, payload) => callback(payload))
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
