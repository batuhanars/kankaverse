# Sprint M1d — Mobil Ortam Bütünlüğü (Track F2, PM compose 2026-07-31)

> **Tek doğruluk kaynağı.** Endpoint imzası, DTO şekli, hata kodu ve ekran sayısı bu dosyadan
> **sapamaz**. Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
> `TASK.md`'ye item ekleme, yalnız kutu işaretle.
>
> **Varlık sebebi:** bugün mobilde **ortama katılmanın hiçbir yolu yok**. Kullanıcı üyesi olduğu
> ortamları görüyor ama yenisine giremiyor, yeni ortam da kuramıyor. Topluluk uygulamasında
> topluluğa katılamamak cila eksiği değil, çekirdeğin eksik olmasıdır.
>
> **Bu sprint neden R7-NÖTR olmalı:** ortama katılma kapıları (yaş, ban, zaten-üye) Sprint 7A'da
> sunucuya yazıldı ve R7'den geçti. Mobil **yalnız sonucu gösterir**. `api/`'ye dokunma ihtiyacı
> doğarsa **DUR** — bu sefer istisna beklenmiyor.

---

## 0. Kaynaktan doğrulanmış gerçekler (2026-07-31, koddan okundu)

> **M1b dersi:** DTO alan adları ve uzunlukları **dosyadan okunur**, hatırdan yazılmaz
> (`friendCode` "8 karakter" sanılmıştı, gerçekte 6'ydı ve sözleşmeye yanlış geçmişti).
> Aşağıdakiler bugün koddan doğrulandı; **yine de dev kendi dokunduğu DTO'yu açıp bakar.**

**Mobilde bugün ne var:**
- `guildsApi` yalnız **`list()`** taşıyor (`GET /guilds`). Katılma, kurma, davet, kategori **yok**.
- Ortam listesi `home.tsx` içinde **yerel state** (store değil) — katılma sonrası tazeleme yolu
  buna göre kurulacak (bkz. §6).
- `ChannelSidebar` kanalları yalnız `position`'a göre sıralıyor, **`categoryId`'yi yok sayıyor**.
- Mobil `ChannelDto` zaten `categoryId: string | null` taşıyor — **yeni alan gerekmiyor**.
- `GUILD_INVITE` bildirimi hâlâ **hedefsiz** (M1b §10 + M1d-0 §4'te ertelenmişti).

**Sunucuda ne var (dokunulmayacak):**

| Uç | Yetki | Gövde / dönüş | Not |
|---|---|---|---|
| `POST /guilds/:id/invites` | OWNER/ADMIN | `CreateInviteDto { maxUses? 1-1000, expiresInHours? 1-720 }` → `InviteDto` | ikisi de opsiyonel; boş = sınırsız/süresiz |
| `GET /guilds/:id/invites` | OWNER/ADMIN | `InviteDto[]` | aktif davetler |
| `DELETE /invites/:code` | OWNER/ADMIN | — | iptal |
| `GET /invites/:code` | auth | `InvitePreviewDto { guildName, adultsOnly, valid }` | 🔴 **yalnız üç alan** — ikon, üye sayısı, açıklama YOK |
| `POST /invites/:code/join` | auth | → `GuildDto` | **R7 kapısı burada** |
| `POST /guilds` | auth + **doğrulanmış e-posta** | → `GuildDto` | `VerifiedEmailGuard` → `403 EMAIL_NOT_VERIFIED` |
| `POST /guilds/:id/categories` | OWNER/ADMIN | `CreateCategoryDto { name 1-50 }` | |
| `GET /guilds/:id/categories` | üye | kategori listesi | |
| `PATCH /categories/:id` · `DELETE /categories/:id` · `PATCH /guilds/:id/categories/reorder` | OWNER/ADMIN | | sıralama = ayrı uç |

**`POST /invites/:code/join` hata kodları (birebir, uydurulmayacak):**

| Kod | HTTP | Anlamı |
|---|---|---|
| `INVITE_INVALID` | 404 | kod yok / süresi dolmuş / kullanım hakkı bitmiş / iptal edilmiş |
| `AGE_RESTRICTED` | 403 | `adultsOnly` ortam + minör kullanıcı |
| `GUILD_BANNED` | 403 | bu ortamdan yasaklı |
| `ALREADY_MEMBER` | 409 | zaten üye |

---

## 1. DoD — **fiziksel cihazda görülerek** kapanır

> Sprint **iki yarıya bölünmüştür**; A yarısı kapanmadan B'ye geçilmez. Sebep: M1d-0 turu küçük
> parçanın gerçekten yürünebildiğini, büyük parçanın kusuru gizlediğini gösterdi.

### DoD-A — Ortama girebilmek (bu sprintin varlık sebebi)
1. **Davet kodu/linki ile ortama katılabiliyorum** ve ortam ray'da anında beliriyor.
2. **Geçersiz/süresi dolmuş kod** denendiğinde sebebi anlıyorum (sunucunun mesajı).
3. **Zaten üye olduğum** koda basınca uygulama beni o ortama götürüyor, hata ekranında bırakmıyor.
4. **Yeni ortam kurabiliyorum**; kurunca içine düşüyorum.
5. 🔴 **E-postası doğrulanmamış hesap ortam kuramıyor ve sebebini görüyor** *(M1c'den sarkan DoD
   maddesi burada kapanır — M1c'de "M1d'de ortam kurma gelince anlamlı olur" diye bırakılmıştı)*.
6. **Kendi ortamıma davet üretip paylaşabiliyorum** (kopyala + paylaş).

### DoD-B — Ortamı düzenlemek
7. **Kanallar kategorileri altında gruplu** görünüyor; kategorisiz kanallar da kayboluyor değil.
8. **Kategori açıp kapatabiliyorum** (collapse) ve tercih uygulama yeniden açılınca korunuyor.
9. **OWNER/ADMIN isem** kategori oluşturabiliyor/adlandırabiliyor/silebiliyorum; **değilsem bu
   aksiyonlar hiç render edilmiyor** (disabled değil).
10. `GUILD_INVITE` bildirimi artık **tıklanabilir** ve beni ilgili yere götürüyor.

### Her iki yarı için
11. Metin `tr.json`'dan, renk/ölçü `src/theme`'den; **gömülü string yok**.
12. `typecheck` + `lint` temiz; **`api/`'ye dokunulmadı**.

---

## 2. Yapılacaklar — kilitli sıra

**Sıra sahip kararıdır: davetle katılma ÖNCE.** Kurma ve kategori onun üstüne gelir.

### 2.1 `guildsApi` genişletmesi (yeni uç bağlama, yeni uç YAZMA)
`join(code)` · `create(name)` · `createInvite(guildId, dto)` · `listInvites(guildId)` ·
`revokeInvite(code)` · `previewInvite(code)`. Kategoriler için ayrı `categoriesApi`.

### 2.2 Ortama Katıl ekranı
- Kod girişi. **Kullanıcı tam linki yapıştırırsa koda indirgenir** (`.../invite/AB3K7PQZ` → `AB3K7PQZ`).
  Gerekçe: paylaşılan şey link, kullanıcıdan link ayrıştırması beklemek gereksiz sürtünme.
- **Önizleme** (`GET /invites/:code`): `guildName` + geçerlilik. `adultsOnly` **true ise görünür
  uyarı**; ama karar sunucunun, istemci kapı KURMAZ (§4).
- Katıl → başarıda o ortama git. Hatalar **sunucunun Türkçe mesajıyla**, `extractErrorMessage` ile.
- `ALREADY_MEMBER` (409) **hata gibi gösterilmez** → kullanıcı zaten üyeyse ortama götürülür (DoD-A/3).

### 2.3 Ortam Kur ekranı
- Ad girişi → `POST /guilds` → başarıda içine düş.
- `403 EMAIL_NOT_VERIFIED` → sunucunun mesajı + **M1c'de yazılan doğrulama bandına yönlendiren**
  görünür çıkış. Yeni doğrulama akışı yazma, mevcut bandı kullan.

### 2.4 Davet üret & paylaş (yalnız OWNER/ADMIN)
- Ortam menüsünden "Davet Et" → kod üret (`POST /guilds/:id/invites`) → **kopyala + paylaş**.
- Paylaşılan metin **web ile birebir aynı format**: `<web-origin>/invite/<code>`
  (`InvitePeopleModal.vue` deseni; `EXPO_PUBLIC_WEB_URL` kökü). **Yeni link formatı uydurma.**
- `maxUses`/`expiresInHours` **bu sprintte sorulmaz** — varsayılan (sınırsız/süresiz) kullanılır.
  Gerekçe: iki opsiyonel alan için form açmak, davetin önündeki sürtünmeyi ürünün kendisinden
  büyütür. Sınırlı davet gerekiyorsa web'de var.
- Aktif davetleri listeleme/iptal **kapsam dışı** (§7).

### 2.5 Kategoriler (DoD-B)
- `GET /guilds/:id/categories` + mevcut kanal listesi → **kategori başlığı altında gruplu** render.
- **Kategorisiz kanallar en üstte, başlıksız** akar (web `ChannelPanel` ile aynı okuma).
- **Collapse:** kategori başlığına dokun → aç/kapa. Tercih cihazda saklanır. Web anahtar desenini
  kullan: `kv:cat-collapsed:<guildId>:<categoryId>` (web `localStorage`, mobil `AsyncStorage`).
  **Aynı anahtar şeması** — iki istemci arasında zihinsel model bölünmesin.
- **Yönetim** (oluştur/adlandır/sil): yalnız OWNER/ADMIN'e **render edilir**. Yetkisiz kullanıcıya
  disabled düğme gösterilmez (M1b grup yönetimi deseni).
- **Sürükle-sırala YOK** (`reorder` ucu bağlanmaz) → §7.

### 2.6 `GUILD_INVITE` bildirimi hedefi
Bildirim `guildId` + `guildName` taşıyor. Dokununca **o ortama git**. Ortama üye değilse (davet
kabul edilmemişse) bildirim **tıklanamaz kalır** — davet kabul ekranı yok, hedef uydurulmaz.

---

## 3. Ekran envanteri

| Ekran | Yeni? | Not |
|---|---|---|
| Ortama Katıl | yeni | kod/link girişi + önizleme |
| Ortam Kur | yeni | ad girişi |
| Davet Et | yeni | kod üret + kopyala/paylaş |
| Kategori yönetimi | yeni | yalnız OWNER/ADMIN |
| `ChannelSidebar` | değişir | gruplu render + collapse |
| `GuildRail` | değişir | "+" girişi (Katıl / Kur) |
| Bildirimler | değişir | `GUILD_INVITE` hedefi |

**Rail "+" davranışı:** tek dokunuş → iki seçenek (**Ortama Katıl** · **Ortam Kur**). Web'deki
`ServerModal` `choose` adımının mobil karşılığı. Ayrı iki düğme koyma.

---

## 4. 🔴 T&S — istemcinin sınırı

- **Katılma kapıları sunucudadır** (Sprint 7A, R7'den geçti): `adultsOnly && isMinor → AGE_RESTRICTED`,
  ban → `GUILD_BANNED`, zaten-üye → `ALREADY_MEMBER`. İstemci bu kararları **yeniden hesaplamaz,
  gevşetmez, taklit etmez.**
- **`adultsOnly` uyarısı bir kapı DEĞİL, bilgilendirmedir.** Önizlemede gösterilir çünkü kullanıcı
  neye girdiğini bilmeli; ama "minörsen düğmeyi gizle" **YAPILMAZ** — yaş kararı sunucunun ve
  istemcide yaş durumu saklamak yeni bir sızıntı yüzeyidir.
- **Ret mesajları sunucudan geldiği gibi** gösterilir. Hata koduna göre metin uydurma; tek istisna
  `ALREADY_MEMBER`, o da mesaj değiştirmek için değil **yönlendirmek** için özel ele alınır (§2.2).
- **Davet kodu yeni bir ifşa yüzeyi açmaz:** web zaten aynı kodu ve aynı link formatını üretiyor.
  Mobil **format uydurmaz**, aynısını paylaşır.
- **Public davet linki (A5) bu sprintin işi DEĞİL.** Hesapsız ziyaretçi için karşılama sayfası yok;
  link auth duvarına çıkar, web'de olduğu gibi. A5'i bu sprintte "hazırlamaya" çalışma.

---

## 5. i18n + tema

- Metinlerin çoğu web'de **zaten var** (`invite.*`, `guild.*`, `channel.*`). **Önce ara, bulamazsan
  ekle.** Yeni anahtar gerekirse kaynak dosya `web/src/i18n/tr.json` (mobil kopyalamaz, import eder).
- Mobil-özel metin `mobile.*` altına.
- Renk/ölçü `src/theme`. **Gölge yok.**

---

## 6. Uyulacak yerleşik desenler

- **Katılma sonrası ray tazelenmeli.** Ortam listesi bugün `home.tsx` yerel state'inde. En küçük
  doğru çözüm: katılma/kurma sonrası mevcut `fetchGuilds` yeniden çalışsın. **Bu iş için yeni bir
  guild store AÇMA** — gerçek acı doğmadan store açmak erken soyutlamadır (Rule of Three).
  *Ama:* birden fazla ekran listeyi tazelemek zorunda kalıyorsa acı gerçektir → **DUR, PM'e sor.**
- **Oturum kapsamlı state:** yeni state tutulursa `(app)/_layout.tsx`'teki `reset()` zincirine girer
  (M1b §8.3'te bir kez yaşanan sızıntı sınıfı).
- **Yıkıcı işlem onay ister:** kategori silme `ConfirmDialog` ile.
- **Yetkisiz aksiyon render EDİLMEZ**, disabled gösterilmez.
- **Boş yüzey açma:** hedefi olmayan bildirim tıklanabilir yapılmaz; olmayan özelliğe iskele konmaz.
- **Hatalar** `extractErrorMessage` ile sunucunun Türkçe `message`'ından.
- **Dosya boyu 300 satır.** `ChannelSidebar` bugün 223 satır; kategori grubu + collapse ile eşiğe
  yaklaşır → **kategori başlığı ayrı bileşene çıkar** (D29 sınıfı yeni borç üretme).

---

## 7. Kapsam DIŞI — bilinçli

- **Davet listeleme/iptal ekranı** (uçlar var, ekran yok) — ortam ayarları işi, mobilde ortam
  ayarları yüzeyi henüz yok.
- **`maxUses`/`expiresInHours` formu** (§2.4 gerekçesi).
- **Kanal/kategori sürükle-sırala** (`reorder` uçları) — dokunmatik sürükle-sırala web'de bile
  ertelenmiş durumda (PLAN responsive §"Ertelendi→V2").
- **Kanal oluştur/sil/adlandır** — ortam yönetiminin ayrı parçası, M1e adayı.
- **Üye listesi / kick / ban / rol** — M1a'da bilinçle bırakıldı (mobilde sağ üye paneli yok).
- **Keşfet (`/discovery`)** — ayrı yüzey, ayrı sprint.
- **A5 public davet karşılama sayfası** (§4).
- **Ortam ikonu/afişi yükleme** — mobilde upload yüzeyi hiç yok, ayrı karar.

---

## 8. Sapma kuralı

Uç imzaları, hata kodları, kilitli sıra (katılma → kurma → davet → kategori), "yetkisiz aksiyon
render edilmez" ve §7 kapsam-dışı listesi bu dosyadan **sapamaz**. Yeni bağımlılık = **PM onayı**.
**`api/`'ye dokunma ihtiyacı → DUR** (bu sprintte istisna beklenmiyor; M1d-0'daki gibi bir T&S
kuralı değişimi gerekiyorsa o ayrı karardır, sessizce yapılmaz).

---

## 10. B yarısı kapsam revizyonu (sahip kararı 2026-07-31, Discord mobil incelemesi sonrası)

> Sahip Discord mobilin sunucu yönetimini ekran ekran inceleyip aktardı. Dört karar alındı; hepsi
> **kapsamı büyütüyor**, gerekçeleriyle birlikte aşağıda. **Ölçü kuralı değişmedi:** Discord'da olup
> bizde olmayan özellik EKLENMEZ; web'de olan her özellik mobile de gelir (bilinçli istisnalar hariç).

### 10.1 Kanal CRUD **M1d-B'ye çekildi** (önce M1e'deydi)

§7'de "kanal oluştur/sil/adlandır → M1e adayı" yazıyordu. **Geri alındı.** Gerekçe: kategori ile kanal
aynı yüzeyin iki yarısı (Discord da tek "Oluştur" sayfasında birleştiriyor). Ayrı bırakılsa mobilde
**kategori açabilen ama içine kanal koyamayan** kullanıcı çıkardı — yarım yüzey.

### 10.2 Ortam adı → **alt panel** (bottom sheet); tekil "Davet Et" ikonu kalkar

A yarısında sidebar başlığına tek bir davet ikonu konmuştu. Ortam aksiyonları çoğaldıkça (kanal
oluştur, kategori oluştur, davet, ayarlar, ayrıl) 264dp'lik başlığa ikon dizmek tıkanır. Ada dokun →
alttan panel: Discord'un çözümü ve bizim yüzeyimize de uyuyor. **A yarısında doğrulanmış bir öğe
değişiyor** — bilinçli, sahip onaylı.

**Panelde YALNIZ sahip olduğumuz aksiyonlar:** Davet Et · Kanal Oluştur · Kategori Oluştur ·
(yetkisizde bunların hiçbiri). **Konmayacaklar:** Takviye/boost · Topluluk · Entegrasyonlar · Emoji ·
İstila Bildir · Sunucu ID Kopyala · Etkinlik Oluştur (web'de var ama M1d işi değil, §10.5).

### 10.3 Ortam afişi: **mobil GÖSTERİR, YÜKLEMEZ** (kalıcı kural)

Discord mobil sunucu afişini gösteriyor ama yükletmiyor; sahip de aynı ayrımı seçti. Bizde
`GuildDto.bannerUrl` C8'den beri var → mobilde göstermek veri açısından bedava.

> 🔴 **Kural (tekrar edecek):** görsel **yükleme** yüzeyleri web/masaüstüne mahsustur; mobil aynı
> görselleri **gösterir**. Avatar, profil afişi, ortam ikonu ve ortam afişi için aynı ayrım geçerlidir.
> Bir sonraki fazda "mobilde neden yükleyemiyorum" sorusu geldiğinde cevap burada.

### 10.4 M1d-B / M1e sınırı

- **M1d-B = ortamı KULLAN:** kategoriler · kanal CRUD · ortam adı alt paneli · afiş gösterimi ·
  `GUILD_INVITE` hedefi.
- **M1e = ortamı YÖNET** (ayrı sözleşme): roller · üyeler · yasaklar · denetim kaydı · ortam ayarları
  (web `guildSettings.nav`: Genel/Roller/Davetler/Yasaklar/Denetim Kaydı/Ortamı Sil).

Gerekçe M1d-0 turunun dersidir: küçük sprint yürünebiliyor, büyük sprint kusuru gizliyor.

### 10.5 Etkinlikler — açık karar

Web'de **var** (`CreateEventWizard.vue` + `EventsModal.vue`), yani parite kuralı gereği mobile de
gelecek. **M1d'nin işi değil.** M1e'ye mi girer yoksa kendi küçük sprintine mi — **sahip kararı,
henüz verilmedi.**

---

## 11. B yarısı — kaynaktan doğrulanmış uçlar ve **iki tuzak** (2026-07-31)

| Uç | Yetki | Not |
|---|---|---|
| `POST /guilds/:id/channels` | OWNER/ADMIN | `CreateChannelDto` |
| `PATCH /channels/:id` | OWNER/ADMIN | ad · `ageGated` · `categoryId` · `isPrivate` … |
| `DELETE /channels/:id` | OWNER/ADMIN | **son kanal silinemez → `409 LAST_CHANNEL`** |
| `POST /guilds/:id/categories` · `PATCH /categories/:id` · `DELETE /categories/:id` | OWNER/ADMIN | `CreateCategoryDto { name 1-50 }` |
| `GET /guilds/:id/categories` | üye | |

### 🔴 Tuzak 1 — kanal adı deseni

`CreateChannelDto`: `@MinLength(2) @MaxLength(50)` **+ `@Matches(/^[a-z0-9çğıöşü-]+$/)`**.
Yani **yalnız küçük harf, rakam, tire** (Türkçe küçük harfler dahil). "Genel Sohbet" yazan kullanıcı
sunucudan ret alır.

**Karar:** mobil girdiyi **yazarken normalize eder** (küçük harfe çevir · boşluk → tire · geçersiz
karakterleri düşür), Discord'un yaptığı gibi. Kullanıcıya reddedilecek bir şey yazdırıp sonra hata
göstermek kötü tasarım.

> **Web'de bu normalize YOK** (`ChannelPanel.vue` kullanıcının yazdığını olduğu gibi gönderiyor,
> sunucu reddediyor). Yani aynı sürtünme web'de duruyor. Bu, bugünkü davet-kodu-büyük-harf vakasıyla
> **aynı sınıf**: mobil doğrusunu yapar, web'e geri taşınması ayrı bir karardır. **Sahibe hatırlat.**

### 🔴 Tuzak 2 — ses kanalı oluşturma

`type: 'GUILD_VOICE'` uç tarafından destekleniyor **ama mobil ses kanallarını LİSTELEMİYOR**
(`ChannelSidebar` M1a'da `GUILD_TEXT` süzüyor; gerekçe: girilemeyen satır = boş yüzey).
Ses kanalı oluşturulabilseydi kullanıcı **kendi yarattığı kanalı göremezdi.**

**Karar:** M1d-B'de mobil **yalnız metin kanalı** oluşturur; tür seçimi **sorulmaz** (Discord'daki
Metin/Ses seçicisi kopyalanmaz). Ses kanalı oluşturma, mobil sesi gerçekten kullanabildiğinde
(M4 ses fazı) açılır. Bu bir eksiklik değil, **görülemeyen sonuç üretmeme** kararıdır.

### Kanal oluşturmada sorulmayacak alanlar

`slowModeSeconds` · `userLimit` · `bitrate` · `mediaEnabled` → **sorulmaz** (varsayılan gider).
`isPrivate` ve `ageGated` → **sorulur**: ikisi de erişim kararıdır, sonradan bulunması zor bir
ayarı kurma anında sormak doğrudur (`ageGated` T&S kapısıdır — Sprint 4A `AGE_RESTRICTED`).

### DoD-B revizesi (§1'in yerine geçer)

7. Kanallar kategori başlığı altında gruplu; kategorisiz kanallar başlıksız akar
8. Kategori aç/kapa çalışıyor, tercih uygulama yeniden açılınca korunuyor
9. Yetkisizde kategori/kanal aksiyonları **hiç render edilmiyor**
10. `GUILD_INVITE` bildirimi hedefli
11. **Ortam adına dokununca alt panel açılıyor**; içindeki aksiyonlar yetkiye göre
12. **Kanal oluşturabiliyorum**; adı yazarken normalize ediliyor, reddedilmiyor
13. **Kanal adını değiştirebiliyor / silebiliyorum**; son kanalı silmeye çalışınca sebebini görüyorum
14. **Kategori oluştur/adlandır/sil** çalışıyor
15. **Ortam afişi gösteriliyor** (varsa); yükleme yüzeyi **YOK**
