const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage } = require('electron')
const path = require('path')

// Uygulama URL'si: geliştirmede KANKAVERSE_URL env değişkeni ile override edilebilir.
const APP_URL = process.env.KANKAVERSE_URL ?? 'https://kankaverse.com'

let win = null
let tray = null
// Tepsi "Çıkış" veya app.quit() → gerçek kapanma; pencere X tuşu → sadece gizle.
let isQuitting = false

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

    createWindow()
    createTray()

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
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
  const appIcon = nativeImage.createFromPath(iconPath)

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Kankaverse',
    icon: appIcon,
    backgroundColor: '#1a1916', // --kv-bg-rail (koyu başlangıç; beyaz flash yok)
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadURL(APP_URL)

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

  // Pencere X tuşuyla kapatılınca → tepsiye gizle (WS bağlı kalsın, bildirim gelsin)
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })
}

// ── Sistem tepsisi ────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
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

  // Opsiyonel: açılışta başlat toggle (default KAPALI)
  const loginSettings = app.getLoginItemSettings()

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Aç / Göster',
      click: () => {
        if (win) {
          win.show()
          win.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Başlangıçta Başlat',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked })
        // Menüyü yeniden oluştur (checkbox durumu güncellensin)
        tray.setContextMenu(buildMenu())
      },
    },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(buildMenu())

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
