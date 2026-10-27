# SPRINT C18: Karşılama ve mobil Keşfet

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Kurul verdikti 2026-09-08'in onayladığı
> "A5 minimal karşılama" çizgisinde. Sıra: **mobil + web paralel, api değişmez.** Mobil yalnız JS (yeni native
> paket yok) ama mağaza sürümü çıkar (versionCode 27).
> **R7-nötr:** katılma kapıları (`join-discovery`: yaş, ban, zaten üye) ve `adultsOnly` minör süzmesi sunucuda,
> Sprint 7A/C6'da R7'den geçti. İstemci yalnız sonucu gösterir, ek süzme veya baypas yazmaz.

---

## §0 Neden ve kararlar

**Veri (2026-10-27, canlı, moderatörler hariç):** web'den gelen 28 kişiden 14'ü bir ortama girdi (%50),
mobilden gelen 20 kişiden **2'si** (%10). Mobilde Keşfet ekranı yok, ortama tek giriş yolu davet kodu.
Web'de Keşfet var ama ortamı olmayan kullanıcının ana ekranı onu önermiyor.

**Kilitli kararlar:**
- **Otomatik katılma YOK** (sahip + PM, 2026-10-27). Sayıyı şişirir, kalmayı sağlamaz; reşit olmayanı yabancı
  odasına kendiliğinden düşürür. Kullanıcı seçer, biz sürtünmeyi kaldırırız.
- **Api değişmez.** `GET /discovery/guilds` ve `POST /guilds/:id/join-discovery` olduğu gibi kullanılır.
- **Önerilen ortamlar = Keşfet listesinin ilk 3'ü** (sunucu zaten üye sayısına göre sıralıyor). Ayrı "öne çıkan"
  bayrağı, elle seçim, çevrimiçi sayısı YOK (çevrimiçi sayısı api değişikliği ister ve sessiz odada "0 çevrimiçi"
  ters etki yapar; oda canlanınca ayrı karar).
- Öneri bloğu **yalnız kullanıcının hiç ortamı yokken** görünür. Bir ortama girince kendiliğinden kaybolur.
  Kapatma düğmesi, "bir daha gösterme" ayarı yok.
- Keşfet boş dönerse öneri bloğu hiç çizilmez (boş iskele koyma).

**OUT:** api değişikliği · çevrimiçi sayısı · etiket filtresi mobilde (arama yeter, ikinci tur) · onboarding
sihirbazı / ilgi alanı seçimi · bildirim ya da e-posta ile hatırlatma · masaüstü tier'ı.

---

## §1 Mobil (yalnız JS)

1. `mobile/src/api/discovery.ts`: `listGuilds({ q?, cursor? })`, `joinDiscovery(guildId)`. Tipler web'deki
   `DiscoveryGuildDto` / `DiscoveryListDto` ile aynı şekil (OpenAPI kaynağı).
2. **Yeni ekran `(app)/discover.tsx`:** üstte arama kutusu (yazma bitince istek, debounce), altında kart listesi,
   sonuna gelince sonraki sayfa (`cursor`). Kart: ortam ikonu/baş harfleri, ad, açıklama (2 satır), üye sayısı,
   etiketler (yalnız gösterim), sağda **Katıl** ya da zaten üyeyse **Git**. Katıl sırasında düğme meşgul, iki kez
   tetiklenmez. Başarıda guild store'a eklenir ve ortamın ilk kanalına gidilir (mevcut davetle katılma sonrası akış
   neyse o). Sunucu hatası Türkçe `message` ile gösterilir (yaş kapısı dahil, istemci metin uydurmaz).
3. **Giriş noktaları:**
   - `AddGuildSheet`: mevcut "Ortam kur" ve "Ortama katıl"a ek üçüncü seçenek **"Ortam keşfet"**.
   - Ortamı olmayan kullanıcının ana ekranında **öneri bloğu**: başlık "Sana uygun ortamlar" + ilk 3 kart (aynı
     kart bileşeni) + "Tümünü gör" → `discover`. Bloğun ana ekranda nereye oturacağına dev mevcut düzene bakarak
     karar verir; DM listesinin üstü ya da boş içerik alanı. **Mevcut düzeni bozan bir yer gerekirse DUR.**
4. i18n `mobile.discover.*`, kaynak `web/src/i18n/tr.json`. Uzun çizgi yok.
5. Klavye: arama kutusu açıkken liste klavyenin altında kalmamalı (gerçek inset, sabit dolgu değil).

## §2 Web

1. `HomeDashboard.vue` hızlı eylemlerine **"Ortam keşfet"** kutucuğu (her zaman görünür) → `/discover`.
2. Ortamı olmayan kullanıcıda "Ortamlarım" bölümünün boş metni yerine **öneri bloğu**: ilk 3 ortam,
   `DiscoverGuildCard.vue` yeniden kullanılır + "Tümünü gör". Katılma akışı `DiscoverView.vue`'daki `joinGuild`
   ile aynı; iki yerde aynı kodu tutma, ortak bir composable'a çıkar (2. kullanım, ama aynı hata/yönlendirme
   mantığı ayrışırsa kusur doğar: burada Rule of Three'nin istisnası).
3. 390/320px'te kartlar tek sütun, taşma yok.
4. i18n `home.*` / `discover.*`. Uzun çizgi yok.

---

## §3 DoD
- [ ] mobil: discovery api + Keşfet ekranı (arama, sayfalama, Katıl/Git, meşgul durumu, sunucu hata metni)
- [ ] mobil: AddGuildSheet "Ortam keşfet" + ortamsız ana ekranda öneri bloğu
- [ ] web: "Ortam keşfet" kutucuğu + ortamsız ana ekranda öneri bloğu + ortak katılma composable'ı
- [ ] build/test: mobil typecheck + lint; web `vue-tsc -b` (bilinen 6) + `vite build`
- [ ] Sahip turu (yerel, dev build): **yeni hesapla** kayıt → öneri bloğu görünüyor → Katıl → kanala düştü →
      blok kayboldu. Reşit olmayan hesapta `adultsOnly` ortam listede yok.
- [ ] Sahip turu (web + masaüstü): aynı akış, 390/320 ölçümü
- [ ] Mağaza sürümü: versionCode 27 release paketi canlıya karşı cihazda (Keşfet + katılma)
- [ ] Takip: C17 huni panelinde 2 hafta sonra mobil "ortama girdi" oranı (taban %10)

## §4 Sapma kuralı
Şunlar → **DUR, PM'e dön:** api değişikliği · istemcide yaş/ban süzmesi ya da kapı baypası · yeni native paket ·
otomatik katılma benzeri davranış · ana ekran düzenini yeniden kurmayı gerektiren yerleşim.
