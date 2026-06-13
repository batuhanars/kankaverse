# Sprint 7A Contract — Davet Sistemi + adultsOnly Kapısı + Ortam Ayarları

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. Türetildiği yer: PLAN Sprint 7 (7A/7B'ye bölündü, PM+sahip 2026-06-13).
>
> **R7 ZORUNLU:** davet-join adultsOnly/minör kapısı + adultsOnly erişim-zamanı enforcement = T&S karar yüzeyi,
> satır-satır insan incelemesi. "AI yazdı, geçti" yoktur.
>
> Response envelope (her endpoint ilk satırı): `{ success, statusCode, data }` — controller sarmalamaz, TransformInterceptor üretir.

---

## 1. Hedef

Ham guild-ID join köprüsünü (**T1 borcu — kapısız, minör adultsOnly'ye girebilir**) **davet-tabanlı katılımla** değiştir;
adultsOnly'yi **hem join hem erişim** zamanında enforce et (brief §4 kritik kural: "doğrulanmış statü reşit olmayana
erişim ayrıcalığı TANIMAZ"); ortam sahibine ayarlar + davet yönetimi ekranı ver. Bu sprint **kontrollü/davetli büyüme**
hikâyesini açar (brief §10) ve **2-hesap uçtan-uca T&S testini** (PLAN açık kalem) mümkün kılar.

**Kapsam DIŞI (7B veya sonrası):** Türkçe automod (kelime-listesi, block-on-send kayıtsız — 7B), yeni üye karantinası (7B),
sunucu ikonu yükleme (upload altyapısı yok), rol/izin matrisi (V3), keşfet (V3).

---

## 2. Prisma (additive — mevcut alanlar korunur)

`Guild.adultsOnly` (default false) ve `Channel.ageGated` (default false) **zaten şemada var** — yeni alan değil, enforce açılıyor.

```prisma
model Invite {
  id        String    @id @default(cuid())
  code      String    @unique          // kısa, paylaşılabilir, URL-safe (8-char)
  guildId   String
  guild     Guild     @relation(fields: [guildId], references: [id])
  creatorId String
  creator   User      @relation("InviteCreator", fields: [creatorId], references: [id])
  maxUses   Int?                        // null = sınırsız
  uses      Int       @default(0)
  expiresAt DateTime?                   // null = süresiz
  deletedAt DateTime?                   // iptal (revoke)
  createdAt DateTime  @default(now())
  @@index([guildId])
}
```
- `Guild` ilişkisi: `invites Invite[]`. `User` ilişkisi: `createdInvites Invite[] @relation("InviteCreator")`.
- Migration **additive** (mevcut veri etkilenmez).
- `generateInviteCode`: 8-char URL-safe (base32-benzeri, `friend-code.util` desenini taklit et), çakışmada yeniden üret.

---

## 3. Endpoints (envelope; tümü `JwtAuthGuard`)

> **Yetki:** ortam ayarları (`name`/`adultsOnly`) = **yalnız OWNER**. Davet oluştur/listele/iptal = **OWNER/ADMIN**.
> Yetki kontrolü `MembershipService.requireGuildMembership` (role döner) üstünden; rol yetersizse `403 FORBIDDEN`.

### Davet
- **`POST /guilds/:id/invites`** (OWNER/ADMIN) — `{ maxUses?: number (1-1000), expiresInHours?: number (1-720) }`
  → kod üret, `Invite` oluştur → `InviteDto` (`{ code, guildId, maxUses, uses, expiresAt, createdAt }`). `201`.
- **`GET /guilds/:id/invites`** (OWNER/ADMIN) — aktif davetler (deletedAt null + süresi geçmemiş + uses<maxUses) → `InviteDto[]`.
- **`DELETE /invites/:code`** (o ortamın OWNER/ADMIN'i) — `deletedAt=now` (iptal). → `200 null`. Yetkisiz → `403`/`404` jenerik.
- **`GET /invites/:code`** (auth) — katılmadan önizleme: `{ guildName, adultsOnly, valid: boolean }`. Geçersiz/süresi geçmiş/iptal → `valid:false` (veya `404 INVITE_INVALID`). Üye sayısı vb. sızdırma — minimal.

### Join (ham-ID join'in YERİNE)
- **`POST /invites/:code/join`** (auth) — sırayla **[R7]:**
  1. Davet geçerli mi: var · `deletedAt=null` · `expiresAt` geçmemiş · `maxUses` null veya `uses<maxUses`. Değilse `404 INVITE_INVALID`.
  2. **adultsOnly kapısı:** `guild.adultsOnly && user.isMinor` → `403 AGE_RESTRICTED` (brief §4). **Minör statüsü yanıtta jenerik AGE_RESTRICTED ile döner — başka sızıntı yok.**
  3. Zaten üye mi → `409 ALREADY_MEMBER`.
  4. `GuildMember` (role MEMBER) oluştur + `invite.uses` atomik artır (transaction). → `GuildDto`. `201`.
- **`POST /guilds/:id/join` (ham-ID) KALDIRILIR** — controller + service + frontend çağrısı silinir. **T1 borcu kapanır** (kapısız ungated yol ortadan kalkar). Tek katılım yolu = davet kodu.

### Ortam ayarları
- **`PATCH /guilds/:id`** (yalnız OWNER) — `{ name?: string (2-50), adultsOnly?: boolean }` → güncelle → `GuildDto`. Sahip değilse `403`.

> **adultsOnly açıldığında geri-uyumluluk:** ayar açıldığında mevcut minör üyeler otomatik atılMAZ (V1 sadeleştirme);
> bunun yerine **erişim-zamanı enforcement** (§4) minörü ortam kanallarından zaten kapatır → retroaktif delik kapanır.

---

## 4. adultsOnly Erişim-Zamanı Enforcement (savunma derinliği — R7)

Join kapısı tek başına yetmez (ayar sonradan açılabilir / teorik baypas). **`MembershipService`'e guild-seviyesi yaş kapısı:**
- `requireChannelAccess` **guild kanalında**: guild üyeliği doğrulandıktan sonra `guild.adultsOnly && user.isMinor → 403 AGE_RESTRICTED`.
  (Mevcut `Channel.ageGated` kanal-seviyesi kapısı KORUNUR; bu guild-seviyesi ek kapı.) DM kanalı etkilenmez (guildId null).
- Tek `isMinor` sorgusu mevcut ageGated dalıyla paylaşılabilir (gereksiz çift sorgu yapma — DRY).

**İlke:** adultsOnly ortam, minöre ne join ne içerik erişimi tanır — iki katman (join + erişim) fail-closed.

---

## 5. Frontend (`web/`)

- **Katıl akışı (`ServerModal.vue` join adımı):** ham guild-ID input → **davet kodu input**'a döner; `POST /invites/:code/join`.
  Opsiyonel: girince `GET /invites/:code` önizleme (ortam adı + adultsOnly rozeti). `AGE_RESTRICTED` → uygun Türkçe mesaj
  ("Bu ortam yalnızca yetişkinler içindir"); `INVITE_INVALID` → "Davet geçersiz veya süresi dolmuş". `guildsStore.joinGuild`
  (ham-ID) → `joinByInvite(code)` olur.
- **Ortam ayarları ekranı (OWNER):** ortam başlığı/çark → ayarlar (modal veya görünüm). İçerik:
  - Ortam adı düzenle (`PATCH`).
  - **adultsOnly toggle** (sahip; T&S — onay metni: "yalnızca yetişkinler" anlamı).
  - **Davet yönetimi:** davet oluştur (maxUses/süre opsiyonel) → kod/link göster + kopyala (`useClipboard`); aktif davet listesi; iptal et.
  - Sahip değilse ayarlar girişini gösterme (yalnız OWNER).
- **i18n:** tüm metin `tr.json` (`invite.*`, `guildSettings.*`, yeni hata kodları); renk/şekil `--kv-*` token.
- **Sapma:** sunucu ikonu yükleme / rol yönetimi / kanal yönetimi UI'ı bu sprint DEĞİL — gösterme (UI'ı placeholder'la şişirme).

---

## 6. R7 Kapsamı (insan incelemesi zorunlu)
- `POST /invites/:code/join` kapı sırası (geçerlilik → **adultsOnly && isMinor → 403** → üyelik), fail-closed.
- §4 erişim-zamanı `guild.adultsOnly && isMinor` enforcement (savunma derinliği).
- Minör statüsünün yanıtta sızmaması (yalnız jenerik `AGE_RESTRICTED`).
- Davet yetki kontrolü (OWNER/ADMIN) + iptal/expiry/maxUses doğru uygulanması.

---

## 7. DoD
- [ ] Invite modeli + migration (additive); `generateInviteCode` çakışma-dayanıklı.
- [ ] Davet oluştur/listele/iptal (OWNER/ADMIN yetkili); önizleme; expiry + maxUses uygulanıyor.
- [ ] **Davet ile katılım tek yol** — ham-ID `POST /guilds/:id/join` kaldırıldı (**T1 kapandı**).
- [ ] **Minör adultsOnly ortama JOIN olamaz** (`403 AGE_RESTRICTED`) **VE** açıldıysa kanallara erişemez (erişim-zamanı kapı).
- [ ] Ortam ayarları: ad düzenle + adultsOnly toggle (yalnız OWNER) + davet yönetimi UI (oluştur/kopyala/iptal).
- [ ] **2-hesap uçtan-uca:** A davet üretir → B kodla katılır → birbirini görür/mesajlaşır (PLAN açık kalem testi açılır).
- [ ] Yeni hata kodları (`AGE_RESTRICTED` mevcut, `INVITE_INVALID`, `ALREADY_MEMBER`) + i18n; Swagger güncel.
- [ ] **R7:** davet-join kapısı + adultsOnly enforcement satır-satır incelendi (sahip imzası).
- [ ] Regresyon: mevcut guild oluştur/kanal/mesaj/DM akışları bozulmadı; `nest build` + `vue-tsc` temiz; testler geçer.

---

## 8. Notlar
- adultsOnly V1'de **`isMinor` (doğum tarihi beyanı)** üstünden enforce edilir; e-Devlet doğrulaması Sprint 8 — doğrulama
  erişim ayrıcalığı TANIMAZ (kritik kural), yani Sprint 8 bu kapıyı gevşetmez, yalnız rozet ekler.
- 7B (sonraki): Türkçe automod (block-on-send, **kayıtsız** — hukuk-nötr, sahip kararı 2026-06-13) + yeni üye karantinası
  (`canDm`/`canSendFriendRequest` karantina hook'larını gerçeğe bağlar).
