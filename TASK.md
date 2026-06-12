# TASK.md — Canlı Sprint İlerlemesi

> Dev session **checkbox işaretler**, item EKLEMEZ. Yeni item = scope creep = PM onayı.
> Aktif sprint sözleşmesi: `contracts/SPRINT_1_CONTRACT.md`.

---

## Sprint 1 — Walking Skeleton

### Ortak / Kurulum
- [x] PostgreSQL + Redis dev ortamı → kök `docker-compose.yml` + `.env.example` (PM sağladı). Dev: `cp .env.example .env && docker compose up -d`
- [x] Git: kök depo başlatıldı, GitHub'a push edildi (yuva-git sorunu kalmadı)

### Backend (`api/`)
- [x] Prisma + PostgreSQL kurulumu, `schema.prisma` (contract §2), ilk migration
- [x] `PrismaModule` (global) + `PrismaService`
- [x] `common/`: `TransformInterceptor`, `GlobalExceptionFilter` (envelope), `JwtAuthGuard`, `@CurrentUser()`
- [x] `main.ts`: global `ValidationPipe` + interceptor + filter + `@nestjs/swagger` (`/api/docs`) + Socket.IO Redis adapter
- [x] `auth` modülü: register, login, refresh (rotasyon + reuse tespiti), logout, me — **R7 insan incelemesi**
- [x] argon2id hash + JWT access (15dk) + rotasyonlu refresh + `Session` kaydı + httpOnly cookie
- [x] `guilds` modülü: POST (atomik: guild + OWNER member + `#genel-sohbet`), GET, POST join
- [x] `channels` modülü: POST (OWNER/ADMIN), GET (üye)
- [x] `messages` modülü: GET (cursor `before`, 50), POST (+ WS broadcast tetikle)
- [x] WS gateway: handshake auth, `channel:join`/`channel:leave`, `message.created` broadcast

### Frontend (`web/`)
- [x] Altyapı: Tailwind + `styles/tokens.css` (design-tokens), Figtree + JetBrains Mono fontları
- [x] Pinia + vue-router + vue-i18n (`i18n/tr.json`)
- [x] `api/` axios instance + envelope-aware interceptor + 401→refresh (in-flight promise)
- [x] `stores/`: auth, guilds, channels, messages
- [x] `useSocket` composable (Socket.IO client, token handshake, room join/leave)
- [x] `LoginView` (tasarım giris_yap; e-Devlet butonu disabled placeholder)
- [x] `RegisterView` (doğum tarihi zorunlu alan)
- [x] App shell: `ServerRail` (altıgen ikon + "+") · `ChannelPanel` · mesaj alanı · `MemberPanel` (statik stub)
- [x] Guild oluştur / guild'e join akışı (kısmen — bkz. PM notu ↓)
- [x] Gerçek zamanlı mesaj gönder/al + geçmiş yükleme

> **PM notu (2026-06-11) — join-by-ID UI bağlama ertelendi.** Backend `POST /guilds/:id/join` ve
> frontend `JoinGuildModal.vue` + `guildsApi.join` hazır, ama ServerRail'de modalı açan düğme ve guild
> ID'yi gösterip kopyalama affordance'ı **bilinçli olarak yazılmadı**. `onJoinGuild` prop'u + modal şu an
> öksüz kod; bu kabul edilmiş bir karar (scope creep değil), gerçek davet sistemiyle (Sprint 7) birleştirilecek.
> Ham guild ID paylaşımı zaten atılacak geçici köprüydü; Sprint 7'de davet kodu/linki + T&S kapıları
> (`adultsOnly`/minor) ile değişecek. → DoD §10 "ikinci kullanıcı join olur" maddesi UI'dan o zamana kadar açık.

### Sprint 1 DoD (contract §10)
- [ ] İki kullanıcı uçtan uca gerçek zamanlı mesajlaşma
- [ ] Mesaj geçmişi yenilemede REST'ten yükleniyor
- [ ] 401 → otomatik refresh şeffaf
- [ ] Tüm UI metni i18n'den (gömülü string yok)
- [ ] Envelope tutarlı + Swagger üretiyor + Redis adapter bağlı
- [x] Auth modülü diff'i kullanıcı incelemesinden geçti (R7)

---

## Sprint 2A — E-posta Doğrulama & Şifre Kurtarma

> Aktif sözleşme: `contracts/SPRINT_2A_CONTRACT.md`. **R7: tamamı insan incelemesi.** Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] Prisma: `AuthToken` modeli + `AuthTokenType` enum + `User.authTokens` ilişki + migration (additive)
- [x] `EmailService` (SharedModule): Resend adaptörü + konsol fallback (anahtarsız dev); `RESEND_API_KEY` prod fail-fast
- [x] Token util: 32-byte rastgele üret + `SHA-256` hash + tek-kullanım/süre doğrulama
- [x] `POST /auth/verify-email` (token → emailVerifiedAt set, usedAt)
- [x] `POST /auth/resend-verification` (auth, rate-limit, zaten-doğrulanmış 409)
- [x] `POST /auth/forgot-password` (her zaman 200, sızıntı yok, rate-limit)
- [x] `POST /auth/reset-password` (şifre set + TÜM oturum revoke + emailVerifiedAt set)
- [x] `register` yan etkisi: doğrulama e-postası gönder (gönderim register'ı bloke etmez)
- [x] `VerifiedEmailGuard` → `POST /guilds` doğrulanmamışta 403 EMAIL_NOT_VERIFIED
- [x] `toUserDto`: `emailVerified` alanı; Swagger güncel
- [x] Yeni env: `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL` → `.env.example`

### Frontend (`web/`)
- [x] `UserDto.emailVerified` tip + tüketim
- [x] Doğrulama bandı (emailVerified=false → uyarı + "Tekrar gönder")
- [x] `VerifyEmailView` (`/verify-email`), `ForgotPasswordView` (`/forgot-password`), `ResetPasswordView` (`/reset-password`)
- [x] Login'e "Şifremi unuttum" linki
- [x] Guild oluşturmada 403 EMAIL_NOT_VERIFIED ele alımı (buton disabled/tooltip)
- [x] Yeni hata kodları i18n map + tüm yeni metinler `tr.json`

### Sprint 2A DoD (contract §9)
- [x] Doğrulanmamış girer ama sunucu kuramaz; link doğrular
- [x] forgot sızdırmaz; reset tüm oturumları düşürür + emailVerified yapar
- [x] Token tek-kullanım + süreli; EmailService soyut (anahtarsız konsol)
- [x] **R7:** 2A diff'i satır satır kullanıcı incelemesinden geçti (PM review: F1/F3 düzeltildi; kullanıcı görünen tarafı test etti)

---

## Sprint 2B — 2FA, Oturum Yönetimi, Hassas İşlemler & Hesap Silme

> Aktif sözleşme: `contracts/SPRINT_2B_CONTRACT.md`. **R7: tamamı insan incelemesi.** Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] Prisma: `User.twoFactorEnabled/totpSecret/deletionRequestedAt`, `RecoveryCode` modeli, `AuthToken.payload` + `EMAIL_CHANGE`/`EMAIL_CHANGE_UNDO` tipleri + migration
- [x] `crypto.util`: AES-256-GCM `encryptSecret`/`decryptSecret`; `TOTP_ENC_KEY` prod fail-fast
- [x] 2FA: `setup` (otplib+qrcode, reauth), `enable` (kod→kurtarma kodları), `disable` (reauth)
- [x] Login 2 adım: `login` challenge dönüşü + `login/2fa` (TOTP/kurtarma kodu); JwtStrategy challenge token'ı reddeder
- [x] `verifyReauth` paylaşılan helper (şifre + varsa TOTP)
- [x] Oturumlar: `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/sessions/revoke-others`
- [x] Şifre değiştir (reauth, diğer oturumları düşür) + e-posta değiştir/confirm/undo
- [x] Hesap silme (reauth → deletionRequestedAt + oturum düşür), grace'te giriş=iptal, cancel
- [x] EmailService: yeni-cihaz + e-posta-değişim bildirim/geri-al
- [x] `@nestjs/schedule`: `isMinor` 18-yaş job + 30-gün purge **GATED** (no-op, `PURGE_ENABLED` default false)
- [x] `toUserDto`: `twoFactorEnabled`; yeni env `.env.example`'a

### Frontend (`web/`)
- [x] Ayarlar → Güvenlik ekranı (2FA kur/kapat, kurtarma kodları, şifre/e-posta değiştir, oturumlarım, hesap sil)
- [x] Login 2FA adımı (challenge → TOTP/kurtarma kodu)
- [x] Paylaşılan reauth modalı
- [x] E-posta değişim confirm/undo landing'leri + deaktif/grace uyarı akışı
- [x] `UserDto.twoFactorEnabled`; yeni hata kodları i18n map + metinler `tr.json`

### Sprint 2B DoD (contract §10)
- [x] 2FA kur→etkinleştir→2 adım login; kurtarma kodu login + tek-kullanım
- [x] `totpSecret` şifreli; oturumlarım liste+çıkış; yeni-cihaz bildirimi
- [x] Hassas işlemler reauth ister; e-posta değişim+geri-al; hesap silme gated (purge no-op)
- [x] `isMinor` job; challenge token access kabul edilmiyor
- [x] **R7:** 2B diff'i satır satır incelemesinden geçti (PM review: çekirdek güvenlik doğru; #2 düzeltildi, #1/#4 debt, #3 §7 senkron)

---

## Sprint 3 — DM + Arkadaşlık + Engelleme + Merkezi DM Karar Fonksiyonu

> Aktif sözleşme: `contracts/SPRINT_3_CONTRACT.md`. **R7: `DmPermissionService` + DM erişim kontrolü** (T&S karar fonksiyonu) insan incelemesi. Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] Prisma: `User.friendCode` (unique, register'da üret + backfill), `Friendship`/`FriendshipStatus`, `UserBlock`, `ChannelMember` + migration
- [x] **`DmPermissionService.canDm`** — §3 matrisi: blok→arkadaş→minor→**yeni hesap (§5.1.b, `NEW_ACCOUNT_DM_LOCK` config)**→dmPolicy→ortak sunucu; `verificationStatus` okuma + davranış/report/karantina no-op hook **[R7]**
- [x] `friendCode` util (8-char base32, çakışmada yeniden üret); register yan etkisi
- [x] Arkadaşlık: GET friends/requests, POST request (kodla, karşılıklı otomatik kabul), accept/decline, DELETE
- [x] Engelleme: GET/POST/DELETE blocks (block → arkadaşlık sil + istek iptal, transaction)
- [x] DM: GET/POST `/dm/channels` (canDm kapısı), POST read; `DmChannelDto` (son mesaj + unread)
- [x] **`MembershipService.requireChannelAccess` DM `ChannelMember` kontrolü** (güvenlik açığı kapanışı) **[R7]** + DM send blok kontrolü
- [x] `toUserDto`: `friendCode`; yeni hata kodları

### Frontend (`web/`)
- [ ] Home ekranı (rail hexagon → DM listesi + Arkadaşlar sekmesi); kendi kodunu göster/kopyala (`useClipboard`)
- [ ] Arkadaş ekle (kod gir), bekleyen istekler, kabul/reddet/sil
- [ ] DM görünümü (mevcut mesaj bileşenleri) + unread rozeti
- [ ] Engelle/arkadaşlıktan çıkar (bağlam menüsü + ConfirmDialog)
- [ ] `UserDto.friendCode`; yeni hata kodları i18n map + metinler `tr.json`

### Sprint 3 DoD (contract §11)
- [ ] Kod ile arkadaşlık (karşılıklı otomatik kabul); username araması yok
- [ ] `canDm` matrisi birebir: blok yener, minor↔yabancı DM kapalı, arkadaş izinli, dmPolicy kapıları
- [ ] DM erişim açığı kapandı (ChannelMember olmayan erişemez, REST+WS); blok sonradan DM keser
- [ ] DM gerçek zamanlı + unread `lastReadAt`
- [ ] **R7:** `canDm` + DM erişim kontrolü incelemesinden geçti

### Sprint 3 — Revizyon R1+R2 (2026-06-12, PM onaylı kapsam; bkz. contract "Revizyon R1+R2")

> Çekirdek merge sonrası proje-sahibi talebi. **Scope creep DEĞİL** (PM onayı var). Dev checkbox işaretler, item EKLEMEZ.

**R1 — Arkadaş kimliği `rumuz#etiket` (Backend `api/`):** ~~[x] uygulandı~~ → **R3 İLE GERİ ALINDI** (aşağı bkz.)

**R3 — Arkadaş kimliği A modeline geri (Backend `api/`) — `rumuz#etiket` revert (PM onaylı, /kurul sonrası):**
- [ ] Prisma: `User.friendTag` **drop** → `friendCode String @unique` **geri** + migration (friendCode backfill üret, friendTag kaldır)
- [ ] `friend-tag.util` → `friend-code.util` (`generateFriendCode` 8-char base32, çakışmada yenile); register yan etkisi geri
- [ ] `SendFriendRequestDto`: `handle` → `friendCode` (`@Length(8,8)`); servis `findUnique({ where: { friendCode } })`; bulunamaz → `USER_NOT_FOUND`; `handle` ayrıştırma + `INVALID_HANDLE` **kaldır**
- [ ] `toUserDto`: `friendTag` → `friendCode`; Swagger + hata kodları geri

**R1 — UI Discord yerleşimine hizalama (Frontend `web/`) — ÖNCE `design-refs/discord/INDEX.md` oku:**
- [ ] **Üst bar (yatay):** başlık + sekmeler (Tümü/Bekleyen/Engellenmiş) + yeşil "Arkadaş Ekle" aynı satırda; mevcut "başlık+kod kutusu+form" üst bloğu + ayrı sekme şeridi KALDIRILIR
- [ ] **"Arkadaş Ekle" = ayrı sekme/sayfa** (inline form değil): başlık+açıklama+tek geniş input **arkadaş kodu** (`friendCode`, 8-char)+gönder; kendi `friendCode` bu sayfanın altında [Kopyala] *(R3: rumuz#etiket değil)*
- [ ] **Liste:** sayaç başlığı + satır (avatar + ad / altında durum satırı + ayraç + hover yuvarlak ikonlar: mesaj/çıkar/engelle)
- [ ] **Sol sidebar:** "Sohbet bul ya da başlat" + "Direkt Mesajlar" başlığı + DM satırları (unread rozeti)
- [ ] Kapsam DIŞI tut: presence/"Çevrim İçi" filtresi (Sprint 6), "Şimdi Aktif"/Mesaj İstekleri/Mağaza nav
- [ ] **R3:** `UserDto` `friendCode` geri; `INVALID_HANDLE` i18n kaldır; `friendTag`/`handle` UI referansları → `friendCode`

**R2 — Arkadaşlık eventleri anlık (Backend `api/`):**
- [ ] WS gateway handshake'te `user:<userId>` odasına katıl
- [ ] `SharedModule` `RealtimeService` (`Server` ref + `emitToUser`); gateway init'te ref set eder
- [ ] `friends.service`: istek→`friend.request` (addressee), kabul→`friend.accept` (karşı taraf), sil→`friend.remove`; emit transaction SONRASI
- [ ] `blocks.service`: engelleme yan etkisinde engellenen tarafa `friend.remove` (sessiz kaldırma)

**R2 — Arkadaşlık eventleri anlık (Frontend `web/`):**
- [ ] `useSocket`/friends store `friend.request`/`friend.accept`/`friend.remove` dinler → bekleyen+arkadaş listeleri reaktif; manuel yenileme yok

### Sprint 3 R2+R3 DoD (contract §11 ekleri)
- [ ] **R3:** Arkadaş kimliği = gizli `friendCode` (A); username public ama anahtar değil; `friendTag`/`handle`/`INVALID_HANDLE` geri alındı
- [ ] Arkadaş isteği gönder/kabul/sil anlık yansır (yenileme yok)
- [ ] UI Discord referansıyla hizalı (layout R1 korunur; yalnız Arkadaş Ekle input'u kod)

---

## UI Polish — Sunucu Oluştur/Katıl modalı Discord hizalaması (sprint-bağımsız, PM onaylı 2026-06-12)

> Frontend-only görsel hizalama; backend değişmez. Referans + sınırlar: `design-refs/discord/INDEX.md` §B
> (`server-create-modal.png`). Dev checkbox işaretler. **Tema daima `tokens.css` — Discord düzenini al, rengini alma.**

**Frontend (`web/`):**
- [ ] `CreateGuildModal.vue` + `JoinGuildModal.vue` → tek `ServerModal.vue` (adım: `choose | create | join`)
- [ ] Adım `choose`: "Kendin Oluştur" + alt bölüm "Zaten davetin var mı?" → "Bir Sunucuya Katıl" (Discord düzeni)
- [ ] Adım `create`: sunucu adı input + Oluştur + geri ok; mevcut `guildsStore.createGuild` aynen
- [ ] Adım `join`: davet/ID input + Katıl + geri ok; mevcut `guildsStore.joinGuild` aynen (ham ID interim)
- [ ] ServerRail "+" düğmesi yeni `ServerModal`'ı `choose` adımında açar

**Kapsam DIŞI (yapma — Sprint 7/sonrası):** tematik şablonlar (backend), sunucu ikonu yükleme (upload altyapısı yok),
gerçek davet linkleri/kodları + T&S kapıları (Sprint 7 davet sistemi). Bunlara dokunma → sapma + PM'e dön.
