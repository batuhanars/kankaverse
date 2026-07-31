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
