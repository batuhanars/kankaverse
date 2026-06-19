const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage, session, desktopCapturer } = require('electron')
const path = require('path')
const fs = require('fs')

// Şu an açık olan picker penceresi (eşzamanlı isteği engeller)
let pickerWin = null

// Uygulama URL'si: geliştirmede KANKAVERSE_URL env değişkeni ile override edilebilir.
const APP_URL = process.env.KANKAVERSE_URL ?? 'https://kankaverse.com'

let win = null
let tray = null
// Tepsi "Çıkış" veya app.quit() → gerçek kapanma; pencere X tuşu → ayara göre gizle/kapat.
let isQuitting = false

// ── Masaüstü ayarları (userData/settings.json) ───────────────────────────────
// openAtLogin: bilgisayar açıldığında başlat · startMinimized: açılışta tepside (arka planda)
// closeToTray: X ile kapatınca tepside çalışmaya devam et (false → tamamen çık)
const SETTINGS_DEFAULTS = { openAtLogin: false, startMinimized: false, closeToTray: true }
let settings = { ...SETTINGS_DEFAULTS }

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}
function loadSettings() {
  try {
    settings = { ...SETTINGS_DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) }
  } catch {
    settings = { ...SETTINGS_DEFAULTS }
  }
}
function saveSettings() {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
  } catch (e) {
    console.error('[ayarlar] yazılamadı:', e)
  }
}
function applyOpenAtLogin() {
  // OS'i ayarla senkronla; openAsHidden (Windows/macOS) açılışta tepsiye düşürür.
  app.setLoginItemSettings({ openAtLogin: settings.openAtLogin, openAsHidden: settings.startMinimized })
}

// Çalışma-zamanı ikon yolu: pakette extraResources (resources/icon.png), dev'de build/icon.png.
// ('files' yalnız src/'i paketlediği için build/ asar'a girmez → pakette resourcesPath kullanılır.)
function resolveIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'build', 'icon.png')
}

// ── Tek-instance kilidi ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // İkinci başlatma girişimi → önceki instance'a sinyal gönder, bu process'ten çık.
  app.quit()
} else {
  app.on('second-instance', () => {
    // İkinci başlatmada mevcut pencereyi öne getir
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    // Varsayılan menü çubuğunu kaldır (File/Edit/View/Window/Help — uygulamaya yaramaz).
    // Kopyala/yapıştır editable alanlarda Chromium tarafından zaten çalışır.
    Menu.setApplicationMenu(null)

    loadSettings()
    applyOpenAtLogin()
    createWindow()
    createTray()

    // Ekran paylaşımı (getDisplayMedia) — kullanıcı picker penceresiyle kaynak seçer.
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      // Eşzamanlı istek: önceki picker açıksa kapat, yeni isteği işle.
      if (pickerWin && !pickerWin.isDestroyed()) {
        pickerWin.destroy()
        pickerWin = null
      }

      desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })
        .then((sources) => {
          // Picker BrowserWindow
          const iconPath = resolveIconPath()
          pickerWin = new BrowserWindow({
            width: 760,
            height: 560,
            minWidth: 600,
            minHeight: 440,
            title: 'Ekran Paylaş',
            icon: nativeImage.createFromPath(iconPath),
            parent: win ?? undefined,
            modal: false,
            resizable: true,
            autoHideMenuBar: true,
            backgroundColor: '#1a1916',
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              preload: path.join(__dirname, 'picker-preload.js'),
            },
          })

          pickerWin.loadFile(path.join(__dirname, 'picker.html'))

          // Pencere hazır olduğunda kaynak listesini gönder
          pickerWin.webContents.once('did-finish-load', () => {
            if (pickerWin && !pickerWin.isDestroyed()) {
              const payload = sources.map((s) => ({
                id: s.id,
                name: s.name,
                thumbnail: s.thumbnail?.toDataURL() ?? null,
              }))
              pickerWin.webContents.send('picker:sources', payload)
            }
          })

          // Callback yalnız bir kez çağrılır (select, cancel veya pencere kapanma)
          let resolved = false
          const resolve = (result) => {
            if (resolved) return
            resolved = true
            ipcMain.removeAllListeners('picker:select')
            ipcMain.removeAllListeners('picker:cancel')
            if (pickerWin && !pickerWin.isDestroyed()) {
              pickerWin.destroy()
            }
            pickerWin = null
            callback(result)
          }

          // Kullanıcı bir kaynak seçti
          ipcMain.once('picker:select', (_event, { id, withAudio }) => {
            const chosen = sources.find((s) => s.id === id)
            resolve({
              video: chosen ?? sources[0],
              audio: withAudio ? 'loopback' : undefined,
            })
          })

          // Kullanıcı iptal etti (buton)
          ipcMain.once('picker:cancel', () => resolve({}))

          // Pencere dışarıdan (X tuşu) kapatıldıysa iptal say
          pickerWin.once('closed', () => {
            pickerWin = null
            resolve({})
          })
        })
        .catch((err) => {
          console.error('[ekran-paylaşım] desktopCapturer HATASI:', err)
          callback({})
        })
    })

    // macOS: Dock'tan uygulamaya tıklanınca (pencere yoksa veya gizliyse) göster
    app.on('activate', () => {
      if (win) {
        win.show()
        win.focus()
      }
    })
  })
}

// ── Ana pencere ──────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = resolveIconPath()
  const appIcon = nativeImage.createFromPath(iconPath)

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Kankaverse',
    icon: appIcon,
    autoHideMenuBar: true, // menü çubuğu hiç görünmesin (Menu.setApplicationMenu(null) ile birlikte)
    backgroundColor: '#1a1916', // --kv-bg-rail (koyu başlangıç; beyaz flash yok)
    show: false, // ready-to-show'da göster (flash yok); startMinimized ise gizli başla
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadURL(APP_URL)

  // startMinimized kapalıysa hazır olunca göster; açıksa tepside (arka planda) başla.
  win.once('ready-to-show', () => {
    if (!settings.startMinimized) win.show()
  })

  // Dev'de (npm start) DevTools otomatik açılır — paketli üründe (installer) açılmaz.
  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' })

  // Menü kaldırıldığı için yenile/devtools kısayolları elle bağlanır (Ctrl+R / F5 / Ctrl+Shift+R / Ctrl+Shift+I / F12).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = input.control || input.meta
    const key = (input.key || '').toLowerCase()
    if ((mod && key === 'r') || input.key === 'F5') {
      if (input.shift) win.webContents.reloadIgnoringCache()
      else win.webContents.reload()
    } else if ((mod && input.shift && key === 'i') || input.key === 'F12') {
      win.webContents.toggleDevTools()
    }
  })

  // Harici linkleri (rel="external", target="_blank" vb.) sistem tarayıcısında aç.
  // Uygulama içinde rastgele site açılmasını engeller.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Kendi domain'imiz yeni sekmede açılabilir (bazı auth akışları için); dışarısını tarayıcıya at.
    if (url.startsWith('https://kankaverse.com') || url.startsWith('http://localhost')) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Pencere X tuşuyla kapatılınca: closeToTray ise tepsiye gizle (WS bağlı kalsın,
  // bildirim gelsin); kapalıysa normal kapanış → window-all-closed → uygulama tamamen kapanır.
  win.on('close', (event) => {
    if (!isQuitting && settings.closeToTray) {
      event.preventDefault()
      win.hide()
    }
  })
}

// ── Ayar uygula + tray menü (paylaşılan; hem tray hem IPC kullanır) ───────────
function applySetting(key, value) {
  if (!(key in SETTINGS_DEFAULTS)) return
  settings[key] = !!value
  saveSettings()
  if (key === 'openAtLogin' || key === 'startMinimized') applyOpenAtLogin()
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu())
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Aç / Göster', click: () => { if (win) { win.show(); win.focus() } } },
    { type: 'separator' },
    {
      label: 'Başlangıçta Başlat',
      type: 'checkbox',
      checked: settings.openAtLogin,
      click: (mi) => applySetting('openAtLogin', mi.checked),
    },
    {
      label: 'Kapatınca tepside çalış (X)',
      type: 'checkbox',
      checked: settings.closeToTray,
      click: (mi) => applySetting('closeToTray', mi.checked),
    },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { isQuitting = true; app.quit() } },
  ])
}

// ── Sistem tepsisi ────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = resolveIconPath()
  let trayIcon = nativeImage.createFromPath(iconPath)

  // Windows tray ikonu küçük olur; 16x16 veya 32x32 resize
  if (process.platform === 'win32') {
    trayIcon = trayIcon.resize({ width: 16, height: 16 })
  } else if (process.platform === 'darwin') {
    trayIcon = trayIcon.resize({ width: 22, height: 22 })
  } else {
    trayIcon = trayIcon.resize({ width: 22, height: 22 })
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Kankaverse')

  tray.setContextMenu(buildTrayMenu())

  // Windows/Linux: tray ikonuna sol tıklayınca pencereyi göster/gizle
  tray.on('click', () => {
    if (win) {
      if (win.isVisible()) {
        win.hide()
      } else {
        win.show()
        win.focus()
      }
    }
  })
}

// ── IPC kanalları ──────────────────────────────────────────────────────────────
// Preload → renderer: pencereyi öne getir (native bildirim tıklaması)
ipcMain.on('focus-window', () => {
  if (win) {
    win.show()
    win.focus()
  }
})

// Masaüstü ayarları — renderer (web ayarlar UI) okur/yazar
ipcMain.handle('desktop:get-settings', () => settings)
ipcMain.handle('desktop:set-setting', (_event, key, value) => {
  applySetting(key, value)
  return settings
})

// Preload → renderer: görev çubuğu / dock rozeti (okunmamış sayısı)
ipcMain.on('set-badge', (_event, count) => {
  const n = typeof count === 'number' ? count : 0
  if (process.platform === 'darwin') {
    // macOS Dock rozeti
    app.dock?.setBadge(n > 0 ? String(n) : '')
  } else if (process.platform === 'win32') {
    // Windows görev çubuğu overlay ikonu (sıfırsa kaldır)
    if (n > 0) {
      const badgeIcon = _makeBadgeIcon(n)
      win?.setOverlayIcon(badgeIcon, `${n} okunmamış bildirim`)
    } else {
      win?.setOverlayIcon(null, '')
    }
  }
  // Linux: resmi AppImage/deb dağıtımlarında standart API yok; atla
})

/**
 * Windows görev çubuğu overlay için küçük bir sayı ikonu üretir.
 * NativeImage canvas benzeri işlem gerektirdiğinden basit bir PNG buffer kullanılır.
 * electron-builder paketlerken node canvas bağımlılığı olmaması için
 * basit sabit 20x20 kırmızı daire + sayı (1–9, 9+ için "9+") SVG → nativeImage.
 */
function _makeBadgeIcon(count) {
  const label = count > 9 ? '9+' : String(count)
  // SVG → PNG; Electron nativeImage.createFromDataURL kabul eder (base64 data URI)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">
    <circle cx="10" cy="10" r="10" fill="#F23B4B"/>
    <text x="10" y="14" font-family="Arial" font-size="${label.length > 1 ? 7 : 10}"
      font-weight="bold" fill="white" text-anchor="middle">${label}</text>
  </svg>`
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  return nativeImage.createFromDataURL(dataUrl)
}

// macOS: tüm pencereler kapandığında çıkma (load-remote'da tek pencere; close→hide sayesinde buraya normal düşmez)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})
