const { BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')

/**
 * C74 — gelen arama penceresi (ekranın ortasında, çerçevesiz, her zaman üstte).
 *
 * Akış:
 *   web  ── call:show {…} ──▶ main ──▶ pencere açılır (ana pencere öndeyse açılmaz, §1)
 *   pencere ── call:accept / call:reject ──▶ main ── call:action ──▶ web (acceptCall / rejectCall)
 *   web  ── call:hide ──▶ main ──▶ pencere kapanır (kabul, ret, iptal, 30 sn: hepsi buradan)
 *
 * Pencere her aramada yeniden yaratılır, aramalar arasında gizli bekletilmez: durum tutmamak
 * (eski aramanın adı/avatarı bir an görünmesin) birkaç yüz milisaniyelik açılış süresinden değerli.
 *
 * Güvenlik: her IPC kanalı yalnız beklenen göndericiden kabul edilir (show/hide ana pencereden,
 * accept/reject arama penceresinden). Yük alanları tek tek doğrulanır, metinler kısaltılır.
 */

const WIDTH = 280
const HEIGHT = 320
const MAX_TEXT = 100

/** Web'den gelen yükü doğrular; bozuksa null. Pencere yalnız bu temiz kopyayı görür. */
function sanitize(data) {
  if (!data || typeof data !== 'object') return null
  const str = (v) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '')
  if (!str(data.channelId) || !str(data.name)) return null
  const avatar = typeof data.avatarUrl === 'string' && /^https?:\/\//.test(data.avatarUrl)
    ? data.avatarUrl.slice(0, 2048)
    : null
  return {
    channelId: str(data.channelId),
    name: str(data.name),
    subtitle: str(data.subtitle),
    avatarUrl: avatar,
    initial: str(data.initial).slice(0, 2) || '?',
    acceptLabel: str(data.acceptLabel),
    rejectLabel: str(data.rejectLabel),
  }
}

/**
 * @param {{ getMainWindow: () => BrowserWindow | null, bringToFront: () => void }} deps
 * @returns {{ attachToMainWindow: (win: BrowserWindow) => void }}
 */
function setupCallWindow({ getMainWindow, bringToFront }) {
  let callWin = null
  let current = null // açık arama (sanitize çıktısı) ya da null

  function mainIsInFront() {
    const w = getMainWindow()
    return !!w && !w.isDestroyed() && w.isVisible() && !w.isMinimized() && w.isFocused()
  }

  function close() {
    if (callWin && !callWin.isDestroyed()) callWin.destroy()
    callWin = null
  }

  function open() {
    if (!current) return
    if (callWin && !callWin.isDestroyed()) return // zaten açık
    // Birincil ekranın ortası (sahip kararı 2026-11-25). İlk sürüm imlecin olduğu ekranı seçiyordu;
    // çift ekranda pencere "en son işlem yapılan" ekrana düşüyor, yeri tahmin edilemiyordu.
    const { workArea } = screen.getPrimaryDisplay()
    callWin = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
      y: Math.round(workArea.y + (workArea.height - HEIGHT) / 2),
      frame: false,
      transparent: true, // kartın yuvarlak köşeleri dışında pencere görünmesin
      backgroundColor: '#00000000',
      hasShadow: false, // tasarım kuralı: gölge yok
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      title: 'Kankaverse',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'call-preload.js'),
      },
    })
    // 'screen-saver' seviyesi: kenarlıksız tam ekran pencerelerin (oyun) de üstünde kalır.
    callWin.setAlwaysOnTop(true, 'screen-saver')
    callWin.on('closed', () => {
      callWin = null
    })
    const thisWin = callWin
    thisWin.webContents.once('did-finish-load', () => {
      if (thisWin.isDestroyed() || !current) return
      thisWin.webContents.send('call:data', current)
      // showInactive: görünür ama odak çalmaz; kullanıcının yazdığı tuşlar buraya kaymaz.
      thisWin.showInactive()
    })
    thisWin.loadFile(path.join(__dirname, 'call.html'))
  }

  /** Buton basıldı: pencereyi kapat, kararı web'e ilet (asıl kabul/ret mantığı web'de). */
  function resolve(action) {
    if (!current) return
    const { channelId } = current
    current = null
    close()
    if (action === 'accept') bringToFront()
    const w = getMainWindow()
    if (w && !w.isDestroyed()) w.webContents.send('call:action', { action, channelId })
  }

  const fromMain = (e) => {
    const w = getMainWindow()
    return !!w && !w.isDestroyed() && e.sender === w.webContents
  }
  const fromCallWin = (e) => !!callWin && !callWin.isDestroyed() && e.sender === callWin.webContents

  ipcMain.on('call:show', (e, data) => {
    if (!fromMain(e)) return
    const clean = sanitize(data)
    if (!clean) return
    close() // yeni arama eskisinin yerini alır
    current = clean
    if (!mainIsInFront()) open() // §1: ana pencere öndeyse uygulama içi şerit yeterli
  })
  ipcMain.on('call:hide', (e) => {
    if (!fromMain(e)) return
    current = null
    close()
  })
  ipcMain.on('call:accept', (e) => {
    if (fromCallWin(e)) resolve('accept')
  })
  ipcMain.on('call:reject', (e) => {
    if (fromCallWin(e)) resolve('reject')
  })

  return {
    /** Ana pencere öne gelince arama penceresi çekilir, arkaya düşünce (arama sürüyorsa) geri gelir. */
    attachToMainWindow(win) {
      win.on('focus', close)
      win.on('blur', open)
      win.on('hide', open)
      win.on('minimize', open)
      // Sayfa baştan yüklendi (Ctrl+R, güncelleme): web'in arama durumu sıfırlandı, pencere öksüz kalmasın.
      win.webContents.on('did-finish-load', () => {
        current = null
        close()
      })
    },
  }
}

module.exports = { setupCallWindow }
