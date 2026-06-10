# TASK.md — Canlı Sprint İlerlemesi

> Dev session **checkbox işaretler**, item EKLEMEZ. Yeni item = scope creep = PM onayı.
> Aktif sprint sözleşmesi: `contracts/SPRINT_1_CONTRACT.md`.

---

## Sprint 1 — Walking Skeleton

### Ortak / Kurulum
- [ ] PostgreSQL + Redis dev ortamı (varsayılan: docker-compose) — açık soru, contract §10
- [ ] `api/.git` yuva sorunu çözümü (kökte git init) — kullanıcı onayı bekliyor

### Backend (`api/`)
- [ ] Prisma + PostgreSQL kurulumu, `schema.prisma` (contract §2), ilk migration
- [ ] `PrismaModule` (global) + `PrismaService`
- [ ] `common/`: `TransformInterceptor`, `GlobalExceptionFilter` (envelope), `JwtAuthGuard`, `@CurrentUser()`
- [ ] `main.ts`: global `ValidationPipe` + interceptor + filter + `@nestjs/swagger` (`/api/docs`) + Socket.IO Redis adapter
- [ ] `auth` modülü: register, login, refresh (rotasyon + reuse tespiti), logout, me — **R7 insan incelemesi**
- [ ] argon2id hash + JWT access (15dk) + rotasyonlu refresh + `Session` kaydı + httpOnly cookie
- [ ] `guilds` modülü: POST (atomik: guild + OWNER member + `#genel-sohbet`), GET, POST join
- [ ] `channels` modülü: POST (OWNER/ADMIN), GET (üye)
- [ ] `messages` modülü: GET (cursor `before`, 50), POST (+ WS broadcast tetikle)
- [ ] WS gateway: handshake auth, `channel:join`/`channel:leave`, `message.created` broadcast

### Frontend (`web/`)
- [ ] Altyapı: Tailwind + `styles/tokens.css` (design-tokens), Figtree + JetBrains Mono fontları
- [ ] Pinia + vue-router + vue-i18n (`i18n/tr.json`)
- [ ] `api/` axios instance + envelope-aware interceptor + 401→refresh (in-flight promise)
- [ ] `stores/`: auth, guilds, channels, messages
- [ ] `useSocket` composable (Socket.IO client, token handshake, room join/leave)
- [ ] `LoginView` (tasarım giris_yap; e-Devlet butonu disabled placeholder)
- [ ] `RegisterView` (doğum tarihi zorunlu alan)
- [ ] App shell: `ServerRail` (altıgen ikon + "+") · `ChannelPanel` · mesaj alanı · `MemberPanel` (statik stub)
- [ ] Guild oluştur / guild'e join akışı
- [ ] Gerçek zamanlı mesaj gönder/al + geçmiş yükleme

### Sprint 1 DoD (contract §10)
- [ ] İki kullanıcı uçtan uca gerçek zamanlı mesajlaşma
- [ ] Mesaj geçmişi yenilemede REST'ten yükleniyor
- [ ] 401 → otomatik refresh şeffaf
- [ ] Tüm UI metni i18n'den (gömülü string yok)
- [ ] Envelope tutarlı + Swagger üretiyor + Redis adapter bağlı
- [ ] Auth modülü diff'i kullanıcı incelemesinden geçti (R7)
