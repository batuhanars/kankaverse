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
- [ ] Ayarlar → Güvenlik ekranı (2FA kur/kapat, kurtarma kodları, şifre/e-posta değiştir, oturumlarım, hesap sil)
- [ ] Login 2FA adımı (challenge → TOTP/kurtarma kodu)
- [ ] Paylaşılan reauth modalı
- [ ] E-posta değişim confirm/undo landing'leri + deaktif/grace uyarı akışı
- [ ] `UserDto.twoFactorEnabled`; yeni hata kodları i18n map + metinler `tr.json`

### Sprint 2B DoD (contract §10)
- [ ] 2FA kur→etkinleştir→2 adım login; kurtarma kodu login + tek-kullanım
- [ ] `totpSecret` şifreli; oturumlarım liste+çıkış; yeni-cihaz bildirimi
- [ ] Hassas işlemler reauth ister; e-posta değişim+geri-al; hesap silme gated (purge no-op)
- [ ] `isMinor` job; challenge token access kabul edilmiyor
- [ ] **R7:** 2B diff'i satır satır kullanıcı incelemesinden geçti
