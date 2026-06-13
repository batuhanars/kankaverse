# Sprint V2 — Ortam Ayarları + Üye Yönetimi Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön. Envelope `{ success, statusCode, data }`.
> İlgili: `guilds.service.ts`/`guilds.controller.ts`, `membership.service.ts`, frontend ortam ayarları + MemberPanel.
> **R7:** rol değiştirme + at (kick) **yetki karar fonksiyonları** — satır satır incelenecek. Hiyerarşi/OWNER koruması net olmalı.

Mevcut (DEĞİŞMEZ, yeniden yapma): `PATCH /guilds/:id` (ad/adultsOnly/rules, OWNER) · ikon presign/set (OWNER) ·
`GET /guilds/:id/members` (üye+rol listesi). Bu sözleşme bunların ÜZERİNE: **ortam silme + rol değiştir + at**.

---

## A. Ortam silme — `DELETE /guilds/:id`

- Yetki: **yalnız OWNER** (`requireOwner` mevcut helper). `JwtAuthGuard`.
- Soft-delete: `guild.deletedAt = now`. (findMyGuilds zaten `deletedAt` filtreler; kanallar/mesajlar soft kalır.)
- Dönüş `null`. Silinen ortam üyelerin listesinden düşer.

---

## B. Rol değiştir — `PATCH /guilds/:id/members/:userId/role`

- Body: `{ role: 'ADMIN' | 'MEMBER' }` (`UpdateMemberRoleDto`, `@IsEnum`). **OWNER'a set EDİLEMEZ** (sahiplik devri ayrı/ertelendi → `role` yalnız ADMIN|MEMBER).
- **Yetki (R7):** **yalnız OWNER** rol değiştirir. ADMIN değiştiremez → `FORBIDDEN`.
- **Kısıtlar:** hedef guild üyesi olmalı (değil → `404`/`NOT_GUILD_MEMBER`); hedef **OWNER ise reddet** (`400 CANNOT_MODIFY_OWNER` — sahibin rolü değişmez); kendine işlem reddet (OWNER kendini değiştiremez, aynı kod).
- İdempotent (zaten o rolse no-op-ok). Dönüş: güncellenen üye DTO (rol dahil). AuditLog yaz (mevcut desen varsa).

---

## C. Üye at (kick) — `DELETE /guilds/:id/members/:userId`

- **Yetki (R7) hiyerarşi:**
  - **OWNER:** ADMIN veya MEMBER atabilir.
  - **ADMIN:** yalnız **MEMBER** atabilir (başka ADMIN'i veya OWNER'ı ATAMAZ → `FORBIDDEN`).
  - **OWNER asla atılamaz** (hedef OWNER → `400 CANNOT_KICK_OWNER`).
  - **Kendini atma reddi** (`400 CANNOT_KICK_SELF` — ayrılma ayrı; bu sprint dışı).
  - Yetkisiz (MEMBER) → `FORBIDDEN`. **Yetki kontrolü domain'den ÖNCE** (özel-kanal dersindeki gibi; hedef rolünü öğrenme sızıntısı olmasın — uygun sırala).
- **Etki:** `GuildMember` sil (scope=guildId). Ayrıca atılanın o guild kanallarındaki `ChannelMember` kayıtlarını temizle (özel kanal erişimi kalmasın) — tx içinde. (ChannelRead temizliği opsiyonel.)
- Dönüş `null`. WS: opsiyonel `guild.member_removed` (frontend üye listesini tazeleyebilir; zorunlu değil — frontend yeniden fetch edebilir).
- **Not:** Bu **ortam-seviyesi at**; platform moderasyon BAN/KICK (`moderation` modülü, isModerator) AYRI kalır — ona dokunma.

---

## D. Frontend

### D1. Ortam ayarları (OWNER)
Mevcut ayar girişine (çark) bir **ortam ayarları** paneli/modal: **ad düzenle** · **kurallar düzenle** (rules) ·
**ikon değiştir/kaldır** · **adultsOnly toggle** (mevcut endpoint'ler) · **Ortamı Sil** (yeni `DELETE`, ConfirmDialog +
"geri alınamaz" uyarısı + ad doğrulama isteğe bağlı). Silince ana ekrana dön.

### D2. Üye yönetimi (MemberPanel)
`MemberPanel`'de her üye satırında (OWNER/ADMIN'e) bir **işlem menüsü** (⋯/sağ-tık):
- **Rol** (yalnız OWNER görür): "Yönetici yap" / "Üye yap" → `PATCH role`. OWNER satırında ve kendinde gizli.
- **At** (OWNER → ADMIN/MEMBER; ADMIN → yalnız MEMBER): ConfirmDialog → `DELETE member`. OWNER hedefte/kendinde gizli; ADMIN, ADMIN/OWNER hedefte gizli.
- Yetki görünürlüğü `guilds` store rolünden; backend zaten enforce eder (UI yalnız gizler).
- İşlem sonrası üye listesi + (gerekirse) kanal listesi tazelenir.
- Hata kodları Türkçe (i18n): `CANNOT_KICK_OWNER`/`CANNOT_KICK_SELF`/`CANNOT_MODIFY_OWNER`/`FORBIDDEN`.

### D3. i18n
Tüm yeni string `tr.json` (koda gömme).

---

## E. Kabul kriterleri

- [ ] `DELETE /guilds/:id` (OWNER soft-delete) · `PATCH /guilds/:id/members/:userId/role` (OWNER, OWNER-koruması) · `DELETE /guilds/:id/members/:userId` (kick hiyerarşi + ChannelMember temizliği tx).
- [ ] **R7:** kick/rol yetki hiyerarşisi (OWNER/ADMIN/MEMBER) + OWNER koruması + kendine-işlem reddi + yetki-önce sıralama (sızıntı yok).
- [ ] Backend testleri: silme yetki · rol (OWNER OK / ADMIN 403 / OWNER-hedef red / promote+demote) · kick (OWNER→ADMIN OK · ADMIN→MEMBER OK · ADMIN→ADMIN FORBIDDEN · →OWNER red · self red · MEMBER 403 · ChannelMember temizliği).
- [ ] Frontend: ortam ayarları (ad/kural/ikon/adultsOnly/sil) + MemberPanel üye işlemleri (rol/at, yetki gizleme) + onaylar + i18n.
- [ ] `api`+`web` build TEMİZ; testler yeşil; `migrate status` temiz (şema değişmiyorsa migration yok).

## F. Kapsam dışı (ERTELENDİ, sessiz değil)
- Sahiplik devri (OWNER transfer) · ortam-seviyesi **ban** (yeniden katılmayı engelleme — yeni `GuildBan` modeli gerekir) ·
  ortamdan **ayrılma** (leave, üye kendi) · rol matrisi/granular izin. Sonraki dalgalar.
