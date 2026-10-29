const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage, session, desktopCapturer } = require('electron')
const path = require('path')
const fs = require('fs')
const { createGameDetector } = require('./game-detector')

// Şu an açık olan picker penceresi (eşzamanlı isteği engeller)
let pickerWin = null

// C31b: yayın önerisi ipucu (web setShareHint) — bir sonraki ekran seçici açılışında kullanılıp temizlenir.
let shareHint = null
// C31b: algılanan son oyun ({ ref, epicName? } | null); sayfa yenilenince web'e geri verilir.
let currentGame = null
let gameDetector = null

// Windows bildirim kimliği (AppUserModelID). Ayarlanmazsa Windows toast başlığı
// Electron varsayılanını gösterir: "electron.app.Kankaverse". electron-builder NSIS
// installer'ı Başlat Menüsü kısayoluna build.appId'yi (electron-builder.yml) AUMID
// olarak damgalar; burada aynı kimliği vererek bildirimler kısayolun adını
// ("Kankaverse") ve ikonunu kullanır. Diğer platformlarda etkisizdir.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.kankaverse.desktop')
}

// Uygulama URL'si: geliştirmede KANKAVERSE_URL env değişkeni ile override edilebilir.
// NOT: kök '/' artık tanıtım sitesi (landing tier). Masaüstü doğrudan app ana ekranını yükler;
// giriş yapılmamışsa SPA /login'e yönlendirir. Kökü yüklersek landing açılırdı.
const APP_URL = process.env.KANKAVERSE_URL ?? 'https://kankaverse.com/channels/@me'

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
  // Dev'de (paketsiz) login-item kaydı yazma: kayit ciplak electron.exe'ye dusup
  // acilista uygulamasiz Electron karsilama ekrani olarak geri gelir.
  if (!app.isPackaged) return
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
    bringToFront()
  })

  app.whenReady().then(() => {
    // Varsayılan menü çubuğunu kaldır (File/Edit/View/Window/Help — uygulamaya yaramaz).
    // Kopyala/yapıştır editable alanlarda Chromium tarafından zaten çalışır.
    Menu.setApplicationMenu(null)

    // DNS-over-HTTPS: ad çözümlemesini (Chrome gibi) HTTPS/443 üzerinden yap. TR'de Discord
    // engelini aşmak için yaygın kullanılan GoodbyeDPI/DPI-aşma araçları makinenin UDP 53 DNS'ini
    // kesip/yönlendirip ERR_NAME_NOT_RESOLVED'e yol açıyor; DoH bunu atlar → uygulama yine bağlanır.
    app.configureHostResolver({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query'],
    })

    loadSettings()
    applyOpenAtLogin()
    createWindow()
    createTray()
    setupAutoUpdate()
    setupGameDetection()

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
              // C31b §3.4: ipucu yalnız bu açılış için geçerli; seçici yine kullanıcı onayı bekler.
              pickerWin.webContents.send('picker:sources', { sources: payload, hint: shareHint })
              shareHint = null
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
      bringToFront()
    })
  })
}

// ── Pencereyi öne getir (tek kaynak) ─────────────────────────────────────────
/**
 * Pencereyi kullanıcının önüne getirir. Beş yerden çağrılır: bildirim tıklaması (IPC),
 * tepsi ikonu, tepsi menüsü, ikinci instance, macOS dock.
 *
 * 🔴 Sahip cihaz turu 2026-08-11 — bildirime tıklayınca uygulama "bazen" açılıyordu.
 * Sebep: `show()` Windows'ta MİNİMİZE pencereyi geri getirmez, minimize bırakır. Tepsiye
 * gizlenmiş pencerede (`hide()`) çalıştığı için kusur aralıklı görünüyordu. Sıra önemli:
 *   1. restore() — minimize durumundan çık (show() bunu YAPMAZ)
 *   2. show()    — tepsiye gizlenmişse görünür yap
 *   3. odak      — Windows arka plandaki uygulamanın odak çalmasını reddeder; alwaysOnTop
 *      darbesi pencereyi z-sırasının tepesine taşır, hemen geri alınır (kalıcı üstte-kal
 *      davranışı istenmiyor, yalnız öne çıkma anı için).
 */
function bringToFront() {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  if (process.platform === 'win32') {
    win.setAlwaysOnTop(true)
    win.setAlwaysOnTop(false)
  }
  win.focus()
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

  // İndirme sayfa yüklenmeden bittiyse ya da sayfa yenilendiyse bant kaybolmasın: her yüklemede tekrar bildir.
  win.webContents.on('did-finish-load', () => {
    if (currentGame) win.webContents.send('game:activity', currentGame)
    if (downloadedVersion) win.webContents.send('update:ready', { version: downloadedVersion })
  })

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
    { label: 'Aç / Göster', click: () => bringToFront() },
    { label: `Sürüm ${app.getVersion()}`, enabled: false },
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
    { label: 'Güncellemeleri denetle', click: () => checkForUpdates() },
    { label: 'Çıkış', click: () => { isQuitting = true; app.quit() } },
  ])
}

// ── Sistem tepsisi ────────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(_trayBaseIcon())
  tray.setToolTip('Kankaverse')

  tray.setContextMenu(buildTrayMenu())

  // Windows/Linux: tray ikonuna sol tıklayınca pencereyi göster/gizle
  // Minimize pencere Windows'ta hâlâ "visible" sayılır; salt isVisible'a bakan eski kod
  // minimize haldeyken ikona basınca pencereyi geri getirmek yerine gizliyordu.
  tray.on('click', () => {
    if (!win || win.isDestroyed()) return
    if (win.isVisible() && !win.isMinimized()) win.hide()
    else bringToFront()
  })
}

// ── Otomatik güncelleme (electron-updater, generic provider = kendi VPS) ──────────
// Yalnız paketli üründe. Bildirimli: indirme arka planda, kurulum kullanıcı "Yeniden başlat"
// deyince veya uygulamadan çıkınca. Hata kullanıcıya gösterilmez (ağ yoksa sessiz devam).
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
let autoUpdater = null
// İndirilip kuruluma hazır sürüm (yoksa null); sayfa yeniden yüklenince bandı geri getirmek için.
let downloadedVersion = null

function checkForUpdates() {
  if (!autoUpdater) return
  autoUpdater.checkForUpdates().catch((e) => console.error('[güncelleme] denetim hatası:', e))
}

function setupAutoUpdate() {
  if (!app.isPackaged) return
  ;({ autoUpdater } = require('electron-updater'))
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version
    if (win && !win.isDestroyed()) win.webContents.send('update:ready', { version: info.version })
  })
  autoUpdater.on('error', (e) => console.error('[güncelleme] hata:', e))

  checkForUpdates()
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS)
}

// ── Oyun algılama (C31b §3) ───────────────────────────────────────────────────
// Yalnız Windows. Elle liste sunucudan gelir ama JWT Bearer ile korunduğu için (çerez yetmez)
// web istemcisi çekip köprüden verir; son başarılı liste userData/games.json'da saklanır.
function gamesCachePath() {
  return path.join(app.getPath('userData'), 'games.json')
}

function setupGameDetection() {
  if (process.platform !== 'win32') return
  gameDetector = createGameDetector({
    onChange: (activity) => {
      currentGame = activity
      if (win && !win.isDestroyed()) win.webContents.send('game:activity', activity)
    },
  })
  try {
    gameDetector.setCuratedList(JSON.parse(fs.readFileSync(gamesCachePath(), 'utf-8')))
  } catch {
    // Önbellek yok/bozuk: web ilk listeyi getirene kadar yalnız Steam + Epic algılanır.
  }
  gameDetector.start()
}

// ── IPC kanalları ──────────────────────────────────────────────────────────────
// Web "Yeniden başlat" dedi → kur. isQuitting: tepsiye-kapanma (close→hide) devreye girmesin.
ipcMain.on('update:install', () => {
  if (!autoUpdater) return
  isQuitting = true
  // (isSilent, isForceRunAfter): kurulum oneClick=false olduğu için varsayılan çağrı sihirbazı yeniden
  // açıyordu (sahip turu 2026-10-29). Güncelleme sessiz kurulur, uygulama kendiliğinden açılır.
  autoUpdater.quitAndInstall(true, true)
})

// Web elle oyun listesini getirdi → algılayıcıya ver + önbelleğe yaz (hata → son başarılı liste).
ipcMain.on('games:set-list', (_event, list) => {
  if (!gameDetector || !Array.isArray(list)) return
  gameDetector.setCuratedList(list)
  try {
    fs.writeFileSync(gamesCachePath(), JSON.stringify(list))
  } catch (e) {
    console.error('[oyun-algılama] liste yazılamadı:', e)
  }
})
// Web abone olunca mevcut oyunu ister (abonelik, algılamadan sonra kurulmuş olabilir).
ipcMain.on('game:request-current', () => {
  if (win && !win.isDestroyed() && currentGame) win.webContents.send('game:activity', currentGame)
})
// Yayın önerisi: ekran seçici bu pencere adını içeren kaynağı seçili açsın.
ipcMain.on('share:set-hint', (_event, name) => {
  shareHint = typeof name === 'string' && name.length > 0 ? name.slice(0, 100) : null
})

// Preload → renderer: pencereyi öne getir (native bildirim tıklaması)
ipcMain.on('focus-window', () => {
  bringToFront()
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
      win?.setOverlayIcon(_makeBadgeIcon(), `${n} okunmamış bildirim`)
    } else {
      win?.setOverlayIcon(null, '')
    }
  }
  // Linux: resmi AppImage/deb dağıtımlarında standart görev çubuğu API'si yok; atla.
  // Sistem tepsisi (tray) rozeti tüm platformlarda: okunmamış varken ikona kırmızı nokta.
  _updateTrayBadge(n > 0)
})

/**
 * Kırmızı bildirim noktası (Discord-tarzı) — ham BGRA bitmap ile çizilir.
 * ÖNEMLİ: Electron nativeImage SVG data URL'lerini bu platformda RASTERIZE ETMEZ
 * (createFromDataURL → boş 0x0 resim; test edildi). Bu yüzden SVG değil,
 * createFromBitmap + elle piksel kullanılır. Sayı yerine sade nokta: ham piksele
 * rakam çizmek font atlası gerektirir, kullanıcı da "nokta/işaret" istedi.
 */
function _drawDot(buf, imgW, imgH, cx, cy, r) {
  const R = 242, G = 59, B = 75 // #F23B4B (danger token)
  const ring = r + Math.max(1, Math.round(r * 0.2)) // ince beyaz halka (kontrast)
  for (let y = Math.max(0, cy - ring); y <= Math.min(imgH - 1, cy + ring); y++) {
    for (let x = Math.max(0, cx - ring); x <= Math.min(imgW - 1, cx + ring); x++) {
      const d = Math.hypot(x - cx, y - cy)
      const i = (y * imgW + x) * 4
      if (d <= r) {
        buf[i] = B; buf[i + 1] = G; buf[i + 2] = R; buf[i + 3] = 255
      } else if (d <= ring) {
        buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255
      }
    }
  }
}

// Windows görev çubuğu overlay ikonu: saydam zemin üzerine küçük kırmızı nokta
// (Discord-tarzı). Windows overlay'i simgenin sağ-alt köşesine yerleştirir; nokta
// saydam boşlukla küçük tutulur. r küçüldükçe nokta küçülür.
function _makeBadgeIcon() {
  const size = 32
  const buf = Buffer.alloc(size * size * 4) // tümü saydam (BGRA 0,0,0,0)
  _drawDot(buf, size, size, size / 2, size / 2, 8)
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

// ── Tray ikonu (sade + okunmamış rozetli varyant) ──────────────────────────────
// Tray'de native "badge" yoktur; okunmamış durumunu ikonu değiştirerek gösteririz.
// İki varyant cache'lenir: sade logo, ve logonun köşesine kırmızı nokta bindirilmiş hali.

// Tray ikonunu platforma göre boyutlandırır. Windows tepsi yuvası DPI'ya göre
// 16/20/24px olabilir; daha yüksek çözünürlük vermek ikonu büyük ve net gösterir.
// (size düğmesi: küçük 16, orta 24, büyük 32.)
function _resizeTray(img) {
  const size = process.platform === 'win32' ? 24 : 22
  return img.resize({ width: size, height: size })
}

let _trayBaseCache = null
function _trayBaseIcon() {
  if (!_trayBaseCache) {
    _trayBaseCache = _resizeTray(nativeImage.createFromPath(resolveIconPath()))
  }
  return _trayBaseCache
}

// Logoyu 32x32 ham BGRA'ya çevirip sağ-alt köşesine kırmızı nokta bindirir
// (SVG rasterize edilemediği için piksel-piksel kompozisyon). Başarısızsa sade ikona düşer.
let _trayBadgeCache = null
function _trayBadgeIcon() {
  if (_trayBadgeCache) return _trayBadgeCache
  try {
    const base = nativeImage.createFromPath(resolveIconPath()).resize({ width: 32, height: 32 })
    const buf = base.toBitmap() // ham BGRA (32*32*4), değiştirilebilir
    _drawDot(buf, 32, 32, 25, 7, 5) // sağ-üst köşede küçük nokta
    const composed = nativeImage.createFromBitmap(buf, { width: 32, height: 32 })
    _trayBadgeCache = composed.isEmpty() ? _trayBaseIcon() : _resizeTray(composed)
  } catch (e) {
    console.error('[tray] rozetli ikon üretilemedi, sade ikona düşülüyor:', e)
    _trayBadgeCache = _trayBaseIcon()
  }
  return _trayBadgeCache
}

// set-badge → tray ikonunu okunmamış durumuna göre değiştir.
function _updateTrayBadge(hasUnread) {
  if (!tray) return
  tray.setImage(hasUnread ? _trayBadgeIcon() : _trayBaseIcon())
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
