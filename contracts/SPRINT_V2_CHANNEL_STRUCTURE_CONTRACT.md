# Sprint V2 — Ortam Kanal Yapısı Yenileme Sözleşmesi

> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön.
> Response envelope `{ success, statusCode, data }`. İlgili: `guilds.service.ts`, `channels.service.ts`,
> `membership.service.ts`, `ChannelPanel.vue`, kanal-oluştur modal. **Karar:** ses/forum türleri "yakında"
> (devre dışı); yalnız Metin çalışır; yalnız "Metin Kanalları" varsayılan kategori (Ses Kanalları LiveKit'le).

---

## A. Varsayılan kategori (guild create) — backend

`guilds.service.create` transaction'ında (mevcut: guild + OWNER member + `genel-sohbet` GUILD_TEXT):
1. Guild oluşturulduktan sonra `tx.channelCategory.create({ guildId, name: 'Metin Kanalları', position: 0 })`.
2. Varsayılan `genel-sohbet` kanalı bu kategoriye bağlı oluşturulur (`categoryId` = yeni kategori).
- Yalnız **tek** varsayılan kategori ("Metin Kanalları"). "Ses Kanalları" YOK (LiveKit gelince eklenecek).
- Kategori silinebilir (mevcut DELETE davranışı). Mevcut ortamlar (geçmiş): kategorisiz kalır (kanalları üstte
  başlıksız render olur) — geriye-dönük backfill YOK; kullanıcı elle kategori açabilir.

---

## B. Özel kanal (isPrivate) — backend, **R7 (erişim çekirdeği)**

1. **Şema:** `Channel.isPrivate Boolean @default(false)`. Migration `add_channel_isprivate` (uygulanmalı — `migrate status` temiz).
2. **DTO:** `CreateChannelDto` + `UpdateChannelDto`'ya `isPrivate?: boolean` (`@IsOptional @IsBoolean`).
3. **Erişim (`requireChannelAccess`, guild dalı) — yaş kapısından SONRA:**
   - Kanal `isPrivate` ise: erişim ⇔ (kullanıcı guild'de **OWNER/ADMIN**) **VEYA** bu kanalda **`ChannelMember`** kaydı var. Aksi (rol MEMBER + üye değil) → `403 NOT_CHANNEL_MEMBER`.
   - `isPrivate=false` (genel kanal): mevcut davranış (guild üyesi yeter).
   - Yaş kapısı (`ageGated`/`adultsOnly`) her durumda ayrıca uygulanır (özel + yaş-kapılı birlikte geçerli).
4. **Kanal listesi (`findByGuild`):** kullanıcının **erişemediği özel kanallar listede GÖSTERİLMEZ**. OWNER/ADMIN tüm
   kanalları görür; MEMBER → genel kanallar + üyesi olduğu özel kanallar. (Rol + kullanıcının `ChannelMember`
   channelId'leri tek sorguyla alınır; özel + erişimsiz olanlar filtrelenir.) `toChannelDto`'ya `isPrivate` ekle.
5. **Oluşturma:** OWNER/ADMIN `isPrivate:true` kanal açabilir. OWNER/ADMIN role'le zaten erişir; ek tohum gerekmez.
6. **Kapsam dışı (ERTELENDİ, sessiz değil):** özel kanala **belirli üye ekleme/çıkarma** (ChannelMember yönetimi UI+endpoint)
   → sonraki adım. Bu sprintte özel kanal = **yönetici-erişimli** (OWNER/ADMIN görür/girer; member-grant henüz yok).
   Altyapı (`ChannelMember` tabanlı erişim) hazır; üye-ekleme bir sonraki dalga.

**R7:** B3 + B4 (erişim karar mantığı) PM tarafından satır satır incelenecek; minör/durum sızıntısı yok, jenerik
`NOT_CHANNEL_MEMBER`. Net ve okunur yaz.

---

## C. Kanal türü — yalnız FRONTEND (backend değişmez)

- Backend yalnız `GUILD_TEXT` oluşturur (DTO `type` GÖNDERİLMEZ; varsayılan GUILD_TEXT). **Şema/enum DEĞİŞMEZ**
  (VOICE/FORUM enum'u LiveKit/forum gelince eklenecek — şimdi forward-compat zorlamaya gerek yok).
- **Modal'da kanal türü seçici** (yalnız görsel): **Metin** (`#` ikonu, seçili/etkin) · **Ses** (megafon ikonu,
  **devre dışı** + "yakında" rozeti) · **Forum** (sohbet baloncuğu ikonu, **devre dışı** + "yakında"). Ses/Forum
  seçilemez → yalnız metin kanalı oluşturulur.
- **Kanal listesi ikonu:** `toChannelDto.type`'a göre ikon — `GUILD_TEXT` → `#`. (Diğer türler ileride; şimdi hepsi `#`.)
  Özel kanal ek **kilit (🔒) rozeti** gösterir (ad yanında, ince).

---

## D. Kanal-oluştur modal yeniden — frontend

- **Kategori dropdown KALDIRILIR.** Kanal, basılan kategorinin **"+"**'ından oluşturulur → `categoryId` o kategoridir.
- Modal içeriği: kanal adı + **kanal türü seçici** (C) + **özel kanal** toggle (`isPrivate`) + **18+ yaş kapılı**
  toggle (`ageGated` — aynen durur).
- **"+" yerleşimi:** her kategori başlığında "+" (mevcut). "METİN KANALLARI" sabit başlığı KALDIRILDIĞI için (E),
  kategorisiz kanallar bölümü için de bir **üst-seviye "+"** bulunsun (kategorisiz kanal oluşturur) — böylece
  kategorisi olmayan ortamda da kanal eklenebilir.

---

## E. "METİN KANALLARI" sabit başlığı kaldırma — frontend

- `ChannelPanel`'de hardcoded "METİN KANALLARI" başlığı KALDIRILIR. Panel yalnız **DB kategorilerini** render eder
  (mevcut katlanabilir kategori başlıkları). Kategorisiz kanallar üstte başlıksız (mevcut davranış).
- Yeni ortamlar (A) "Metin Kanalları" kategorisini DB'den alır → başlık artık veriden gelir.

---

## F. Sol sidebar köşe radius — frontend

- Guild sol sidebar (`ChannelPanel` kapsayıcısı) **4 köşesi** ana ekrandaki (`HomeSidebar`) gibi yumuşak radius'lu
  olsun (`--kv-radius-lg` / home'da neyse aynı değer). Home ile görsel tutarlılık.

---

## G. Kabul kriterleri

- [ ] Guild create → "Metin Kanalları" kategorisi + varsayılan kanal o kategoride (tx). Mevcut testler uyarlanır.
- [ ] `Channel.isPrivate` + migration (uygulandı, `migrate status` temiz); DTO; `toChannelDto.isPrivate`.
- [ ] R7: özel kanal erişim (OWNER/ADMIN ∨ ChannelMember) + `findByGuild` filtre; jenerik `NOT_CHANNEL_MEMBER`.
- [ ] Backend testleri: guild-create-kategori · özel erişim (admin OK / üye-değil 403 / ChannelMember OK) · liste filtre · yaş+özel birlikte.
- [ ] Frontend: hardcoded başlık kaldırıldı (DB kategori) · modal (kategori dropdown yok; tür seçici Metin etkin/Ses-Forum yakında; özel toggle; 18+ durur) · tür/kilit ikonu · üst-seviye + · sidebar radius.
- [ ] `api`+`web` build TEMİZ; backend testleri yeşil.

## H. Kapsam dışı

- Ses/forum işlevi (LiveKit/forum) · "Ses Kanalları" varsayılan kategori · özel kanal **üye-ekleme** yönetimi ·
  kanal/kategori sürükle-bırak reorder. (Hepsi sonraki dalgalar; sessiz değil.)
