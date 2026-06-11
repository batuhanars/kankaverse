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
- [ ] Prisma: `AuthToken` modeli + `AuthTokenType` enum + `User.authTokens` ilişki + migration (additive)
- [ ] `EmailService` (SharedModule): Resend adaptörü + konsol fallback (anahtarsız dev); `RESEND_API_KEY` prod fail-fast
- [ ] Token util: 32-byte rastgele üret + `SHA-256` hash + tek-kullanım/süre doğrulama
- [ ] `POST /auth/verify-email` (token → emailVerifiedAt set, usedAt)
- [ ] `POST /auth/resend-verification` (auth, rate-limit, zaten-doğrulanmış 409)
- [ ] `POST /auth/forgot-password` (her zaman 200, sızıntı yok, rate-limit)
- [ ] `POST /auth/reset-password` (şifre set + TÜM oturum revoke + emailVerifiedAt set)
- [ ] `register` yan etkisi: doğrulama e-postası gönder (gönderim register'ı bloke etmez)
- [ ] `VerifiedEmailGuard` → `POST /guilds` doğrulanmamışta 403 EMAIL_NOT_VERIFIED
- [ ] `toUserDto`: `emailVerified` alanı; Swagger güncel
- [ ] Yeni env: `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL` → `.env.example`

### Frontend (`web/`)
- [ ] `UserDto.emailVerified` tip + tüketim
- [ ] Doğrulama bandı (emailVerified=false → uyarı + "Tekrar gönder")
- [ ] `VerifyEmailView` (`/verify-email`), `ForgotPasswordView` (`/forgot-password`), `ResetPasswordView` (`/reset-password`)
- [ ] Login'e "Şifremi unuttum" linki
- [ ] Guild oluşturmada 403 EMAIL_NOT_VERIFIED ele alımı (buton disabled/tooltip)
- [ ] Yeni hata kodları i18n map + tüm yeni metinler `tr.json`

### Sprint 2A DoD (contract §9)
- [ ] Doğrulanmamış girer ama sunucu kuramaz; link doğrular
- [ ] forgot sızdırmaz; reset tüm oturumları düşürür + emailVerified yapar
- [ ] Token tek-kullanım + süreli; EmailService soyut (anahtarsız konsol)
- [ ] **R7:** 2A diff'i satır satır kullanıcı incelemesinden geçti
