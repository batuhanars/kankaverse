# Sprint 12 Contract — Grup DM (yetişkin-only, arkadaş-tabanlı)

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Kök + tier `CLAUDE.md`. Sprint 3'te ertelenen "grup DM".
>
> **🔴 T&S KURALI (kurul/sahip onayı 2026-06-13) — BAĞLAYICI:** **Minör grup DM'de yer ALAMAZ** (oluşturan veya eklenen
> taraflardan biri minörse → engellenir). Gruba **yalnız arkadaş** (karşılıklı `ACCEPTED`) eklenebilir. **R7:** grup
> oluştur/ekle kapısı insan incelemesi (grooming vektörü — minör+yabancı aynı grupta OLMAZ). Tam minör-grup desteği → sonraya.

---

## 1. Hedef
Birden çok kanka ile grup sohbeti. Mevcut DM altyapısı (kanal `guildId=null` + `ChannelMember`) üstüne **GROUP_DM**.

## 2. Prisma (additive)
- `ChannelType` enum'a `GROUP_DM` ekle (yoksa). `Channel.ownerId String?` ekle (grup oluşturanı; 1-1 DM'de null). `Channel.name` zaten var (grup adı, opsiyonel). Migration additive. (`npx prisma migrate dev --name group_dm`; DB yoksa RAPOR ET.)

## 3. Backend (`dm` modülü)
> Ortak T&S yardımcısı: hedef **karşılıklı arkadaş mı** (ACCEPTED friendship) + **minör mü** (`isMinor`). Arkadaşlık zaten bloğu dışlar (blok arkadaşlığı siler — Sprint 3).

- **`POST /dm/groups`** (auth) — `{ memberIds: string[] (1-9 benzersiz), name? (≤50) }` → **[R7] kapı:**
  1. Oluşturan **minör ise** → `403 GROUP_MINOR_FORBIDDEN` (jenerik).
  2. Her `memberId`: oluşturanın **karşılıklı arkadaşı** olmalı (değilse `400 NOT_FRIEND`/jenerik) **VE minör OLMAMALI** (biri minörse → `403 GROUP_MINOR_FORBIDDEN`).
  3. `Channel { type: GROUP_DM, guildId: null, ownerId: creator, name }` + `ChannelMember` (creator + tüm memberIds) — transaction. → GroupDmDto. `201`.
- **`POST /dm/groups/:id/members`** (grubun üyesi) — `{ userId }` → ekleyenin **arkadaşı** + **minör değil** + grup üyesi değil → ChannelMember. (Aynı T&S kapısı.)
- **`DELETE /dm/groups/:id/members/me`** (üye) — çağıran ayrılır (ChannelMember sil). Üye sayısı `< 2` kalırsa kanal soft-delete.
- **`DELETE /dm/groups/:id`** (yalnız `ownerId`) — grubu soft-delete (kanal `deletedAt`).
- **`PATCH /dm/groups/:id`** (owner) — `{ name }` → grup adı.
- **Mesaj gönderme (mevcut `messages.service.create`):** grup kanalı `ChannelMember` ile erişim zaten çalışır. **`requireNoDmBlock` yalnız 1-1 DM'de (tam 2 üye) çalışsın** — GROUP_DM'de atla (1-1 semantiği; grupta arkadaş-tabanlı zaten blok dışlar). Bunu kanal tipi/üye sayısıyla kapıla.
- **`GET /dm/channels` genişler:** 1-1 + grup birlikte döner; **tip ayrımı** — 1-1: `otherUser`; grup: `type:'GROUP_DM'`, `name`, `members: [{id,username,avatarUrl}]`, `ownerId`. `unread`/`lastMessage` ikisinde de. (DmChannelDto'ya opsiyonel grup alanları veya discriminated union.)

## 4. Frontend (`web/`)
- **Grup oluştur:** DM listesi/home'da "Grup Oluştur" → modal: **kanka listesi** (friends store) → **çoklu seç** (checkbox) + opsiyonel grup adı → `POST /dm/groups`. (Minör kanka listede gösterilebilir ama seçilince/oluşturulunca backend reddeder → jenerik toast; **statü sızdırma** — "eklenemedi" jenerik.)
- **DM listesi:** grup kanalı **çoklu-avatar** + grup adı (yoksa üye adları) ile görünür; tıkla → grup sohbeti.
- **Grup sohbeti (`DmConversation` uyarla veya yeni):** başlıkta grup adı + üye sayısı; mesajlar mevcut baloncuk; **üye listesi/yönetim** (ekle [arkadaş seç] · ayrıl · owner ise sil/yeniden adlandır). Minimal.
- i18n (`group.*`, hata kodları); `--kv-*` token.

## 5. R7 / DoD
- [ ] Grup oluştur: arkadaş-only + **minör hiçbir grupta yok** (oluşturan/eklenen); jenerik retler, statü sızmaz.
- [ ] Ekle/ayrıl/sil(owner)/yeniden adlandır; üye<2 → kapanır.
- [ ] Grup mesajı çalışır; `requireNoDmBlock` grupta atlanır (1-1'de korunur).
- [ ] `GET /dm/channels` 1-1 + grup; UI çoklu-avatar.
- [ ] `nest build`+`vue-tsc` temiz; testler (grup kapısı + minör-ret + arkadaş-ret + leave/delete).
- [ ] **R7:** grup oluştur/ekle T&S kapısı PM inceledi.

## 6. Not
- Tam minör-grup desteği (örn. tüm-üyeler-arkadaşsa minör girebilir) → sonraki T&S turu (kurul/Fable). V1 = yetişkin-only grup.
