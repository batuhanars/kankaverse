# SPRINT C8 — Avatar + Profil Afişi + Ortam Afişi (statik görsel yükleme, rapor+takedown)

> Durum: **TASARIM KİLİTLİ (2026-07-05).** PM compose (Opus). Sahip kararı: statik görsel yükleme; GIF ertelendi (premium faz).
> Precedent: ortam ikonu zinciri (`guilds.service.ts` `presignIcon`/`setIcon` + `GuildSettingsView.vue`). C5 profillerinde avatar bilinçli ertelenmişti (D14 public-borç) → bu sprint açar.
> **R7 kapsamı:** takedown (`MEDIA_REMOVE`) bir T&S karar/enforcement fonksiyonu → satır satır insan incelemesi. Dev diff'i sahibe onaya sunar.

---

## §0 — Kapsam ve KRİTİK Karar (T&S)

**IN:** Kullanıcı avatarı · profil afişi (banner) · ortam (guild) afişi için **statik görsel yükleme** (png/jpeg/webp; **GIF YOK**). Yükleme = ortam-ikonu deseninin (D14 public-URL) birebir devamı. Bu üç yüzeye özel **rapor** (mevcut USER/GUILD hedefleriyle) + **moderatör takedown** (`MEDIA_REMOVE`).

**🔴 KİLİTLİ KARAR — bu, önceki bir PM kuralını bilinçli tersine çevirir:**
- PLAN.md A1: *"Bu (CSAM tarayıcı) açılana dek yeni upload yüzeyi açılmaz."* Mesaj ekleri/dosya zaten canlı (C7, `UPLOADS_ENABLED=true, SCAN=false`) ama **yetişkin-bağlamına kapılı** (adultsOnly/ageGated). Avatar/afiş, **minör dahil evrensel görünür İLK kullanıcı-upload yüzeyi**. Gerçek yeni sınır bu.
- Sahip kararı (2026-07-05): tara-değil, **rapor+takedown** duruşu. Ortam ikonu (D14) zaten taramasız public → bu yüzeyler aynı desende, yeni bir baypas *sınıfı* açmıyor, mevcut sınıfı minör-görünür bağlama genişletiyor.
- **Telafi kontrolü (bu sprintin bedeli, es geçilemez):** (1) moderatör takedown yolu (`MEDIA_REMOVE`, R7); (2) kullanıcı self-remove (PATCH null); (3) **hash-blocklist fast-follow** (bu sprintte DEĞİL, yeni borç D24).
- **A1 geldiğinde:** avatar/afiş/ikon üçü de tarayıcıya bağlanır (A1 yüzey listesine eklenir + D14 birleşir).

**Gating:** Tüm presign **`UPLOADS_ENABLED`** bayrağına tabi (kapalıysa `UPLOADS_DISABLED` 403). `set` endpoint'lerine de savunma-derinliği kapısı (D14 ders (2): presign kapalıyken set de reddeder). Presign+set → **`VerifiedEmailGuard`** (doğrulanmamış hesap görsel yükleyemez — throwaway-hesap suistimalini kısar; attachments deseniyle aynı).

**OUT (bilinçli ertelenen):** GIF / animasyonlu avatar-afiş (premium faz — ayrı sistem, chat GIF seçicisiyle birlikte) · kırpma/crop UI (D25) · hash-blocklist (D24) · gerçek CSAM tarama (A1) · S3 objesinin fiziksel silinmesi + kanıt-saklama (A2/hukuk — takedown yalnız **referansı düşürür**, obje D13 orphan temizliğine kalır) · scanStatus makinesi (bu yüzeyler public-URL, presigned-GET değil).

---

## §1 — Veri Modeli (Prisma)

Şema değişikliği (additive):
- `User.bannerUrl String?` — profil afişi (public URL). (`avatarUrl String?` **zaten var**, yalnız yazılmıyordu.)
- `Guild.bannerUrl String?` — ortam afişi (public URL). (`iconUrl` zaten var; `bannerColor` preset kalır, afiş görseli onun üstüne gelir.)
- `enum ModActionType` **+= `MEDIA_REMOVE`** (takedown; §4).

**Migration üretilir + DB'ye uygulanır.** DoD'a `prisma migrate status` temiz şartı (mock Prisma build/test bunu yakalamaz — bkz. migration-borç kuralı).

---

## §2 — Backend: paylaşılan görsel-upload helper (Rule of Three)

Avatar + profil-afiş + ortam-afiş = image-presign'ın 3. tekrarı (ikon = mevcut 1.). **Yeni 3 yüzey tek helper'dan geçer; çalışan ikon kodu YENİDEN YAZILMAZ** (retrofit = scope creep + risk; ikon olduğu gibi kalır, gelecekte birleşebilir).

`shared/media/image-upload.service.ts` (`SharedModule`, `exports`):
- `ALLOWED_IMAGE_TYPES` = `image/png | image/jpeg | image/webp` (**gif yok**) + contentType→ext map (`guilds.service.ts:29` mantığı taşınır: jpeg→jpg).
- `presign(prefix, ownerId, contentType): { uploadUrl, storageKey }`
  1. `uploadsEnabled` değilse → `UPLOADS_DISABLED` 403.
  2. contentType allowlist değilse → `UNSUPPORTED_TYPE` 400.
  3. `storageKey = ${prefix}/${ownerId}/${randomUUID()}.${ext}`.
  4. `storage.presignPut(storageKey, contentType)` → `{ uploadUrl, storageKey }`.
- `assertKeyPrefix(storageKey, expectedPrefix)` → başlamıyorsa `INVALID_STORAGE_KEY` 400.
- `publicUrl(storageKey)` → `${config s3.publicUrl}/${storageKey}`.

Boyut: ikon deseniyle hizalı — presign DTO'da size YOK; istemci kontrol eder (§5). (attachments'taki server-side size, public-image sınıfında ikonla tutarlı olsun diye MVP'de eklenmez; gerekirse D-borç.)

---

## §3 — Backend: endpoint'ler

Hepsi **presign → istemci S3'e PUT → set** üç adımı (ikon zinciri birebir). `set` gövdesi `storageKey: string | null` (null = kaldır). Prefix doğrulaması `set`'te zorunlu.

**Kullanıcı (self)** — `UsersController` (`JwtAuthGuard` + `VerifiedEmailGuard`):
- `POST /users/me/avatar/presign` `{ contentType }` → `{ uploadUrl, storageKey }` · prefix `avatars/${userId}`.
- `PATCH /users/me/avatar` `{ storageKey }` → güncel profil DTO'su (avatarUrl dolu/null). set: uploadsEnabled kapısı + `assertKeyPrefix(key, 'avatars/'+userId)` + `user.avatarUrl = publicUrl(key)` (null → alan null).
- `POST /users/me/banner/presign` + `PATCH /users/me/banner` — aynen, prefix `banners/${userId}`, alan `bannerUrl`.

**Ortam (owner)** — `GuildsController` (mevcut ikon deseni, `requireOwner`):
- `POST /guilds/:id/banner/presign` `{ contentType }` → `{ uploadUrl, storageKey }` · prefix `guild-banners/${guildId}`.
- `PATCH /guilds/:id/banner` `{ storageKey }` → `GuildDto` (bannerUrl dolu/null). Owner kapısı + prefix doğrulaması.

**DTO'lar:** `presign-avatar.dto.ts`/`presign-banner.dto.ts` (`@IsIn(ALLOWED_IMAGE_TYPES) contentType`) · `set-media.dto.ts` (`@IsOptional() @IsString() storageKey: string | null` — üç set'te paylaşılır). Yeni hata kodları: `UPLOADS_DISABLED` (mevcut), `UNSUPPORTED_TYPE` (mevcut), `INVALID_STORAGE_KEY` (mevcut ikon deseninde).

**DTO alan yayılımı:** `bannerUrl` (user) → profil/kart select'lerine + `auth me` + üye-listesi DTO'suna (avatarUrl'in gittiği her yere paralel). `avatarUrl` zaten select'te. Guild `bannerUrl` → `GuildDto` + guild select'leri.

---

## §4 — Backend: takedown `MEDIA_REMOVE` (R7 çekirdeği)

**Neden ayrı aksiyon:** mevcut `CONTENT_REMOVE` yalnız mesaj soft-delete + kodu karışık (moderation.service:159-176 ölü dal). Mesaj yolunu (R7) kurcalamamak için ayrı temiz aksiyon.

`enum ModActionType += MEDIA_REMOVE`. `CreateActionDto` **+** `@IsOptional() @IsEnum(MediaTarget) mediaTarget?` — `MediaTarget = USER_AVATAR | USER_BANNER | GUILD_BANNER | GUILD_ICON` (DTO-seviyesi enum). `type === MEDIA_REMOVE` iken `mediaTarget` zorunlu (yoksa `MEDIA_TARGET_REQUIRED` 400).

`applyInstantEnforcement` `case 'MEDIA_REMOVE'`:
- `USER_AVATAR`/`USER_BANNER` → `dto.targetUserId` kullanıcısının ilgili alanı **null**.
- `GUILD_BANNER`/`GUILD_ICON` → `dto.scope` = guildId; guild'in ilgili alanı **null** (`GUILD_ICON` mevcut `iconUrl`'i de kapsar — ikon takedown'ı da bu yolla).
- Kayıt: diğer aksiyonlar gibi ModAction + audit (mevcut desen). **S3 objesi silinmez** (yalnız referans düşer → hiçbir yerde servis edilmez; fiziksel silme/kanıt-saklama A2/hukuk, D13 orphan). Moderatör-gated (`ModeratorGuard`, mevcut `POST /moderation/actions`).

**Rapor tarafı — YENİ ReportTarget YOK:** avatar/profil-afiş → mevcut `USER` raporu; ortam afiş/ikon → mevcut `GUILD` raporu kapsar. `contextSnapshot` mevcut minimal-referans deseninde kalır (içerik/kanıt yakalama hukuk-gated, değişmez).

---

## §5 — Frontend (`web/`)

İstemci deseni: `guildsApi.iconPresign` → `attachmentsApi.uploadToS3(uploadUrl, file, onProgress)` → set (birebir `GuildSettingsView.vue:234` akışı, progress + `URL.createObjectURL` önizleme).

1. **API client:** `usersApi` → `avatarPresign/setAvatar/bannerPresign/setBanner`; `guildsApi` → `bannerPresign/setBanner` (mevcut `iconPresign/setIcon` yanına).
2. **Profil (`UserSettingsView.vue`, Profil sekmesi):** avatar yükle (mevcut daire gösterimin üstüne "Değiştir/Kaldır") + profil afişi yükle/kaldır. `image/png,image/jpeg,image/webp` accept; istemci tip+boyut (`maxUploadMb`) kontrolü + önizleme + progress. Gating: `UPLOADS_ENABLED` kapalı → presign 403 (`UPLOADS_DISABLED`) yakalanır, alan gizlenir/bilgi verilir (ikon gating sinyaliyle aynı).
3. **Ortam (`GuildSettingsView.vue`):** afiş yükle/kaldır, mevcut ikon alanının yanına (yalnız owner).
4. **Gösterim:** avatar → `UserAvatar.vue` zaten `avatarUrl` render ediyor (ek iş yok). Profil afişi → profil kartı/görünümünde üst banner (`object-cover`, `--kv-radius`). Ortam afişi → ortam başlığı/genel-bakışta banner (doğal yer; **olmayan yere placeholder KOYMA** — ui-bos-placeholder). `bannerColor` preset, afiş görseli yoksa fallback.
5. **Rapor girişi:** profil görünümünde USER raporu + ortam ayar/genel-bakışta GUILD raporu **mevcutsa dokunma**; yoksa `ReportModal`'ı bu iki noktaya bağla (yeni modal yazma).
6. **i18n + token:** tüm string `tr.json` (`profile.avatarUpload/avatarRemove/bannerUpload/...`, `guild.bannerUpload/...`, hata kodları); ölçü/renk `--kv-*`.

---

## §6 — DoD

- [ ] Şema: `User.bannerUrl` + `Guild.bannerUrl` + `ModActionType.MEDIA_REMOVE`; migration üretildi **ve DB'ye uygulandı** (`prisma migrate status` temiz)
- [ ] `ImageUploadService` (SharedModule): allowlist gif-siz + presign(uploadsEnabled/type/key) + assertKeyPrefix + publicUrl; **ikon kodu yeniden yazılmadı**
- [ ] 3 yüzey presign+set: avatar/profil-afiş (self, VerifiedEmail) · ortam-afiş (owner); set'te prefix doğrulaması + uploadsEnabled savunma-derinliği; null → kaldır
- [ ] `avatarUrl`/`bannerUrl` (user) + `bannerUrl` (guild) ilgili DTO/select'lere yayıldı (auth me, profil/kart, üye listesi, GuildDto)
- [ ] **R7 — `MEDIA_REMOVE`:** 4 hedef null'lar (obje silmez); `mediaTarget` zorunlu doğrulaması; ModeratorGuard; mesaj `CONTENT_REMOVE` yolu **değişmedi**; audit kaydı
- [ ] Rapor: yeni ReportTarget YOK; USER/GUILD mevcut hedefler kullanılıyor
- [ ] Web: profil avatar+afiş, ortam afiş yükleme (progress/önizleme/kaldır); gating gizleme; afiş gösterim; rapor girişleri; i18n + token; placeholder şişirme yok
- [ ] Gating: `UPLOADS_ENABLED=false` → presign+set 403, web alanları gizli
- [ ] `nest build` + `vue-tsc`(mevcut auth.ts hariç) + `vite build` temiz; birim test (presign type-ret/uploadsEnabled-ret + set prefix-ret + `MEDIA_REMOVE` 4 hedef null + mediaTarget-zorunlu + VerifiedEmail kapısı)
- [ ] **R7 insan incelemesi:** `MEDIA_REMOVE` + T&S yayılımı diff'i sahibe sunuldu
- [ ] Sahip canlı test (dev, `UPLOADS_ENABLED=true`): avatar+afiş yükle→görünür→kaldır; ortam afişi; `UPLOADS_ENABLED=false`→yüzeyler karanlık

---

## §7 — Sapma Kuralı

Şu ihtiyaçlar → **DUR, PM'e dön:** (a) GIF/animasyon açma (premium faz, ayrı sözleşme); (b) scanStatus/presigned-GET'e geçip public-URL desenini terk etme; (c) `CONTENT_REMOVE`'u polimorfik yapıp mesaj yolunu değiştirme (ayrı `MEDIA_REMOVE` kararı); (d) S3 objesini fiziksel silme / kanıt-saklama (A2 hukuk); (e) ikon kodunu helper'a retrofit (scope creep). Bu yüzeyler public-URL + rapor+takedown; gerçek tarama A1'de.
