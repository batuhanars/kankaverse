# Sprint Electron Contract — Masaüstü İstemci v1 (Track F1)

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` geçerli. Türetildiği yer: PLAN Track F1 (sahip sırası: Electron önce).
>
> **R7-NÖTR:** Bu yalnız istemci kabuğu — auth/oturum mantığına, T&S karar fonksiyonlarına DOKUNMAZ. Mevcut web auth
> akışı (httpOnly refresh cookie + access token) Electron'un tarayıcı-benzeri cookie kavanozunda aynen çalışır.
>
> **Mimari karar (sahip onaylı):** **Canlı siteyi yükle (load-remote).** Pencere `https://kankaverse.com`'u açar;
> bundle YOK. Sebep: web her deploy'da otomatik güncel; auth/cookie kurulumu (`sameSite=lax`, aynı kök domain) korunur
> (file:// bundle çapraz-site olup cookie'yi bozardı).

---

## 1. Hedef

Mevcut Vue SPA'yı **masaüstü uygulamasıyla sar** (Electron) + **native OS bildirimi** ver. Değer: pencere tepsiye
küçülünce bile bildirim alma (mention/arkadaş/DM → OS toast), tray erişimi, tek-instance. Önce **Windows installer**
(sahip Windows'ta); Mac/Linux config hazır bırakılır, build sonraya.

**Kapsam DIŞI (v2):** B2 etkinlik hatırlatması (önce sunucu reminder job'ı lazım), otomatik güncelleme (electron-updater),
çevrimdışı bundle, token safeStorage (load-remote'da gerekmez — cookie kavanozu yeterli).

---

## 2. Yeni tier: `desktop/`

Monorepo köküne `desktop/` (Electron). Yapı:
```
desktop/
├── package.json          # electron + electron-builder; scripts: start, dist
├── src/
│   ├── main.js           # main process: window + tray + lifecycle
│   └── preload.js        # contextBridge: window.kankaverse API (güvenli köprü)
├── build/                # ikonlar (icon.ico Windows, icon.png/icns sonra)
└── electron-builder.yml  # paketleme config (veya package.json "build" alanı)
```
- **Bağımlılık:** `electron` + `electron-builder` (devDependencies). Başka runtime bağımlılığı = PM onayı.
- Electron sürümü: kurulum anındaki güncel kararlı (LTS-uyumlu).

---

## 3. Main process (`main.js`)

- **Pencere:** `BrowserWindow` → `loadURL(APP_URL)`. `APP_URL` = `process.env.KANKAVERSE_URL ?? 'https://kankaverse.com'`
  (dev'de localhost web'e yönlendirmek için override). Min boyut ~960×600; başlık "Kankaverse"; uygulama ikonu.
- **Güvenlik (zorunlu):** `webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: <preload.js> }`.
  Harici linkleri (`setWindowOpenHandler`) varsayılan tarayıcıda aç (uygulama içinde rastgele site açma).
- **Tek-instance:** `app.requestSingleInstanceLock()`; ikinci başlatma → mevcut pencereyi öne getir (`second-instance`).
- **Tray (sistem tepsisi):** tray ikonu + menü: **Aç/Göster**, **Çıkış**. Pencere **kapatma (X)** → uygulamayı KAPATMAZ,
  **tepsiye gizler** (`win.hide()`, `event.preventDefault()`) — arka planda WS bağlı kalsın, bildirim gelsin. Gerçek çıkış
  yalnız tray "Çıkış" veya `app.quit()` (bir `isQuitting` bayrağıyla ayır). macOS: dock'tan tekrar aç → pencere göster.
- **Native bildirim tıklaması:** preload üzerinden gelen `focus-window` IPC → `win.show(); win.focus()`.
- **Opsiyonel (basit tut):** açılışta-başlat toggle'ı (tray menüsünde, `app.setLoginItemSettings`) — **default KAPALI**.
  Aşırı yapma; tek satır toggle yeterli.

---

## 4. Preload (`preload.js`) — güvenli köprü

`contextBridge.exposeInMainWorld('kankaverse', { ... })` ile **dar** bir API (web bu sayede Electron'da olduğunu anlar
ve native entegrasyonu kullanır):
- `isElectron: true` (web: masaüstü bildirimini bu bayrakla aç).
- `focusWindow()` → `ipcRenderer.send('focus-window')` (bildirim tıklanınca pencereyi öne getir).
- `setBadge(count: number)` → `ipcRenderer.send('set-badge', count)` (görev çubuğu/dock okunmamış rozeti; opsiyonel).

> nodeIntegration kapalı; web yalnız bu üç yüzeyi görür. Başka Node/IPC yüzeyi açma (saldırı yüzeyi).

---

## 5. Web tarafı (`web/`) — küçük ekleme (native bildirim üretimi)

Native toast'ı Electron otomatik render eder **eğer web `Notification` API'sini çağırırsa**. Mevcut bildirim akışına bağla:
- **Tetik:** `notifications` store'a yeni olay düştüğünde (mention/arkadaş isteği/DM — mevcut `friend.*` ve diğer WS/bildirim
  olayları), **uygulama görünür değilken** (`document.hidden`) bir `new Notification(baslik, { body, icon })` üret.
- **Koşul:** yalnız `window.kankaverse?.isElectron` true İKEN (v1 hedefi masaüstü). *(Tarayıcı PWA bildirimi ileride
  ayrı iş — şimdi sadece Electron; izin akışını Electron'da varsayılan açıktır.)*
- **Tıklama:** `notification.onclick` → `window.kankaverse.focusWindow()` + ilgili görünüme yönlendir (mevcut router;
  örn. DM/istek). Aşırı yapma — mevcut bildirim verisindeki hedefe git, yoksa sadece pencereyi öne getir.
- **Rozet (opsiyonel):** okunmamış toplamı değişince `window.kankaverse?.setBadge?.(count)`.
- **i18n:** bildirim başlık/gövde metinleri `tr.json` (gömülü string yok). Mevcut bildirim metni anahtarlarını kullan.
- **Sınır:** Bu ekleme **mevcut bildirim/store mantığını değiştirmez**, yalnız "görünür değilken native toast" katmanı
  ekler. Backend'e DOKUNMA. Over-engineering yapma (ses/özel ayar paneli yok — sadece toast).

---

## 6. Paketleme (electron-builder)

- **Windows önce:** NSIS installer (`.exe`). `appId` (örn. `com.kankaverse.desktop`), productName "Kankaverse", ikon `build/icon.ico`.
- Mac (`dmg`/`icns`) + Linux (`AppImage`) config **yazılır ama build edilmez** (v1 Windows; cross-build sonraya).
- Scripts: `npm start` (dev — Electron'u APP_URL ile açar), `npm run dist` (electron-builder → `desktop/dist/`).
- **İkon:** Kankaverse markası — `web/src/assets/brand/` altındaki logoyu kaynak al (altıgen/kor). `.ico` üretimi gerekirse
  png'den (electron-builder png kabul eder) ya da basit dönüşüm; mükemmel ikon şart değil, marka tutarlı olsun.

---

## 7. DoD
- [ ] `desktop/` tier: Electron app `https://kankaverse.com`'u güvenli pencerede yükler (contextIsolation/sandbox, nodeIntegration kapalı).
- [ ] Tray ikonu + menü (Aç/Çıkış); kapatma → tepsiye gizler (arka planda çalışır); tek-instance; harici link → sistem tarayıcısı.
- [ ] Preload `window.kankaverse` (isElectron/focusWindow/setBadge) — dar yüzey.
- [ ] Web: uygulama görünür değilken yeni bildirim olayı → native OS toast (yalnız Electron); tıkla → pencere öne + ilgili görünüm.
- [ ] Auth çalışır: Electron'da giriş yap → kapat-aç → oturum sürüyor (cookie kavanozu kalıcı), `sameSite=lax` korunur.
- [ ] `npm run dist` → çalışan **Windows installer** üretir; kurulum sonrası uygulama açılıp giriş yapılabiliyor.
- [ ] Mac/Linux config var ama build edilmedi (yorumlu/hazır).
- [ ] i18n: yeni metin `tr.json`; `web` build temiz (`vite build`); `desktop` lint/başlatma temiz.
- [ ] R7-nötr doğrulaması: auth/T&S kodu değişmedi (yalnız web'e native-toast katmanı + yeni desktop/ tier).

---

## 8. Notlar
- **Güvenlik:** kendi TLS'li sitemizi (contextIsolation+sandbox) yüklemek güvenli; uzaktan kod riski web app'in kendi riski kadar.
- **Auth kalıcılığı:** Electron default session cookie'leri diske yazar → refresh cookie kalıcı → yeniden açışta oturum sürer (tarayıcı gibi).
- **v2 kapıları:** B2 hatırlatma (sunucu reminder job + native teslim), electron-updater (oto-güncelleme), dock/taskbar zengin entegrasyon, PWA bildirim (tarayıcı kullanıcısı).
- Sahip Windows'ta → ilk hedef Windows installer; o çalışınca Mac/Linux derlemesi ayrı adım.
