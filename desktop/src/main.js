const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage, session, desktopCapturer, dialog, Notification } = require('electron')
const path = require('path')
const fs = require('fs')
const { createGameDetector } = require('./game-detector')
const { setupCallWindow } = require('./call-window')

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

// C83 §2: uygulama kökenleri (tek doğruluk). Önek denetimi (`startsWith('https://kankaverse.com')`)
// `kankaverse.com.evil.tld` açığı taşır; bu yüzden URL ayrıştırılıp origin tam eşleşmesiyle karşılaştırılır.
// Paketsiz çalışmada (APP_URL localhost) yerel geliştirme kökeni de uygulama sayılır.
const APP_ORIGINS = new Set(['https://kankaverse.com'])
function originOf(url) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}
{
  const o = originOf(APP_URL)
  if (o && o !== 'null') APP_ORIGINS.add(o)
}
function isAppUrl(url) {
  const u = (() => {
    try {
      return new URL(url)
    } catch {
      return null
    }
  })()
  if (!u) return false
  if (APP_ORIGINS.has(u.origin)) return true
  return !app.isPackaged && u.protocol === 'http:' && u.hostname === 'localhost'
}

let win = null
let tray = null
// C74: gelen arama penceresi (IPC kanallarını burada kurar; pencere ilk aramada yaratılır).
const callWindow = setupCallWindow({ getMainWindow: () => win, bringToFront })
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
  // OS'i ayarla senkronla.
  // Electron 44: `openAsHidden` kaldırıldı. Gizli başlama zaten `startMinimized` ayarını okuyan
  // ready-to-show'da yapılıyor (her açılışta), o yüzden login item'a ek alan gerekmez.
  app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
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
    setupMessageNotificationActivation()

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

// Sağ tık düzenleme menüsü: düzenlenebilir alanda tam liste, salt okunur seçili metinde yalnız Kopyala.
function editMenuTemplate(params) {
  const flags = params.editFlags
  if (params.isEditable) {
    return [
      { role: 'undo', label: 'Geri al', enabled: flags.canUndo },
      { role: 'redo', label: 'Yinele', enabled: flags.canRedo },
      { type: 'separator' },
      { role: 'cut', label: 'Kes', enabled: flags.canCut },
      { role: 'copy', label: 'Kopyala', enabled: flags.canCopy },
      { role: 'paste', label: 'Yapıştır', enabled: flags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: 'Tümünü seç', enabled: flags.canSelectAll },
    ]
  }
  return params.selectionText ? [{ role: 'copy', label: 'Kopyala', enabled: flags.canCopy }] : []
}

// Yalnız http(s) sistem tarayıcısına gider; file:, javascript: vb. şemalar sessizce engellenir.
function openExternalSafe(url) {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url)
  } catch {
    // ayrıştırılamayan adres: yok say
  }
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
  callWindow.attachToMainWindow(win)

  // İndirme sayfa yüklenmeden bittiyse ya da sayfa yenilendiyse bant kaybolmasın: her yüklemede tekrar bildir.
  // Yalnız ANA çerçevenin belge değiştiren gezinmesi (yenileme) aboneliği sıfırlar. `did-start-loading` iframe
  // yüklenince de tetikleniyordu (bağlantı önizlemesi vb.): abonelik "düşmüş" sayılıyor, olaylar kuyrukta kalıyordu.
  win.webContents.on('did-start-navigation', (details) => {
    if (details?.isMainFrame && !details.isSameDocument) msgNotifSubscribed = false
  })
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

  // Electron'un varsayılan sağ tık menüsü yok: yazı alanlarında ve seçili metinde temel düzenleme menüsü.
  // Mesaj satırları kendi menüsünü açar (web preventDefault eder), bu olay orada hiç tetiklenmez.
  win.webContents.on('context-menu', (_event, params) => {
    const template = editMenuTemplate(params)
    if (template.length) Menu.buildFromTemplate(template).popup({ window: win })
  })

  // Harici linkleri (rel="external", target="_blank" vb.) sistem tarayıcısında aç.
  // Uygulama içinde rastgele site açılmasını engeller.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Kendi kökenimiz yeni pencerede açılabilir (bazı auth akışları için); dışarısını tarayıcıya at.
    if (isAppUrl(url)) return { action: 'allow' }
    openExternalSafe(url)
    return { action: 'deny' }
  })

  // C83 §2 (D80): pencere uygulama dışına gezinemez. Bırakılan dosya (file://), tıklanan dış bağlantı ya da
  // yönlendirme ana pencereyi başka sayfaya götürmez; http(s) ise sistem tarayıcısında açılır.
  const guardNavigation = (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openExternalSafe(url)
  }
  win.webContents.on('will-navigate', guardNavigation)
  win.webContents.on('will-redirect', guardNavigation)

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

// ── C83 §3: çoklu indirme, klasöre kaydet ──────────────────────────────────────
// Web güvenilmez: sınırlar, ana bilgisayar ve dosya adı burada yeniden doğrulanır.
// İmzalı adres, api'de StorageService.presignGet ile üretilir: S3 uyumlu depoya (path-style) giden adres.
// Prod'da ana bilgisayar `<hesap>.r2.cloudflarestorage.com` (DEPLOY_VPS.md S3_ENDPOINT); hesap kimliği
// koda gömülmez, bu yüzden R2 alan son eki kabul edilir. Paketsizde (yerel MinIO) http(s) localhost / özel ağ.
const MAX_BATCH_FILES = 50
const DOWNLOAD_HOST_SUFFIXES = ['.r2.cloudflarestorage.com']

function isAllowedDownloadUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol === 'https:') {
    return DOWNLOAD_HOST_SUFFIXES.some((suf) => u.hostname.endsWith(suf))
  }
  // Paketsiz geliştirme: yerel MinIO (localhost ya da LAN IP). Paketli üründe asla http.
  return !app.isPackaged && u.protocol === 'http:'
}

// Windows'ta geçersiz karakterler `_`; yalnız ad kısmı; boşsa 'dosya'; ayrılmış adlar (CON, NUL...) korunur.
function safeFilename(name) {
  let base = path.basename(String(name ?? '').replace(/[\\]/g, '/'))
  base = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim()
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(base)) base = `_${base}`
  return base || 'dosya'
}

// Aynı ad varsa `ad (1).uzantı`. Hem diskteki hem bu işte ayrılmış adlar sayılır.
function uniqueSavePath(dir, filename, reserved) {
  const ext = path.extname(filename)
  const stem = filename.slice(0, filename.length - ext.length)
  let candidate = filename
  for (let i = 1; fs.existsSync(path.join(dir, candidate)) || reserved.has(candidate.toLowerCase()); i++) {
    candidate = `${stem} (${i})${ext}`
  }
  reserved.add(candidate.toLowerCase())
  const full = path.join(dir, candidate)
  // Klasör dışına yazma imkânsız olmalı (basename + geçersiz karakter temizliği zaten garanti eder).
  if (path.dirname(full) !== path.resolve(dir)) throw new Error('klasör dışı yol')
  return full
}

// url -> hedef yol (bu işe ait indirmeler). will-download bu eşlemeye bakar; olmayan indirmelere dokunulmaz.
const batchTargets = new Map()
let downloadHookInstalled = false
function installDownloadHook() {
  if (downloadHookInstalled) return
  downloadHookInstalled = true
  session.defaultSession.on('will-download', (_event, item) => {
    const target = batchTargets.get(item.getURL())
    if (!target) return // toplu işe ait değil: varsayılan kayıt penceresi
    batchTargets.delete(item.getURL())
    item.setSavePath(target.savePath)
    item.once('done', (_e, state) => target.onDone(state === 'completed'))
  })
}

ipcMain.handle('desktop:save-files-to-folder', async (_event, files, title) => {
  const fail = { saved: 0, failed: 0, canceled: false }
  if (!win || win.isDestroyed() || !Array.isArray(files)) return fail
  if (files.length === 0 || files.length > MAX_BATCH_FILES) return fail
  const entries = files.map((f) => ({ url: f?.url, filename: f?.filename }))
  // Reddedilen adres sessiz kalmasın: web "kaydedilemedi" göstersin (izinli ana bilgisayar listesi bayatsa fark edilir).
  if (entries.some((e) => typeof e.url !== 'string' || !isAllowedDownloadUrl(e.url))) {
    console.warn('[save-files] izinli olmayan indirme adresi reddedildi')
    return { saved: 0, failed: files.length, canceled: false }
  }

  const dialogTitle = typeof title === 'string' && title ? title.slice(0, 100) : undefined
  const picked = await dialog.showOpenDialog(win, {
    title: dialogTitle,
    properties: ['openDirectory', 'createDirectory'],
  })
  if (picked.canceled || picked.filePaths.length === 0) return { saved: 0, failed: 0, canceled: true }
  const dir = path.resolve(picked.filePaths[0])

  installDownloadHook()
  const reserved = new Set()
  let saved = 0
  let failed = 0
  await Promise.all(
    entries.map(
      (e) =>
        new Promise((resolve) => {
          // Aynı URL iki kez gelirse eşleme çakışır: ikincisini başarısız say.
          if (batchTargets.has(e.url)) {
            failed++
            resolve()
            return
          }
          let savePath
          try {
            savePath = uniqueSavePath(dir, safeFilename(e.filename), reserved)
          } catch {
            failed++
            resolve()
            return
          }
          const timer = setTimeout(() => {
            if (batchTargets.delete(e.url)) {
              failed++
              resolve()
            }
          }, 10 * 60 * 1000)
          batchTargets.set(e.url, {
            savePath,
            onDone: (ok) => {
              clearTimeout(timer)
              if (ok) saved++
              else failed++
              resolve()
            },
          })
          win.webContents.downloadURL(e.url)
        }),
    ),
  )
  return { saved, failed, canceled: false }
})

// ── C83 Rev.1: bildirimden hızlı cevap + Okundu ────────────────────────────────
// Web güvenilmez: tag deseni ve uzunluklar burada yeniden doğrulanır. `tag` Notification `id` seçeneğine verilir
// (Windows'ta toast Tag'i); Electron bunu etkinleştirme argümanına `tag=<id>` olarak yazar, handleActivation'da oradan okunur.
const MSG_TAG_RE = /^(dm:[\w-]{1,64}|ch:[\w-]{1,64}:[\w-]{1,64})$/
const MSG_TAG_MAX = 64 // Windows toast Tag üst sınırı
const activeMsgNotifs = new Map() // tag -> Notification (yalnız bu süreçte çizilenler)
let msgNotifSubscribed = false // renderer abone mi (sayfa yüklenmiş + web dinleyiciyi kurmuş)
const msgNotifQueue = [] // abonelik öncesi gelen olaylar
const lastMsgEvent = { key: '', at: 0 } // örnek olayı + handleActivation çift teslimini ayıklar

function emitMsgNotifEvent(event) {
  const key = `${event.type}|${event.tag}|${event.text ?? ''}`
  const now = Date.now()
  if (key === lastMsgEvent.key && now - lastMsgEvent.at < 1000) return
  lastMsgEvent.key = key
  lastMsgEvent.at = now
  if (event.type === 'click' || event.type === 'reply' || event.type === 'read') bringToFrontIfClick(event)
  if (win && !win.isDestroyed() && msgNotifSubscribed) {
    win.webContents.send('msgnotif:event', event)
  } else if (msgNotifQueue.length < 20) {
    msgNotifQueue.push(event)
  }
}

// Yalnız tıklama pencereyi öne getirir (cevap/okundu arka planda sessizce işlenir).
function bringToFrontIfClick(event) {
  if (event.type === 'click') bringToFront()
}

// XML'e giren her metin kaçırılır (başlık/gövde kullanıcı içeriği taşır: şablon enjeksiyonu olmasın).
function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
}

function buildMessageToastXml({ tag, title, body, placeholder, sendLabel, readLabel }) {
  const arg = (type) => xmlEscape(`type=${type}&tag=${tag}`)
  return (
    `<toast launch="${arg('click')}" activationType="foreground">` +
    '<visual><binding template="ToastGeneric">' +
    `<text>${xmlEscape(title)}</text><text>${xmlEscape(body)}</text>` +
    '</binding></visual>' +
    '<audio silent="true"/>' +
    `<actions><input id="reply" type="text" placeHolderContent="${xmlEscape(placeholder)}"/>` +
    `<action content="${xmlEscape(sendLabel)}" arguments="${arg('reply')}" hint-inputId="reply" activationType="foreground"/>` +
    `<action content="${xmlEscape(readLabel)}" arguments="${arg('action')}" activationType="foreground"/>` +
    '</actions></toast>'
  )
}

function normalizeActivation(details) {
  const params = new URLSearchParams(String(details?.arguments ?? ''))
  const tag = params.get('tag')
  if (!tag || tag.length > MSG_TAG_MAX || !MSG_TAG_RE.test(tag)) return null
  // Tür argümandan okunur (kendi şablonumuz da Electron'unki de `type=` yazar); Electron özel şablonda
  // düğmeyi `click` diye raporlayabilir, o yüzden argüman önce.
  const type = params.get('type') || details.type
  if (type === 'reply') {
    const text = String(details.reply ?? details.userInputs?.reply ?? '').slice(0, 4000)
    return text.trim() ? { type: 'reply', tag, text } : null
  }
  if (type === 'action') return { type: 'read', tag }
  if (type === 'click') return { type: 'click', tag }
  return null
}

// Windows: bildirim merkezinde duran ya da nesnesi bellekte olmayan bildirimin etkinleştirmesi de buradan gelir.
function setupMessageNotificationActivation() {
  if (process.platform !== 'win32' || typeof Notification.handleActivation !== 'function') return
  Notification.handleActivation((details) => {
    const event = normalizeActivation(details)
    if (event) emitMsgNotifEvent(event)
  })
}

function closeMsgNotif(tag) {
  const n = activeMsgNotifs.get(tag)
  if (!n) return
  activeMsgNotifs.delete(tag)
  try {
    n.close()
  } catch {
    // zaten kapanmış
  }
}

ipcMain.on('msgnotif:subscribe', () => {
  msgNotifSubscribed = true
  if (!win || win.isDestroyed()) return
  for (const ev of msgNotifQueue.splice(0)) win.webContents.send('msgnotif:event', ev)
})

ipcMain.on('msgnotif:show', (_event, data) => {
  if (!Notification.isSupported()) return
  const tag = data?.tag
  if (typeof tag !== 'string' || tag.length > MSG_TAG_MAX || !MSG_TAG_RE.test(tag)) return
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
  closeMsgNotif(tag)
  const readLabel = str(data.readLabel, 60) || 'OK'
  const sendLabel = str(data.sendLabel, 30) || 'OK'
  const n = new Notification({
    id: tag,
    title: str(data.title, 128),
    body: str(data.body, 1000),
    silent: true,
    // Electron'un hazır cevap kutusunda Gönder düğmesi "Reply" sabit; Türkçe için Windows şablonu elle kurulur.
    // Biçim Electron'unkiyle aynı (`type=…&tag=…`), olaylar handleActivation'da aynı yoldan okunur.
    toastXml: buildMessageToastXml({
      tag,
      title: str(data.title, 128),
      body: str(data.body, 1000),
      placeholder: str(data.replyPlaceholder, 60),
      sendLabel,
      readLabel,
    }),
  })
  n.on('click', () => emitMsgNotifEvent({ type: 'click', tag }))
  n.on('reply', (_e, reply) => {
    const text = String(typeof reply === 'string' ? reply : (reply?.reply ?? '')).slice(0, 4000)
    if (text.trim()) emitMsgNotifEvent({ type: 'reply', tag, text })
  })
  n.on('action', () => emitMsgNotifEvent({ type: 'read', tag }))
  n.on('close', () => {
    if (activeMsgNotifs.get(tag) === n) activeMsgNotifs.delete(tag)
  })
  activeMsgNotifs.set(tag, n)
  n.show()
})

ipcMain.on('msgnotif:close', (_event, tag) => {
  if (typeof tag === 'string' && MSG_TAG_RE.test(tag)) closeMsgNotif(tag)
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
