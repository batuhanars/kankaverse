# SPRINT C31b: Oyun algılama ("oynuyor" durumu + yayın önerisi)

> Durum: **KODLANDI + R7 SAHİP ONAYI (2026-10-29)**, sahip turu bekliyor. Sapmalar: elle liste web üzerinden masaüstüne (Bearer), Epic eşleme kurulum klasörü altı, snapshot `gameName`, DM satırında "oynuyor" önizlemesi (sahip onaylı), oyun kapanınca null presence kitlesine (sahip onaylı). Metin2/Zula/Wolfteam/Point Blank dosya adı doğrulanamadı, listede yok. PM compose (Opus).
> **api + desktop + web + mobil.** **R7: presence görünürlük karar yüzeyi** (`canSeePresence` etrafına yeni veri) →
> §2 sahibe satır satır sunulur.

---

## §0 Kararlar (sahip, 2026-10-29)
- Oyun algılama **yalnız masaüstünde** (tarayıcı ve telefon süreç listesini göremez). Masaüstü oranı düşük çıksa da yapılır:
  bilinçli bahis, amaç masaüstü kullanımını artırmak.
- **Oyun içi katman/panel YOK.** Hile korumaları (Vanguard vb.) enjeksiyonu hile sayar, kullanıcı ban yer.
- Yetişkinde "Oynadığım oyunu göster" **varsayılan açık**. Minörde varsayılan kapalı, açsa da yalnız kankalar görür.
- Yayın önerisi: ses paneli düğmesi + oyun oturumu başına **bir** Windows bildirimi.

## §1 Oyun tablosu ve üç kaynak (api) (sahip kararı 2026-10-29: Steam + Epic + elle liste)
**Hazır dış liste KULLANILMAZ.** Açık lisanslı bir dosya adı → oyun listesi yok. Discord'un belgelenmemiş `detectable`
listesi rakip verisi (şart + veritabanı koruması riski, haber vermeden değişir), çekilmez.

1. **Şema:** `Game { id, name, source: STEAM | EPIC | CURATED, externalId String?, executables String[], hidden Boolean @default(false), createdAt }`,
   `@@unique([source, externalId])`. Migration uygulanır. `hidden` = admin kaldırdı (yayılmaz, tekrar eklenmez).
2. **CURATED (elle):** seed ile ~35 Steam/Epic dışı oyun, ağırlık TR'de yaygın rekabetçi online: Valorant, League of Legends,
   Metin2, Knight Online, Zula, Wolfteam, Overwatch 2, Call of Duty (Battle.net), World of Warcraft, Hearthstone, EA FC (EA app),
   Apex (EA app sürümü), Minecraft Java/Bedrock, Roblox, Genshin Impact, Point Blank, Legends of Runeterra, Teamfight Tactics...
   Dev her birinin çalıştırılabilir dosya adını kaynaktan doğrular, emin olmadığını yazmaz, listeyi raporlar.
3. **STEAM:** istemci `steam:<appid>` gönderir. Sunucu tabloda yoksa adı Steam'den kendisi çeker (mağaza `appdetails` veya Web API),
   tabloya yazar. Çekilemezse kayıt açılmaz. **Ad istemciden asla alınmaz.** Aynı appid için eşzamanlı istekler tek çekime düşer.
4. **EPIC:** istemci `epic:<catalogItemId>` + manifestteki `DisplayName` gönderir (ad doğrulanamaz, kullanıcı dosyayı düzenleyebilir).
   Sunucu: tabloda varsa **tablodaki adı** kullanır (ilk gelen kilitlenir, sonraki farklı ad yok sayılır). Yoksa ad 1-64 karakter,
   automod ad süzgecinden geçerse (mevcut kullanıcı adı/ortam adı süzgeci, dev hangisi olduğunu raporlar) tabloya yazılır, geçmezse
   kayıt açılmaz ve yayılmaz. Admin panelinde EPIC kaynaklılar ayrı süzgeçle listelenir, `hidden` yapılabilir.
5. `GET /games/curated` (JwtAuthGuard) → `[{ id, name, executables }]` (yalnız CURATED, masaüstü eşleme için). Önbellek 1 saat.
6. Servis `resolve(ref)` → `{ id, name } | null` (gateway doğrulaması). `ref` biçimi: `curated:<id>` · `steam:<appid>` · `epic:<catalogItemId>`.
7. Hız sınırı: kullanıcı başına günde en çok 20 yeni (tabloda olmayan) STEAM/EPIC kaydı.

## §2 Sunucu durumu (R7)
1. **Şema:** `User.showGameActivity Boolean?`. `null` = yaşa göre varsayılan (yetişkin açık, minör kapalı). Migration yazılır
   **ve yerel DB'ye uygulanır** (`migrate status` temiz).
2. **Ayar ucu:** mevcut profil güncelleme DTO'suna (`api/src/modules/users/dto/update-profile.dto.ts`) `showGameActivity?: boolean`.
   Me cevabı `showGameActivity` + hesaplanmış `gameActivityEffective` döner (istemci varsayılanı yeniden hesaplamaz).
3. **Bellek:** `PresenceEntry`'ye (`api/src/shared/presence/presence.service.ts`) bağlantı başına oyun: `games: Map<connectionId, gameId>`.
   Hesabın etkin oyunu = en son set edilen bağlantınınki. Bağlantı düşünce o bağlantının kaydı silinir. Şema yok (presence ile aynı ilke).
4. **Soket:** `activity:set { ref: string, epicName?: string } | { ref: null }`. Yayılan değer her zaman tablodaki `Game.id` + `name`.
   - `resolve(ref)` null ya da oyun `hidden` ise sessizce yok sayılır (ack `{ ok: false }`). **Steam ve elle listede serbest metin
     kabul edilmez; Epic adı yalnız §1.4 kapısından geçerek ve yalnız ilk kayıtta kullanılır.**
   - Etkin ayar kapalıysa sunucu kaydetmez ve yaymaz (istemciye güvenilmez, ayar sunucuda kontrol edilir).
   - Hız sınırı: bağlantı başına dakikada 10 (yanıp sönen süreç spamı).
5. **Görünürlük kuralı** (yeni fonksiyon değil, mevcut kurala bir şart):
   `canSeeActivity(viewer, target) = canSeePresence(viewer, target) && etkinAyar(target) && (target.isMinor ? karşılıklıKanka : true)`.
   Minör için son şart `canSeePresence`'ın kural 3-4'üyle zaten örtüşüyor, yine de açık yazılır (savunma derinliği, test edilir).
   `dnd` ve `offline`'da oyun yayılmaz. Görünmez/offline görünen kullanıcının oyunu sızmaz.
6. **Yayın:** `activity:update { userId, game: { id, name } | null }` mevcut `audienceFor` kitlesinden `canSeeActivity` geçenlere.
   `presence:snapshot` her girdiye `gameId?` ekler (aynı kural). Ayar kapatılınca hemen `activity:update { gameId: null }` yayılır.
7. **Test:** bilinmeyen ref reddi · Steam adı istemciden alınmıyor · Epic: süzgece takılan ad kayıt açmıyor, ikinci farklı ad
   tablodaki adı değiştirmiyor · `hidden` oyun yayılmıyor · günlük yeni kayıt sınırı · ayar kapalıyken kayıt yok · minör + yabancı ortak ortam üyesi görmez · minör + kanka görür
   (yalnız minör ayarı açtıysa) · engel iki yönde gizler · bağlantı kopunca temizlenir · dnd'de yayılmaz.

## §3 Desktop
1. Açılışta ve 6 saatte bir `GET /games/curated` (ana süreçte `net.fetch`, pencere oturumu çereziyle). Hata → son başarılı liste
   `userData/games.json`'dan.
2. 15 sn'de bir tarama, öncelik sırası **Steam → Epic → elle liste** (ilk eşleşen kazanır):
   - **Steam:** kayıt defterinden çalışan appid (`HKCU\Software\Valve\Steam` altındaki çalışan uygulama değeri ya da
     `Apps\<appid>\Running`). **🔴 Sınanacak varsayım:** anahtar araştırmada doğrulanamadı; dev Steam açıkken cihazda doğrular,
     hangisi güvenilirse onu kullanır, sonucu raporlar. `0` = oyun yok.
   - **Epic:** `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item` (JSON: `DisplayName`, `CatalogItemId`,
     `InstallLocation`, `LaunchExecutable`) açılışta ve 10 dakikada bir okunur. Çalışan süreçlerin **tam yolu** bir manifestin
     `InstallLocation` + `LaunchExecutable` yoluna denk gelirse eşleşir. Yol için `Get-CimInstance Win32_Process` (PowerShell,
     yeni yerel bağımlılık yok); süre ölçülür, 15 sn aralığa sığmıyorsa dev PM'e gelir.
   - **Elle liste:** süreç adları (küçük harf) `executables` ile eşlenir.
   Değişince köprü olayı. **Süreç listesi ve yollar cihazdan çıkmaz**, yalnız `ref` (+ Epic için ad).
3. Köprü (`preload.js`): `onGameActivity(cb)` → `cb({ ref, epicName? } | null)`, abonelik çıkışı döner. `setShareHint(name | null)`.
   Görünen ad web'e sunucunun `activity:update` cevabından gelir (masaüstü adı göstermez).
4. Picker (`desktop/src/picker.js`): `setShareHint` verilmişse pencere adı ipucunu (büyük/küçük harf duyarsız) içeren **ilk**
   kaynak seçili gelir. Bulunamazsa bugünkü davranış. Kullanıcı yine onaylar, otomatik paylaşım yok.
5. Ana süreç `win32` dışında algılamayı hiç başlatmaz.

## §4 Web
1. `window.kankaverse?.onGameActivity` varsa abone ol, değişince `activity:set` gönder. Yeniden bağlanınca son değeri tekrar gönder.
2. Store: kullanıcı başına `{ gameId, name }`; `activity:update` ve snapshot ile beslenir (ad sunucudan gelir, tablodaki ad).
3. Gösterim: çevrimiçi noktasının olduğu yerlerde ad altında küçük satır **"Valorant oynuyor"**: üye listesi, kanka listesi
   (render eden dosyayı doğrula: `FriendsRightPanel`, `FriendsPanel` ölü), UserCard, DM listesi. Taşma ölçülür (390/320 px).
4. Ayar: Kullanıcı Ayarları gizlilik bölümü (`web/src/views/settings/UserSettingsView.vue`) "Oynadığım oyunu göster" anahtarı.
   Masaüstü dışında da görünür (ayar hesaba ait).
5. İlk algılamada bir kez bilgi notu: "Oynadığın oyun kankalarına ve ortak ortamlarındaki kişilere görünüyor. Ayarlardan
   kapatabilirsin." + Ayarlara git. Gösterildiği yerelde hatırlanır.
6. **Yayın önerisi** (yalnız masaüstü + kullanıcı ses kanalında/aramada + ekran paylaşım düğmesi o an zaten etkin):
   - Ses panelinde "Valorant'ı yayınla" düğmesi. Tıklayınca `setShareHint(name)` sonra mevcut ekran paylaşım akışı.
     Kapılar (adultsOnly/ageGated/mediaEnabled, DM video yasağı) aynen geçerli, yeni yol yok.
   - Oyun oturumu başına bir Windows bildirimi (mevcut `useNativeNotifications` yolu): "Valorant açıldı. Kankalarına yayınlamak
     ister misin?" Tıklayınca pencere öne gelir, aynı akış. Oyun kapanıp tekrar açılınca yeniden sayılır.
7. Metinler i18n'de, em dash yok.

## §5 Mobil
- Yalnız gösterim: `activity:update`/snapshot tüketimi + aynı yerlerde "oynuyor" satırı + `dm-privacy` ekranına (veya hesap gizlilik
  ekranına) ayar anahtarı. Mobil algılama yok. versionCode +1.

## §6 DoD
- api: build, test, `npx eslint` değişen dosyalar, `migrate status` temiz. web: `vue-tsc -b` (bilinen 6), build. mobil: typecheck + lint.
- desktop: `npm run dist`, C31a güncelleyicisiyle 1.2.0 olarak yayınlanır (güncellemenin ikinci gerçek sınavı).
- R7: §2 diff sahibe satır satır.
- **Sahip turu:** Valorant (elle liste), bir Steam oyunu ve bir Epic oyunu (ör. Fortnite) ayrı ayrı açılınca kankası web ve
  mobilde doğru adla "... oynuyor" görür · oyun kapanınca 15-20 sn içinde kalkar · ayar
  kapalıyken görmez · minör test hesabının oyunu ortak ortamdaki yabancıya görünmez · sesliyken bildirim bir kez gelir · düğme
  seçiciyi oyun penceresi seçili açar · Vanguard açıkken uygulama oyuna hiçbir şey yapmadığı için sorun çıkmadığı gözlenir.

**OUT:** oyun içi panel/katman · Steam/Riot hesap bağlama (bu sprintteki Steam yalnız yerel algılama, hesap bağlama değil) ·
GOG/EA/Ubisoft/Battle.net başlatıcı kayıtlarını okuma (elle liste karşılar, talep gelirse Epic kalıbıyla eklenir) ·
"oyunum algılanmıyor" bildirimi · admin panelinden elle oyun ekleme (seed + migration ile eklenir) · oyun süresi ve geçmişi kaydı · mac/linux algılama · kullanıcının liste
dışı oyun eklemesi · oyunların kendi bildirdiği zengin durum (harita, skor) · "dinliyor/izliyor" türleri.
