const { contextBridge, ipcRenderer } = require('electron')

/**
 * C74 — gelen arama penceresinin köprüsü. Bilerek ana pencerenin köprüsünden (preload.js) ayrı:
 * bu pencere yalnız veriyi alır ve iki butondan birine basıldığını söyler, başka hiçbir şey.
 */
contextBridge.exposeInMainWorld('callWindow', {
  /** main aramanın bilgisini gönderince cb({ name, subtitle, avatarUrl, initial, acceptLabel, rejectLabel }). */
  onData: (cb) => ipcRenderer.on('call:data', (_event, data) => cb(data)),
  accept: () => ipcRenderer.send('call:accept'),
  reject: () => ipcRenderer.send('call:reject'),
})
