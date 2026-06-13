# Sprint V2 — Kanal Kategorileri Sözleşmesi

> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. **Tek doğruluk kaynağı bu dosya.** Endpoint/DTO/şema şekli
> buradan sapamaz; sapma → dev DURUR, PM'e döner. Response envelope `{ success, statusCode, data }` (controller
> sarmalamaz). İlgili: `channels.service.ts`, `channels.controller.ts`, frontend `ChannelPanel.vue` + channels store.

Amaç: ortam (guild) kanallarını **katlanabilir kategoriler** altında gruplamak. Kategorisiz kanallar en üstte
(Discord deseni). Yalnız OWNER/ADMIN kategori yönetir. **DM/grup DM kategorisizdir** (yalnız guild).

---

## 1. Veri modeli (Prisma)

Yeni model:
```prisma
model ChannelCategory {
  id        String    @id @default(cuid())
  guildId   String
  guild     Guild     @relation(fields: [guildId], references: [id])
  name      String
  position  Int       @default(0)
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  channels  Channel[]

  @@index([guildId])
}
```
`Channel` modeline:
```prisma
categoryId String?
category   ChannelCategory? @relation(fields: [categoryId], references: [id])
```
`Guild` modeline `categories ChannelCategory[]`. Migration: `add_channel_categories`.
T&S alanı değil (minör yüzeyi yok) — standart yetki (OWNER/ADMIN).

---

## 2. DTO deltaları

- **`CreateCategoryDto`**: `name: string` (`@IsString` `@MinLength(1)` `@MaxLength(50)` — trim'li).
- **`UpdateCategoryDto`**: `name?: string` (aynı kural), `position?: number` (`@IsInt` `@Min(0)`).
- **`CreateChannelDto`** + **`UpdateChannelDto`**: ekle `categoryId?: string | null` (`@IsOptional`;
  string → geçerli kategori, `null` → kategorisiz). Mevcut alanlar (name/ageGated/slowModeSeconds) değişmez.

---

## 3. `toChannelDto` deltası

Çıktıya **`categoryId: channel.categoryId`** ekle (null olabilir). Diğer alanlar değişmez. (Frontend kanalı
kategorisine bu alanla bağlar.)

**`toCategoryDto`** (yeni): `{ id, guildId, name, position }`.

---

## 4. Endpoint'ler

Tümü `JwtAuthGuard`. Mutasyonlar **OWNER/ADMIN** (`requireGuildMembership` + `requireAdminRole(role)` deseni).

| Metot | Yol | Yetki | Davranış |
|---|---|---|---|
| `POST` | `/guilds/:id/categories` | OWNER/ADMIN | `{ name }` → kategori oluştur; `position = (max+1)` (guild içi, deletedAt:null). `toCategoryDto` döner. |
| `GET` | `/guilds/:id/categories` | üye | Guild'in silinmemiş kategorileri, `position asc`. `toCategoryDto[]` döner. |
| `PATCH` | `/categories/:id` | OWNER/ADMIN | `{ name?, position? }` → güncelle. Kategori guild'ini `requireGuildMembership` ile doğrula. `toCategoryDto`. |
| `DELETE` | `/categories/:id` | OWNER/ADMIN | Soft-delete (`deletedAt`). **Kanalları SİLİNMEZ** → `categoryId=null` (kategorisize düşer). `null` döner. |

**Kanal atama (mevcut endpoint genişler):**
- `PATCH /channels/:id` (`UpdateChannelDto.categoryId`): `categoryId` verilirse — `null` → kategorisiz;
  string → kategori **aynı guild'e ait + silinmemiş** olmalı, değilse `400 INVALID_CATEGORY`. Yetki yine OWNER/ADMIN.
- `POST /guilds/:id/channels` (`CreateChannelDto.categoryId`): opsiyonel; verilirse aynı doğrulama.

**Mevcut `GET /guilds/:id/channels` DEĞİŞMEZ** (yine kanal dizisi döner; artık her elemanda `categoryId` var).
Kırıcı şekil değişikliği YOK — kategoriler ayrı endpoint'ten alınır.

---

## 5. Doğrulama / kenar durumlar

- Kategori adı 1-50, trim. Boş → 400.
- `categoryId` başka guild'in kategorisini gösteriyorsa → `400 INVALID_CATEGORY` (cross-guild sızıntı yok).
- Kategori silinince kanalları kategorisiz olur (tek `updateMany categoryId=null` + soft-delete; tercihen tx).
- `position` çakışması sorun değil (frontend `position asc` + `createdAt` ikincil sıralar); benzersizlik zorunlu değil.

---

## 6. Frontend (web/) — davranış sözleşmesi

- **channels store:** guild seçilince kanallarla birlikte **kategorileri** de çek (`GET /guilds/:id/categories`).
  Kanal nesnesi artık `categoryId` taşır.
- **ChannelPanel render:** sırayla → (1) **kategorisiz** kanallar (`categoryId=null`) en üstte, `position asc`;
  (2) kategoriler `position asc`, her biri **katlanabilir başlık** (▸/▾ + ad, büyük harf/`section-label` stili)
  altında kendi kanalları (`position asc`). Katlama durumu **localStorage**'da saklanır (`guildId:categoryId` anahtar).
- **Yönetim (yalnız OWNER/ADMIN görür):** "Kategori oluştur" eylemi (kanal paneli başlığı/`+` menüsü);
  kategori başlığında küçük menü → yeniden adlandır / sil. Kanal oluşturma/düzenlemede kategori seçimi (dropdown,
  "Kategorisiz" dahil). Tümü `--kv-*` token, **gölge yok**, mevcut modal/menü desenleriyle.
- **i18n:** tüm yeni string `i18n/tr.json` (koda gömme).
- **Sade tut (over-engineering yok):** boş kategori de görünür (gizleme). Yetkisiz üye yalnız grupları görür,
  yönetim eylemleri gizli.

---

## 7. Kapsam dışı (bu dalga — ERTELENDİ, sessiz değil)

- **Sürükle-bırak yeniden sıralama** (kanal/kategori drag-reorder) → sonraki dalga. Bu sprint: `position`
  alanı + `PATCH .../categories/:id { position }` altyapısı var ama **UI'da drag YOK**; sıra oluşturma sırasıdır.
- Kategori-bazlı izin/görünürlük (rol matrisi) → V3. Kategori senkron-okundu, kategori bildirimi yok.

---

## 8. Kabul kriterleri

- [ ] `ChannelCategory` modeli + `Channel.categoryId` + migration; `toChannelDto.categoryId`; `toCategoryDto`.
- [ ] 4 kategori endpoint'i (POST/GET/PATCH/DELETE) + kanal `categoryId` atama (create/update) + `INVALID_CATEGORY`.
- [ ] Kategori silince kanallar kategorisiz (silinmez); cross-guild kategori reddedilir.
- [ ] Frontend: kategori fetch + katlanabilir gruplu ChannelPanel + (OWNER/ADMIN) oluştur/adlandır/sil + kanal atama; katlama localStorage.
- [ ] `api` + `web` build TEMİZ; backend birim testleri (oluştur/sil-kanallar-düşer/cross-guild-ret/yetki) yeşil.
