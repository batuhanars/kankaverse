# SPRINT C31c: Oyun yüzeyleri (logo, kart şeridi, Şimdi Aktif, yayın penceresi)

> Durum: **TAMAMLANDI (2026-10-29), sahip turu geçti** (logo, şerit, Şimdi Aktif, yayın penceresi, kayan yazı; oyun kolu simgesi dolgulu yeşil). PM compose (Opus). **api + web (+ masaüstü yalnız mevcut köprü) +
> mobil yalnız renk.** C31b sahip turundan doğdu, Discord ekran görüntüleri referans (bilgi düzeni; görsel kopya değil, kendi
> token'larımız). **R7-nötr olmalı:** oyun görünürlük kuralı (C31b §2) DEĞİŞMEZ, yayın kapıları DEĞİŞMEZ. Sapma ihtiyacı → DUR.

---

## §0 Sahip kararları
- Oyun yazısı her yerde **normal yazı rengi** (yeşil yalnız çevrimiçi göstergesi).
- Kendi kartında "oynuyor" eki yok: "🎮 Oyun Adı". Başkalarını görürken "X oynuyor" kalır.
- Sağ panel genişleyebilir (orta alanın iç boşlukları küçülür, sahip kabul etti). Ölçülür.
- SD/HD seçimi yok.

## §1 Oyun logosu (api)
1. `Game.iconUrl String?` + migration (yerel DB'ye uygulanır, `migrate status` temiz).
2. Kaynak:
   - **STEAM:** sunucu Steam'in resmî küçük simgesini bulur (dev doğrular: ör. `IStoreBrowseService/GetItems` `assets.community_icon`
     ya da `capsule_sm_120`; anahtarsız çalışan ve kare/kareye yakın olan). Bulunamazsa `iconUrl` null.
   - **CURATED:** yalnız Steam'de karşılığı kesin olan oyunlara migration'da `steamAppId` eşlemesiyle aynı yoldan simge (dev doğrulayamadığını koymaz).
     Diğerleri null. Sonradan simge eklemek veri işidir (bu sprintte yönetim ekranı yok).
   - **EPIC:** null (güvenilir kaynak yok).
   - **Kullanıcının bilgisayarından simge ALINMAZ** (başkasına gösterilecek görseli istemci sağlayamaz).
3. **Gizlilik:** istemci Steam'e ASLA istek atmaz. Sunucu simgeyi bir kez indirir, mevcut görsel hattıyla (sharp) 64x64 WebP'ye çevirir,
   mevcut depolamaya public olarak yazar (avatar/simge yolu kalıbı, `cdn.kankaverse.com`), `iconUrl`'e kendi adresimizi yazar.
   İndirme arka planda (`activity:set` cevabını bekletmez); boyut ve zaman aşımı sınırı; içerik türü image değilse atılır.
4. `activity:update` ve `presence:snapshot` oyun nesnesi `{ id, name, iconUrl }` taşır. `GET /games/curated` değişmez.
5. Test: Steam simgesi başarı/başarısızlık, null yolları, iconUrl yayında.

## §2 Kendi kartı (web `UserCard.vue`)
1. Oyun varken kartın ÜSTÜNDE ayrı şerit: logo (yoksa genel oyun kolu simgesi) + oyun adı + sağda **Yayınla** düğmesi (§4 penceresini açar).
   Oyun yoksa şerit hiç yok. Şerit kart genişliğini aşmaz.
2. Ad altı satırı: küçük oyun kolu simgesi + oyun adı, "oynuyor" eki yok, normal yazı rengi.
3. Yayınla düğmesi yalnız masaüstünde (`window.kankaverse?.setShareHint` varsa); tarayıcıda şerit düğmesiz.

## §3 Sağ panel "Şimdi Aktif" (web `FriendsRightPanel.vue`)
1. Panelin en üstünde **Şimdi Aktif** bölümü: oyun oynayan kankalar, kart olarak (avatar + ad + logo + oyun adı). Kaynak yalnız mevcut
   activity store (görünürlük sunucuda zaten süzülmüş). Kimse yoksa tek satırlık sakin boş mesaj (büyük kutu değil).
2. **Sesli kanaldakiler bu sprintte YOK:** toplu ses durumu yeni bir görünürlük yüzeyi olur (R7). Mevcut bir uç/olay bunu yeni ifşa
   olmadan veriyorsa dev raporlar, kendisi eklemez.
3. Panel genişliği artırılır (dev mevcut değeri raporlar, öneri ~340 px). 1280 px'te orta alan ölçülür, ekran görüntüsüyle raporlanır.
   Daha dar ekranda mevcut kırılım davranışı korunur.
4. Liste satırlarında oyun satırı tam genişlik + normal renk. Aksiyon düğmeleri hover'da üstte (bugünkü gibi).

## §4 Yayın penceresi (web, yalnız masaüstü)
1. §2 Yayınla düğmesi modal açar: üstte arama ("Yayın yapmak için bir ses kanalı ara"), altında **Son kanallar**, en altta oyun logosu + adı.
2. Liste yalnız kullanıcının **erişebildiği ve ekran paylaşımı izinli** ses kanalları. Uygunluk, ses panelinin ekran paylaşım
   düğmesini açarken kullandığı kuralın AYNISIYLA hesaplanır (kopya kural yazma; ortak yardımcıya çıkar). Sunucu yine otorite.
3. Son kanallar: kullanıcının son girdiği ses kanalları (yerel, en fazla 5), açılışta erişim/uygunluk süzgecinden geçer.
4. Arama: üye olunan ortamların ses kanalları; kanal listesi yüklü değilse mevcut API ile çekilir.
5. Seçim: o kanalda değilse mevcut ses katılma akışı (başka kanaldaysa mevcut geçiş davranışı), bağlanınca `setShareHint(oyun adı)`
   + mevcut ekran paylaşım akışı (seçici oyun penceresi seçili, kullanıcı onaylar; nudge'lar aynen). Yeni paylaşım yolu yok.
6. Klavye: Esc kapatır, ok tuşları + Enter seçer.

## §5 Düzeltmeler
1. **MarqueeText kaymıyor** (canlıda sahip gördü): iç `span`'ı `transform: translateX` ile kaydır. Hover'da taşıyorsa kayar, sonu görünür,
   çıkınca döner; "…" yok (düz kırpma). **Tarayıcıda çalıştığı doğrulanmadan teslim yok** (ölçemiyorsan açıkça yaz).
2. Oyun yazısı rengi: web (üye listesi, sağ panel, kart, popover) ve **mobil** (DM başlığı, üye satırları, profil kartı) normal yazı rengi.

## §6 DoD
- api: build, ilgili jest + tam koşu, değişen dosyalara `npx eslint`, `migrate status` temiz.
- web: `vue-tsc -b` (bilinen 6), `vite build`, eslint. 1280 / 1024 / 390 px'te sağ panel + kart ölçümü (taşma yok).
- mobil: typecheck + lint (yalnız renk). versionCode 38 kalır (henüz Play'e gitmedi).
- Masaüstü yeni sürüm GEREKMEZ (web load-remote; `setShareHint` 1.2.0'da var).
- **Sahip turu:** AoE IV açıkken kartın üstünde logolu şerit · ad altında "🎮 Age of Empires IV" · kanka hesabında Şimdi Aktif kartı
  logolu · Yayınla → pencere → kanal seç → kanala girip seçici AoE penceresi seçili · yalnız paylaşıma izinli kanallar listede ·
  sağ panel ve üye listesinde uzun oyun adı hover'da kayıyor · oyun yazısı yeşil değil.

**OUT:** Şimdi Aktif'te sesli kanaldakiler (R7 yüzeyi, ayrı karar) · Epic ve Steam karşılığı olmayan elle liste oyunlarına logo ·
mobilde logo/Şimdi Aktif · SD/HD · oyun simgesi yönetim ekranı · müzik/Spotify kartı.
