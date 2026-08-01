# Sprint M1e — Mobil Ortam Yönetimi (Track F2, PM compose 2026-08-01)

> **Tek doğruluk kaynağı.** Uç imzası, DTO şekli, izin anahtarı ve ekran sayısı bu dosyadan
> **sapamaz**. Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
> `TASK.md`'ye item ekleme, yalnız kutu işaretle.
>
> **Varlık sebebi:** M1d ortamı KULLANILIR yaptı (katıl, kanal, kategori), M1d-C sohbeti tamamladı.
> Ama mobilde ortamı **yönetmenin hiçbir yolu yok**: üye atamıyor, rol veremiyor, yasak koyamıyor,
> ayarları değiştiremiyorsun. Sahibi olduğun ortamı telefondan yönetememek, topluluk uygulamasında
> sahipliğin yarısının eksik olmasıdır.
>
> **Referans:** sahibin Discord mobil ekran görüntüleri (2026-08-01). **Düzen alınır, içerik alınmaz.**

---

## 0. Kaynaktan doğrulanmış gerçekler (2026-08-01, koddan okundu)

**Sunucuda VAR (dokunulmayacak):**

| Uç | Yetki | Not |
|---|---|---|
| `GET /guilds/:id/members` | üye | rol önceliği OWNER>ADMIN>MEMBER, sonra username |
| `PATCH /guilds/:id/members/:userId/role` | **yalnız OWNER** | `ADMIN\|MEMBER`; OWNER rolü atanamaz |
| `DELETE /guilds/:id/members/:userId` | OWNER: ADMIN/MEMBER · ADMIN: yalnız MEMBER | at (kick) |
| `POST /guilds/:id/members/:userId/ban` | kick ile aynı hiyerarşi | kalıcı yasak |
| `GET /guilds/:id/bans` · `DELETE /guilds/:id/bans/:userId` | OWNER/ADMIN | |
| `POST /guilds/:id/members/:userId/transfer` | yalnız OWNER | hedef OWNER olur, eski sahip ADMIN |
| `POST /guilds/:id/leave` | üye | **OWNER ayrılamaz** (önce devret/sil) |
| `PATCH /guilds/:id` | yalnız OWNER | `name`, `adultsOnly` |
| `DELETE /guilds/:id` | yalnız OWNER | soft-delete |
| `GET /guilds/:id/audit-logs` | OWNER veya `MANAGE_GUILD` | cursor: `before` |
| `GET /guilds/:id/invites` (`MANAGE_GUILD`) · `POST` (`CREATE_INVITE`) · `DELETE /invites/:code` | | |
| `GET/POST /guilds/:id/roles` · `PATCH/DELETE /roles/:id` · `PATCH /guilds/:id/roles/reorder` | | |
| `POST/DELETE /roles/:id/members/:userId` | | role ata / kaldır |

**`RoleDto` (birebir):** `id · guildId · name · color · position · hoist · mentionable ·
permissions[] · iconUrl · isEveryone · isDefault · memberCount`

**`CreateRoleDto`:** `name` **1-50** · `color` **`@Matches(/^#[0-9a-fA-F]{6}$/)`** · `hoist` ·
`mentionable` · `permissions[]`

> 🔴 **Rol rengi SERBEST HEX** — afiş rengindeki preset kısıtı burada YOK. Discord'daki hex seçici
> bizde backend değişikliği olmadan yapılabilir. (Afiş rengi presetleri ayrı bir açık karar,
> bkz. TASK.md.)

**16 izin anahtarı** (`web/src/i18n/tr.json` `guildSettings.permsFlags` — metinleri de orada):
`VIEW_CHANNELS · MANAGE_CHANNELS · MANAGE_ROLES · MANAGE_GUILD · MANAGE_EMOJIS · CREATE_INVITE ·
KICK_MEMBERS · BAN_MEMBERS · CHANGE_NICKNAME · MANAGE_NICKNAMES · MANAGE_MESSAGES · MANAGE_EVENTS ·
MENTION_EVERYONE · MUTE_MEMBERS · MOVE_MEMBERS · PRIORITY_SPEAKER`

**🔴 Sunucuda YOK (Discord'da var — KOPYALANMAYACAK):**
- **Takma ad (nickname).** `GuildMember`de böyle bir alan **yok**; `CHANGE_NICKNAME`/
  `MANAGE_NICKNAMES` izin anahtarları i18n'de duruyor ama özellik uygulanmamış. Üye detayında
  **"Takma ad" alanı KONMAZ** — olmayan özelliğe kutu koymak boş yüzeydir.
- **Davetleri duraklat**, Entegrasyonlar, Emoji yönetimi, Topluluk, Moderasyon (AutoMod), Güvenlik,
  Şablonlar, rol ikonu yükleme, "Bağlantılar" (rol bağlantı gereksinimleri).
- **Zaman aşımı (timeout)**, sağırlaştırma, üye taşıma gibi ses moderasyonu → M4 ses fazı.

---

## 1. DoD — **fiziksel cihazda** kapanır

> Sprint **iki yarıya bölünmüştür**; A kapanmadan B'ye geçilmez (M1d ve M1d-C'de işe yaradı).

### DoD-A — ortamı yönet (insanlar)
1. Ortam panelinde **Ayarlar** girişi var; **yetkisizde hiç render edilmiyor**.
2. Ortam Ayarları ekranı açılıyor; bölümler yetkiye göre görünüyor.
3. **Üye listesini** görüyorum, arayabiliyorum; her satırda rol rozetleri var.
4. Üyeye dokununca **üye ekranı** açılıyor: rolleri, rol değiştir, at, yasakla, sahipliği devret.
5. **Yetkisiz olduğum aksiyon hiç render edilmiyor**; sunucu reddederse sebebini görüyorum.
6. **Yasaklar listesi** ve yasağı kaldırma çalışıyor.
7. **Ortamdan ayrılabiliyorum**; OWNER isem ayrılma yerine "önce devret/sil" durumu görünüyor.

### DoD-B — ortamı yapılandır
8. **Genel:** ortam adını değiştirebiliyorum, `adultsOnly` anahtarını görüyorum, **Ortamı Sil**
   `ConfirmDialog` ile çalışıyor.
9. **Roller:** `@everyone` + rol listesi (üye sayısıyla); rol oluşturabiliyorum (ad + **hex renk**).
10. **Rol ekranı:** ad, renk, "ayrı göster", "bahsedilebilir", **izinler**, üyeler, rolü sil.
11. **İzin matrisi** 16 bayrağı gruplu gösteriyor; değişiklik kaydediliyor.
12. Role **üye ekleyip çıkarabiliyorum**.
13. **Davetler:** aktif davetleri görüyorum, iptal edebiliyorum.
14. **Denetim Kaydı** yükleniyor, sayfalanıyor.

### Her iki yarı için
15. Metin `tr.json`'dan, renk/ölçü `src/theme`'den; **gömülü string yok**.
16. `typecheck` + `lint` temiz; **`api/`'ye dokunulmadı**; hiçbir dosya 300 satırı aşmıyor.

---

## 2. A yarısı — kilitli sıra

### 2.1 Ortam paneline "Ayarlar" girişi
`GuildMenuSheet`e satır: **Ortam Ayarları**. `canManage` (OWNER/ADMIN) yoksa **render edilmez**.

### 2.2 Ortam Ayarları ekranı (gruplu liste)
Discord'un "Sunucu Ayarları" düzeni; **bizim sahip olduğumuz bölümler**:

| Grup | Satırlar |
|---|---|
| Ortam | **Genel** (B) · **Denetim Kaydı** (B) |
| Kullanıcı yönetimi | **Üyeler** · **Roller** (B) · **Davetler** (B) · **Yasaklar** |
| Tehlikeli | **Ortamdan Ayrıl** · **Ortamı Sil** (yalnız OWNER, B) |

🔴 **Konmaz:** Moderasyon/AutoMod · Entegrasyonlar · Emoji · Topluluk · Güvenlik · Şablonlar.
Üstte ortam ikonu + adı **gösterilir**; ikon/afiş **yükleme yok** (M1d §10.3 kuralı sürüyor —
sahip istisnası yalnız kullanıcının kendi profiliydi).

### 2.3 Üyeler ekranı
Arama + satırlar: avatar · kullanıcı adı · **rol rozetleri** (rolün kendi rengiyle).
Liste `GET /guilds/:id/members`; rol adları/renkleri `GET /guilds/:id/roles` ile eşlenir.

### 2.4 Üye ekranı
- **Roller:** üyenin rolleri + rol ata/kaldır (`POST/DELETE /roles/:id/members/:userId`).
- **Ortam rolü** (`OWNER|ADMIN|MEMBER`): yalnız OWNER değiştirebilir → yetkisizde **satır yok**.
- **At** ve **Yasakla**: `ConfirmDialog`. Hiyerarşi sunucuda; istemci yalnız kendi
  yetkisine göre satırı gizler, karar sunucunun.
- **Sahipliği Devret**: yalnız OWNER, **çift onay** (yıkıcı ve geri alınamaz).
- 🔴 **Takma ad alanı YOK** (§0).

### 2.5 Yasaklar ekranı
`GET /guilds/:id/bans` listesi + **Yasağı Kaldır** (`ConfirmDialog`).

### 2.6 Ortamdan Ayrıl
`POST /guilds/:id/leave`. **OWNER için:** sunucu reddediyor → satır yerine "önce devret ya da sil"
açıklaması gösterilir (sessiz gizleme yok, sebep yazılır).

---

## 3. B yarısı — roller, kayıtlar, ayarlar

### 3.1 Genel
Ortam adı (`PATCH /guilds/:id`), `adultsOnly` anahtarı, **Ortamı Sil** (`ConfirmDialog` + ad yazdırma
gerekmiyor, tek onay yeter — sunucu soft-delete yapıyor).
🔴 `adultsOnly` bir **T&S kapısıdır**: açıklaması gösterilir, sessiz anahtar konmaz.

### 3.2 Roller ekranı
`@everyone` satırı (isEveryone) ayrı üstte + rol listesi (`memberCount` ile) + **"+" oluştur**.
**Sürükle-sırala YOK** (`reorder` ucu bağlanmaz) — dokunmatik sürükle-sırala mobilde tutarlı olarak
erteleniyor (kanal/kategori kararıyla aynı).

### 3.3 Rol oluştur
Tek adım (Discord 3 adımlı sihirbaz **kopyalanmaz**): **ad** (1-50) + **renk** (hex).
Renk seçici: hazır swatch ızgarası + hex girişi. **Yeni bağımlılık (PM onaylı):**
`reanimated-color-picker` (MIT; peer'ları `react-native-reanimated` + `react-native-gesture-handler`
zaten kurulu). Damlalık (eyedropper) **konmaz** — ekran okuma izni ister, karşılığı yok.

### 3.4 Rol ekranı
Ad · renk · **Ayrı göster** (`hoist`) · **Bahsedilebilir** (`mentionable`) · **İzinler** · **Üyeler** ·
**Rolü Sil**. `isEveryone` rolünde: ad/renk/hoist/sil **render edilmez**, yalnız izinler.

### 3.5 İzinler ekranı
16 bayrak, **gruplu**: Genel · Üyelik · Metin · Ses. Etiket ve açıklamalar
`guildSettings.permsFlags` altından — **yeni metin yazılmaz**.
🔴 Sunucu `CANNOT_GRANT_PERMISSION` döndürüyor (sahip olmadığın izni veremezsin): istemci bunu
**taklit etmez**, sunucunun mesajını gösterir.

### 3.6 Rol üyeleri
Rolün üyeleri + **üye ekle** (ortam üyelerinden seç) + çıkar.

### 3.7 Davetler ekranı — **PM kararı (sahip "sen seç" dedi)**
Discord'un bu ekranında "Davetleri Duraklat" var; **bizde öyle bir kavram yok** ve uydurulmayacak.
Ekran = **aktif davetlerin listesi**: kod · kullanım (`uses`/`maxUses`) · süre (`expiresAt`) ·
**İptal**. Üstte "Davet Oluştur". *M1d-A'da "davet listeleme/iptal ekranı kapsam dışı" diye
ertelenmişti — yeri burası.*
⚠️ Listeleme `MANAGE_GUILD`, üretme `CREATE_INVITE` ister; listeleyemeyen ama üretebilen kullanıcıda
liste bölümü **hiç render edilmez** (M1d-A'daki açık kalem burada kapanır).

### 3.8 Denetim Kaydı
`GET /guilds/:id/audit-logs`, cursor'lu sonsuz liste. **Filtre YOK** (Discord'da var; bizde filtre
ucu yok, istemci-tarafı filtre yanıltıcı olur). Boşsa boş-durum metni.

---

## 4. 🔴 T&S ve yetki — istemcinin sınırı

- **Yetki kararı sunucudadır.** Hiyerarşi (OWNER > ADMIN > MEMBER), izin bayrakları ve
  "sahip olmadığın izni veremezsin" kuralı sunucuda uygulanır. İstemci **yalnız kendi yetkisine
  göre satır gizler**; karar hesaplamaz, gevşetmez, taklit etmez.
- **Yetkisiz aksiyon hiç render edilmez** (disabled gösterilmez) — yerleşik kural.
- **Yıkıcı işlem onay ister:** at · yasakla · rolü sil · ortamı sil · yasağı kaldır ·
  **sahipliği devret (çift onay)**.
- **Ret mesajları sunucudan geldiği gibi** gösterilir (`extractErrorMessage`).
- `adultsOnly` **yaş kapısıdır**: anahtarın ne yaptığı yazıyla açıklanır.
- Ban/kick **kişiye yönelik** işlemlerdir: kimin yaptığı denetim kaydına sunucu tarafından yazılır,
  istemci ayrıca bir şey yazmaz.

## 5. i18n + tema
Metinlerin **çoğu web'de zaten var** (`guildSettings.*`, `member.*`, `role.*`). **Önce ara, bulamazsan
ekle.** Kaynak `web/src/i18n/tr.json`. Mobil-özel metin `mobile.*`. Renk/ölçü `src/theme`. Gölge yok.

## 6. Uyulacak yerleşik desenler
- Alt paneller **`sheetInsets`** kullanır; ekranlar gezinme çubuğu payını hesaba katar.
- **Dosya boyu 300 satır** — izin matrisi ve rol ekranı buna dikkat ederek bölünür.
- Liste ekranları **odaklanmada tazelenir** (`useFocusEffect`), mount'ta değil.
- Hatalar `extractErrorMessage`; yükleniyor/hata/boş üç durumu da çizilir.
- Yeni state oturum kapsamlıysa `(app)/_layout` `reset()` zincirine girer.

## 7. Kapsam DIŞI — bilinçli
- Takma ad · AutoMod/Moderasyon · Entegrasyonlar · Emoji · Topluluk · Güvenlik · Şablonlar
- Rol **sürükle-sırala** (`reorder` ucu bağlanmaz) · rol ikonu · rol "bağlantı gereksinimleri"
- Kanal-başına izin geçersiz kılma (web'de var mı ayrı kontrol; bu sprintte yok)
- Ses moderasyonu (sustur/sağırlaştır/taşı/zaman aşımı) → M4
- Ortam ikonu/afişi **yükleme** (mobil gösterir, yüklemez)
- Denetim kaydı **filtresi** (uç yok)

## 8. Sapma kuralı
Uç imzaları, izin anahtarları, kilitli sıra (A: ayarlar girişi → üyeler → üye ekranı → yasaklar →
ayrıl · B: genel → roller → rol ekranı → izinler → rol üyeleri → davetler → denetim), "yetkisiz
aksiyon render edilmez" ve §7 bu dosyadan **sapamaz**. Yeni bağımlılık = PM onayı.
**`api/`'ye dokunma ihtiyacı → DUR.**
