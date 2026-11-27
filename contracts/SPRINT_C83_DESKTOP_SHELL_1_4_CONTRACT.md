# Sprint C83: Masaüstü kabuğu 1.4.0 (Electron yükseltmesi, gezinme koruması, klasöre kaydet, gruplu bildirim)

> 2026-11-27 · desktop + web (köprüyü kullanan küçük parça) · api DEĞİŞMEZ. R7 değil (auth/T&S kararı yok), ama
> §2 güvenlik yüzeyi: diff sahibe satır satır sunulur. Dev commit ETMEZ. Sürüm 1.3.1 → **1.4.0**.
> Kaynak: PLAN.md D80, D93; C82 Rev.3 (sahip, WhatsApp masaüstü); sahip ilgisi "bildirimden hızlı cevap" (2026-11-27).

## §1 D93: Electron 36 → 44

- `electron` → **44.x en son yama** (`^44`). Gerekçe: 36 desteği bitti; 43/44/45 destekli, 45 üç günlük. 44 hem
  destekli hem olgun. Chromium 137+ olduğu için WebCrypto Ed25519 yerleşik gelir.
- `electron-builder` / `electron-updater` 44 ile uyumlu sürüme (gerekirse) çekilir. Yeni bağımlılık yok.
- Ara sürümlerdeki kırıcı değişiklikler (Electron "Breaking Changes" sayfası, 37-44) okunur; kabukta kullanılan API'ler
  (`Notification`, `Tray`, `nativeImage` BGRA rozet, `setWindowOpenHandler`, `desktopCapturer`/seçici,
  `app.setLoginItemSettings`, `requestSingleInstanceLock`, DoH `app.configureHostResolver`, `session` izinleri,
  `autoUpdater`) için etkilenen varsa raporda listelenir ve düzeltilir.
- Kabul: konsolda `[e2ee] kripto yolu:` satırı saf JS yerine **yerleşik WebCrypto** yolunu göstermeli
  (`web/src/.../adapter.ts` `detectWebProvider`). Göstermezse sebep raporlanır, kod değiştirilmez.

## §2 D80: gezinme koruması

- `win.webContents.on('will-navigate')` ve `will-redirect`: hedef, uygulama kökeninde değilse (`APP_URL`'nin origin'i;
  paketsiz çalışmada `http://localhost:*` de) `preventDefault`. Hedef `http(s)` ise `shell.openExternal`, başka şema
  (`file:`, `javascript:` vb.) ise yalnız engellenir.
- Bırakılan dosya (`file://`) pencereyi dosyaya götürmez (bugün ayarlar sayfasında götürüyor).
- `setWindowOpenHandler` bugünkü gibi kalır, yalnız aynı köken denetimini paylaşır (tekrar eden `startsWith` kaldırılır,
  tek `isAppUrl(url)` yardımcısı). `startsWith('https://kankaverse.com')` gibi önek denetimi `kankaverse.com.evil.tld`
  açığı taşır: `new URL(url).origin` ile karşılaştırılır.
- Kick bağlama yolu (C39) ve OAuth akışları bozulmamalı (turda denenir).

## §3 Çoklu indirme: klasöre kaydet (C82 Rev.3)

**Davranış (WhatsApp masaüstü):** seçim çubuğunda İndir ya da menüde "Tümünü kaydet" (2+ ek) → **tek** "Klasör seç"
penceresi (dosya adı alanı yok) → tüm ekler o klasöre → "{n} dosya kaydedildi" bildirimi. Tek ek: bugünkü gibi kayıt
penceresi (değişmez).

**Köprü (preload):** `saveFilesToFolder(files: { url: string; filename: string }[], title: string)` →
`Promise<{ saved: number; failed: number; canceled: boolean }>`.

**main:**
- `dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'createDirectory'] })`; iptal → `{ canceled: true }`.
- Her dosya `webContents.downloadURL(url)`; `session.on('will-download')` içinde, bu toplu işe ait indirme için
  `item.setSavePath(klasör/ad)` (kayıt penceresi açılmaz). Bu işe ait olmayan indirmelere dokunulmaz (tek indirme
  bugünkü varsayılan pencereyle sürer). Eşleme URL ile yapılır.
- **Doğrulama (main tarafı, web'e güvenilmez):** en çok 50 dosya; URL `https:` ve izinli ana bilgisayar (imzalı indirme
  adresinin gerçek ana bilgisayarı api kodundan teyit edilir: `getDownloadUrl` üreten servis); paketsiz çalışmada
  `http://localhost:*` de. Dosya adı `path.basename` + Windows'ta geçersiz karakterler `_` + boşsa `dosya`; aynı ad
  varsa `ad (1).uzantı`. Klasör dışına yazma imkânsız olmalı.
- Sonuç her indirme `done` olunca toplanır (`completed` → saved, diğer → failed).

**web:** `downloadAttachments` ek nesnesi alır (`{ id, filename }`). `window.kankaverse?.saveFilesToFolder` varsa ve 2+
ek varsa: imzalı adresler alınır, köprü çağrılır; `saved > 0` → `select.savedCount` bildirimi, `failed > 0` →
`select.savedPartial`. Köprü yoksa (tarayıcı ya da eski 1.3.x kabuk) bugünkü sırayla indirme. i18n:
`select.folderTitle` ("Klasör seç"), `select.savedCount` ("{n} dosya kaydedildi"), `select.savedPartial`.

## §4 Gruplu mesaj bildirimi (web, `useMessageToasts.ts`)

Bugün: aynı sohbetin bildirimi `tag` ile eskisinin yerine geçiyor ama yalnız son mesaj görünüyor; 3 sn süzgecinde
gelen mesajlar hiç görünmüyor.

- Sohbet başına bellekte son mesaj tamponu (en çok 3 satır + toplam sayı). Bildirim gövdesi son 3 satır alt alta;
  2+ mesajda başlık `"{ad} ({n} mesaj)"` (`notification.groupedTitle`). Grup DM ve ortam kanalında satırlar `ad: metin`.
- Süzgeç mesaj DÜŞÜRMEZ: süzgeç içinde gelen mesaj tampona girer, süzgeç bitince tek bildirim çizilir (sondaki
  mesaj kaybolmaz).
- Sohbet okununca (açılınca ya da C76 K3 başka cihazda okundu) tampon temizlenir.
- Şifreli DM'de satırlar bugünkü kuralla (çözülmüş metin ya da genel "Şifreli mesaj").

## §5 Bildirimden hızlı cevap: DENEME (zaman sınırı yarım gün)

Soru: Windows'ta Electron 44 bildiriminden yazılan cevap metni ana sürece ulaşıyor mu?
- Electron 44'te `Notification` `toastXml` (giriş kutusu + "Gönder" eylemi) ile çizilen bildirimin `reply`/`action`
  olayları Windows'ta geliyor mu, ya da etkinleştirme argümanıyla mı geliyor; paketli (AUMID'li) ve paketsiz çalışmada
  ayrı ayrı.
- **Deneme ürüne girmez:** ayrı bir dalda/dosyada denenir, sonuç raporlanır (çalışıyor / çalışmıyor / koşullu ve
  neden). Uygulama kararı PM + sahip, ayrı sözleşme revizyonu ile. Çalışıyorsa §4'teki bildirim o yola taşınır.

## §6 Sürüm ve yayın

- `desktop/package.json` `version` 1.4.0. Yayın adımı `DEPLOY_VPS.md` 11b (sahip / PM). Güncelleyici 1.3.1'den
  1.4.0'a bantla geçmeli.
- Web parçaları (§3 web, §4) web dağıtımıyla gider; eski kabukta köprü yoksa bugünkü davranış (geri uyumlu).

## §7 Doğrulama

- desktop: `npm start` (paketsiz, `KANKAVERSE_URL=http://localhost:5173/channels/@me`) açılır, konsolda hata yok.
  `npm run dist` paket üretir.
- web: `npx vue-tsc -b` (bilinen 6), dokunulan dosyalarda `npx eslint`, `npx vite build`.
- Dev, sahibe vermeden önce paketsiz uygulamayı açıp konsola bakar (C82 TDZ dersi).

Sahip turu (paketli 1.4.0 kurulumu + güncelleme):
1. 1.3.1 kuruluyken bant 1.4.0'ı getiriyor, yeniden açılınca sürüm 1.4.0.
2. `[e2ee] kripto yolu` yerleşik. DM şifreli mesaj gönder/al, arama (E8) çalışıyor.
3. Bildirim, görev çubuğu/tepsi rozeti, gelen arama penceresi, oyun algılama, ekran paylaşımı seçici, oturum açılışında başlat.
4. Mesajdaki dış bağlantı tarayıcıda açılıyor; ayarlar sayfasına dosya bırakınca pencere gitmiyor; Kick bağlama çalışıyor.
5. 3 görsel seç → İndir → tek klasör penceresi → 3 dosya klasörde → "3 dosya kaydedildi". Aynı adla ikinci kez: `(1)` ekli.
   İptal → hiçbir şey inmez, bildirim yok. Tek görselde Farklı kaydet → kayıt penceresi (değişmedi).
6. Pencere arka plandayken aynı DM'den hızlı 4 mesaj → tek bildirim, son 3 satır + "(4 mesaj)". Sohbeti açınca kalkıyor.

## Rev.1 (2026-11-27): bildirimden hızlı cevap + Okundu (§5 deneme olumlu)

**Deneme sonucu:** Electron 44.11.6, paketsiz, AUMID `com.kankaverse.desktop`. `hasReply` bildirimi çizildi;
bildirim merkezine düştükten sonra yazılan cevap hem `reply` olayıyla hem `Notification.handleActivation` ile geldi
(`{ type: 'reply', reply: 'Hop', arguments: 'type=reply&tag=…' }`). Sahip turu: §4 gruplu bildirim geçti.
**Sahip kararı:** cevap kutusu + **"Okundu olarak işaretle"** düğmesi (mobille tutarlı).

### Rev.1 §1 Kabuk
- Köprü: `showMessageNotification({ tag, title, body, replyPlaceholder, readLabel })`,
  `closeMessageNotification(tag)`, `onMessageNotificationEvent(cb)` (abonelikten çıkış döner).
  Olay: `{ type: 'click' | 'reply' | 'read', tag, text? }`.
- main: `new Notification({ title, body, silent: true, hasReply: true, replyPlaceholder, actions: [{ type: 'button',
  text: readLabel }] })`. `tag` başına tek bildirim (yenisi gelince eskisi `close()`); `closeMessageNotification` kapatır.
  `click` → pencereyi öne getir + olay; `reply` → olay (metin `slice(0, 4000)`, boşsa yok sayılır); `action` → `read`.
  `Notification.handleActivation` ile bellekte olmayan bildirimin etkinleştirmesi de aynı olaya çevrilir (`tag`,
  `arguments` içinden okunur; okunamıyorsa yok sayılır).
- `tag` biçimi (sayfa yenilense de anlamlı): `dm:<channelId>` ya da `ch:<guildId>:<channelId>`. main yalnız
  `^(dm:[\w-]{1,64}|ch:[\w-]{1,64}:[\w-]{1,64})$` kabul eder; uymayan istek yok sayılır. title/body uzunluğu kırpılır.
- Renderer hazır değilken (pencere yükleniyor) gelen olay kuyruğa alınır, `did-finish-load` sonrası iletilir.

### Rev.1 §2 Web (`useMessageToasts.ts` + yeni dinleyici)
- Köprüde `showMessageNotification` varsa §4 gruplu bildirim onunla çizilir; yoksa (tarayıcı, eski kabuk) bugünkü
  `new Notification` yolu. C76 K2 bastırma, ses (`playNotificationTone`), sessize alma ve seviye kuralları AYNEN.
- `closeOsNotificationsForChannel` köprü varsa `closeMessageNotification` de çağırır (K3).
- Olaylar (uygulama açılışında bir kez abone olunur):
  - `click` → bugünkü gezinme (`tag`'den rota).
  - `read` → mevcut okundu yolu (DM: `dm` store `markRead` / ortam: `applyChannelReadLocal` + mevcut okundu ucu);
    tampon temizlenir, bildirim kapanır.
  - `reply` → mesaj kutusunun kullandığı gönderim yolu (şifreli DM'de şifreleme dahil, yeni yol YAZILMAZ). Başarıda
    sohbet okundu sayılır (gönderen cevapladığı mesajı okumuştur), bildirim kapanır. Hatada (ör. `GroupNotReadyError`,
    yetki, ağ) kabuk bildirimi `notification.replyFailed` ile yeniden çizilir, gövdede yazılan metin durur (kaybolmaz).
- i18n: `notification.replyPlaceholder` ("Cevap yaz"), `notification.markRead` ("Okundu olarak işaretle"),
  `notification.replyFailed` ("Gönderilemedi: {text}").

### Rev.1 §3 Doğrulama + sahip turu
- §7 komutları + paketsiz açılışta konsol temiz (dev kendisi CDP ya da DevTools ile bakar).
- Tur (yerel, `kv_test_bot` hesabıyla): bildirimden cevap → mesaj sohbette görünür, bildirim kapanır; bildirim
  merkezine düşmüş bildirimden cevap da gider; Okundu → okunmamış sayısı ve rozet düşer; şifreli DM'de gönderilemeyen
  cevap → "Gönderilemedi" bildirimi metinle; tarayıcıda bugünkü bildirim değişmedi.

## Rev.2 (2026-11-27, sahip yerel turu)

- Tur bulgusu: cevap kabuğa ulaşıp web'e iletilmiyordu. `did-start-loading` iframe yüklenince de tetiklenip aboneliği
  sıfırlıyordu, olaylar kuyrukta kalıyordu. Sıfırlama yalnız ana çerçevenin belge değiştiren gezinmesinde
  (`did-start-navigation`, `isMainFrame && !isSameDocument`).
- Electron'un hazır cevap kutusunda düğme "Reply" sabit: bildirim `toastXml` ile kurulur (giriş kutusu, "Gönder",
  "Okundu olarak işaretle"); argüman biçimi aynı (`type=…&tag=…`), tür argümandan okunur. XML'e giren metin kaçırılır.
  i18n `notification.replySend`. Düğmede el imleci yok (Windows çizer, değiştirilemez).
- Açık: yerel ortamda şifreli DM bildirimi "🔒 Yeni mesaj" gösterdi (pencere önde de arkada da). Yerel cihaz/grup
  durumundan şüpheleniliyor; canlıda 1.4.0 ile şifreli DM bildiriminin gerçek metni gösterdiği turun ilk maddesi.
