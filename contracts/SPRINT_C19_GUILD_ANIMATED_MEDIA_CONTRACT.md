# SPRINT C19: Ortam simgesi ve afişi: hareketli + konumlandırma

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Sahip isteği: ortam simgesine ve afişine GIF/video,
> öncesinde profildeki gibi konumlandırma ve kesit seçimi. Sıra: **api → web + mobil.** Mobil yalnız JS
> (C13'ün native ayarı zaten var), mağaza sürümü C18 ile aynı paket (versionCode 27).
> **R7:** takedown (`MEDIA_REMOVE`) iki yeni alanı da temizlemeli, işleme hattı yeni hedef alıyor. Diff sahibe sunulur.

---

## §0 Neden ve kararlar

**Olay (2026-10-27):** ortam simgesi ham GIF olarak yüklenebiliyordu (D14 dönemi, C13 hattından önce). Mobil ray
simgeyi `react-native-svg` `<Image>` ile çiziyor; Android'de GIF verilince uygulama çöktü (sahip uygulamaya
giremedi, GIF kaldırılınca düzeldi). O ortamın her mobil üyesi aynı çöküşü yaşar. **Acil önlem ayrı commit'te
alındı:** api ve web ikon allowlist'inden `image/gif` çıkarıldı (bu sprintin parçası değil, ön koşulu).

**Kilitli kararlar:**
- **C13 deseni birebir:** `iconUrl` / `bannerUrl` **her zaman statik kare** (WebP) kalır; hareketli sürüm ayrı alanda
  (`iconAnimatedUrl`, `bannerAnimatedUrl`). Eski istemciler (Play'deki vc26) yalnız statik alanı okur, kırılmaz.
  Bu, çöküş sınıfını yapısal olarak kapatır: **hiçbir istemci SVG içine hareketli görsel vermez.**
- **Statik yükleme de sunucu hattından geçer** (C13b: sharp + kullanıcı kırpması). Ortam simgesi/afişi için ham
  dosyanın doğrudan public adrese yazıldığı yol yeni istemcilerde kullanılmaz.
- **Eski uçlar kalır:** `PATCH /guilds/:id/icon` ve `/banner` geriye uyum (vc26) ve kaldırma (`storageKey: null`)
  için yaşar. Kaldırma hareketli alanı da null'lar.
- **Yetki:** yalnız OWNER (mevcut `requireOwner`). Hareketli kapı `canCreateAnimated` (abonelik gelince tek nokta).
  `VerifiedEmailGuard` + saatlik 10 işlem sınırı (profil ile aynı).
- **Boyutlar:** simge = AVATAR (256 hareketli / 512 statik, kare). Afiş için önce web ve mobilde ortam afişinin
  gösterildiği oran ölçülür: profil afişiyle (5:2) aynıysa BANNER boyutu kullanılır, farklıysa yeni hedef boyutu
  tanımlanır ve PM'e bildirilir.
- **Gösterim:** hareketli sürüm yalnız `prefers-reduced-motion` / mobilde azaltılmış hareket kapalıyken.
  Web rayında simge **hover'da** oynar (C16 deseni); afiş göründüğü yerde oynar. Mobil ray (SVG altıgen) **daima
  statik**; mobilde hareketli afiş yalnız normal `Image` kullanan yüzeylerde.

**OUT:** sunucu taraması (A1, SCAN=false) · rol simgeleri · abonelik. (Keşfet kartı §7 ile kapsama alındı.)

---

## §1 Şema
`Guild.iconAnimatedUrl String?`, `Guild.bannerAnimatedUrl String?` + migration. **Migration yerelde uygulanır,
`migrate status` temiz** (DoD).

## §2 Backend
1. `AnimatedTarget`'a `GUILD_ICON`, `GUILD_BANNER` eklenir (boyut, önek `icons/` / `guild-banners/`, çıktı sınırı).
   Hedef → (tablo, alan, sahiplik kimliği) eşlemesi tek yerde; `deletePrevious` ortam anahtarlarını da siler.
2. Uçlar (envelope; `GuildDto` döner):
   - `POST /guilds/:id/animated/presign` (staging, profil presign'ının ortam karşılığı)
   - `POST /guilds/:id/icon/process` ve `POST /guilds/:id/banner/process`: gövde profildeki `ProcessAnimatedDto`
     ile aynı (kaynak anahtar, kesit başlangıç/süre, kırpma). Girdi statik görselse statik hattan, GIF/video ise
     hareketli hattan geçer (C13b'deki ayrım aynen).
3. `toGuildDto`, Keşfet DTO'su, davet önizlemesi: `iconAnimatedUrl`, `bannerAnimatedUrl` eklenir (OpenAPI).
4. **R7:** `moderation.service` `GUILD_ICON` / `GUILD_BANNER` takedown'ı hareketli alanı da null'lar
   (`USER_BANNER` deseni). Ortam silme/imha yolu varsa anahtarlar orada da temizlenir.
5. **Veri onarımı:** canlıda `iconUrl` uzantısı `.gif` olan ortam varsa migration içinde `iconUrl = null`
   (sahip yeniden yükler). Sayı sahibe raporlanır.
6. Test: hedef eşlemesi, OWNER dışı 403, takedown iki alan, kaldırma iki alan, statik/hareketli ayrımı, kapı.

## §3 Web
1. `GuildSettingsView.vue` simge ve afiş: profil düzenlemedeki akışın aynısı. Statik görsel → `MediaPositioner`;
   GIF/video → `AnimatedClipModal` (kesit + konum). Profil bileşenleri hedef parametresiyle yeniden kullanılır,
   kopyalanmaz. Kabul edilen türler profil ile aynı (`ANIMATED_ACCEPT` + statik türler).
2. Gösterim: ortam rayı simgesi hover'da hareketli (C16 yardımcısı), ortam kenar çubuğu afişi hareketli,
   ayarlar önizlemesi hareketli. Azaltılmış hareket tercihine uyar.
3. i18n mevcut `profile`/`animated` anahtarları yeniden kullanılır; ortama özgü metin `guildSettings.*` altına.
   Uzun çizgi yok. 390/320 ölçümü.

## §4 Mobil (yalnız JS)
1. `guild-settings.tsx` simge ve afiş: `profile-edit.tsx`'teki akışın aynısı (`MediaPositioner`,
   `AnimatedClipSheet`), hedef parametresiyle yeniden kullanılır.
2. **`GuildRailItem.tsx` ve her `react-native-svg` `<Image>` kullanımı yalnız statik `iconUrl` okur.** Kod yorumu
   ile sabitlenir (çöküş sebebi). Normal `Image` kullanan yüzeylerde (ayarlar başlığı, ortam afişi) hareketli
   sürüm azaltılmış hareket kapalıysa gösterilir.
3. Yeni native paket yok, `app.json` değişmez.

---

## §7 Ek (sahip isteği, 2026-10-27, R7 onayıyla aynı tur)

Sahip: hareketli ortam simgesi ve afişi **her yerde oynasın**: web ve mobil rayda, Keşfet kartlarında, karşılama
(öneri) bloğunda. Bu, §0'daki "web rayında hover'da" ve "mobil ray daima statik" kararlarını değiştirir.

1. **Ray kuralı (sahip revizyonu, aynı gün):** rayda yalnız **seçili (içinde bulunulan) ortamın** simgesi
   sürekli oynar. Web'de diğerleri **hover'da** oynar (C16 deseni korunur). Mobilde hover yok: seçili olmayanlar
   statik. Gerekçe: onlarca simgenin aynı anda oynaması dikkat dağıtır, pil/performans maliyeti (Discord deseni).
   Kanal listesi afişi ve ayarlar önizlemesi sürekli oynar.
   **Kartlar (sahip kararı, aynı gün):** web Keşfet sayfasında kart **hover'da** oynar (kartın herhangi bir
   yeri; simge + afiş birlikte). Web ve mobil **öneri bloğu** (3 kart, vitrin) sürekli oynar. **Mobil Keşfet**
   sürekli oynar (hover yok; liste sanallaştırılmış). Web'de aynı `DiscoverGuildCard.vue` iki yerde
   kullanıldığı için davranış prop ile seçilir.
2. **Web Keşfet + öneri bloğu** (`DiscoverGuildCard.vue` ikisinde de kullanılıyor): simge ve afiş hareketli.
3. **Mobil ray + mobil Keşfet kartı + öneri bloğu:** `react-native-svg` `<Image>` YERİNE normal RN `Image`
   (C13'te açılan animasyonlu WebP desteğiyle) + üstüne altıgen dışındaki köşeleri zemin rengiyle örten SVG
   katmanı (evenodd yol) + mevcut seçili çerçeve. **Yeni native paket YOK** (MaskedView vb. eklenmez).
   Ray öğesi ve Keşfet kartı aynı ortak `HexGuildIcon` bileşenini kullanır. Zemin rengi düz değilse (kartta
   farklı ton) bileşen zemin rengini prop olarak alır.
4. 🔴 **Çöküş kuralı sürer:** hiçbir `react-native-svg` `<Image>`'a hareketli adres verilmez. Tercihen ortam
   simgesinde `react-native-svg` `<Image>` kullanımı tamamen kalkar; kalan varsa yalnız statik okur.
5. Mobilde azaltılmış hareket açıksa statik.
6. Sahip turunda: 5+ hareketli simgeli rayda kaydırma akıcı mı (düşük segment cihaz dahil) ve köşe örtüsü
   koyu temada görünmüyor mu.

## §5 DoD
- [ ] §1 şema + migration yerelde uygulandı, `migrate status` temiz
- [ ] §2 api uçları + DTO + takedown + veri onarımı + testler
- [ ] §3 web akış + gösterim, 390/320
- [ ] §4 mobil akış; SVG yüzeyleri statik
- [ ] build/test: api `tsc --noEmit` + jest; web `vue-tsc -b` (bilinen 6) + `vite build`; mobil typecheck + lint
- [ ] **R7 insan incelemesi:** takedown + işleme hattı diff'i sahibe
- [ ] Sahip turu web: ortam simgesine GIF, videodan kesit, statik + konumlandırma; afiş aynı üçü; kaldırma
- [ ] Sahip turu mobil (dev build): aynı akış; **hareketli simgeli ortamda uygulama açılıyor, ray statik**;
      Play'deki vc26 ile aynı ortama girilince de çökme yok (eski istemci yalnız statik alanı görür)
- [ ] §7 ek: ray/Keşfet/öneri hareketli (web + mobil), SVG Image'a hareketli adres yok
- [ ] Mağaza sürümü: C18 ile birlikte versionCode 27

## §6 Sapma kuralı
Şunlar → **DUR, PM'e dön:** `iconUrl`/`bannerUrl`'e hareketli içerik yazma · eski PATCH uçlarını kaldırma ·
OWNER dışına yetki · yeni native paket · afiş oranı profil afişinden farklı çıkarsa yeni boyut tanımı (bildir,
sonra devam) · canlı veri onarımında beklenmeyen satır sayısı.
