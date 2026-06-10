# Sprint 1 Contract — Walking Skeleton

> **Tek doğruluk kaynağı.** Backend ve frontend dev session'lar buradan sapamaz. Sapma ihtiyacı →
> dur, kullanıcıya bildir, PM contract'ı revize eder. Kök `CLAUDE.md` + tier `CLAUDE.md` bu contract'la birlikte geçerli.

---

## 1. Hedef (Definition of Walking Skeleton)

Uçtan uca, "çirkin ama canlı": Bir kullanıcı **kayıt olur → giriş yapar → sunucu (guild) oluşturur →
oluşan `#genel-sohbet` kanalında mesaj yazar → ikinci kullanıcı aynı kanalda mesajı gerçek zamanlı görür.**
İkinci kullanıcı davetle değil (Invite Sprint 7), Sprint 1'de **guild'e katılım sunucu sahibinin guild ID'sini
paylaşmasıyla** `POST /guilds/:id/join` üzerinden olur (geçici basitleştirme, contract'ta açık).

**Kapsam dışı (bu sprint'te YOK):** 2FA, e-posta doğrulama akışı (alan şemada var, gönderim yok), DM/grup,
dosya/medya, arkadaşlık, blok, Report/moderasyon, presence/typing, davet sistemi, rol izin matrisi, üye paneli işlevi.

---

## 2. Prisma Modelleri (Sprint 1 şeması)

> Brief §7 çekirdek alt kümesi. T&S alanları şemaya **gömülü** ama enforce edilmez (varsayılanlar set edilir).
> Soft delete = `deletedAt DateTime?`. Tüm id'ler `cuid()`. Zaman damgaları `createdAt`/`updatedAt`.

```prisma
model User {
  id                  String   @id @default(cuid())
  username            String   @unique          // 3-32, [a-zA-Z0-9_]
  email               String   @unique
  passwordHash        String                    // argon2id
  birthDate           DateTime                  // ZORUNLU (T&S giriş kapısı)
  isMinor             Boolean                   // türetilmiş: kayıt anında birthDate'ten hesaplanır (18 altı)
  verificationStatus  VerificationStatus @default(NONE)
  dmPolicy            DmPolicy           @default(FRIENDS)      // minor'da kayıt anında daha kısıtlı set edilir
  mediaPolicy         MediaPolicy        @default(FRIENDS)
  profileDiscoverable  Boolean           @default(true)         // minor için false set edilir
  emailVerifiedAt     DateTime?
  avatarUrl           String?
  deletedAt           DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  sessions            Session[]
  memberships         GuildMember[]
  ownedGuilds         Guild[]  @relation("GuildOwner")
  messages            Message[]
}

model Session {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  refreshTokenHash String                       // hashlenmiş, plain saklanmaz
  tokenFamily      String                       // rotasyon ailesi; reuse tespitinde aile iptal edilir
  device           String?
  ip               String?
  lastActiveAt     DateTime @default(now())
  revokedAt        DateTime?
  createdAt        DateTime @default(now())
  @@index([userId])
}

model Guild {
  id              String   @id @default(cuid())
  name            String                        // 2-64
  ownerId         String
  owner           User     @relation("GuildOwner", fields: [ownerId], references: [id])
  adultsOnly      Boolean  @default(false)
  iconUrl         String?
  deletedAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  members         GuildMember[]
  channels        Channel[]
}

model GuildMember {
  id        String     @id @default(cuid())
  guildId   String
  guild     Guild      @relation(fields: [guildId], references: [id])
  userId    String
  user      User       @relation(fields: [userId], references: [id])
  role      GuildRole  @default(MEMBER)
  joinedAt  DateTime   @default(now())
  @@unique([guildId, userId])
  @@index([userId])
}

model Channel {
  id        String      @id @default(cuid())
  type      ChannelType @default(GUILD_TEXT)
  guildId   String?                            // DM/GROUP_DM'de null (Sprint 3); GUILD_TEXT'te dolu
  guild     Guild?      @relation(fields: [guildId], references: [id])
  name      String?                            // GUILD_TEXT: zorunlu (2-64, slug); DM: null
  ageGated  Boolean     @default(false)
  position  Int         @default(0)
  deletedAt DateTime?
  createdAt DateTime    @default(now())
  messages  Message[]
  @@index([guildId])
}

model Message {
  id         String   @id @default(cuid())
  channelId  String
  channel    Channel  @relation(fields: [channelId], references: [id])
  authorId   String
  author     User     @relation(fields: [authorId], references: [id])
  content    String                            // 1-4000
  replyToId  String?                           // basit yanıt; thread V3
  deletedAt  DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([channelId, createdAt])               // kritik indeks
}
```

---

## 3. Enum'lar (paylaşılan — backend & frontend birebir)

```typescript
enum VerificationStatus { NONE = 'NONE', EDEVLET_VERIFIED = 'EDEVLET_VERIFIED' }
enum DmPolicy      { EVERYONE = 'EVERYONE', FRIENDS = 'FRIENDS', NONE = 'NONE' }
enum MediaPolicy   { EVERYONE = 'EVERYONE', FRIENDS = 'FRIENDS', NONE = 'NONE' }
enum GuildRole     { OWNER = 'OWNER', ADMIN = 'ADMIN', MEMBER = 'MEMBER' }
enum ChannelType   { GUILD_TEXT = 'GUILD_TEXT', DM = 'DM', GROUP_DM = 'GROUP_DM' }
```

---

## 4. Sabitler

- Access token TTL: **15 dk**. Refresh token TTL: **30 gün** (rotasyonlu).
- Şifre min 8 karakter. Username 3-32 `[a-zA-Z0-9_]`. Guild adı 2-64. Kanal adı 2-64 (slug: küçük harf, `-`).
- Mesaj içeriği 1-4000 karakter. Mesaj geçmişi sayfa boyutu: 50 (cursor tabanlı, `before` mesaj id).
- Kayıtta minor (18 altı) ise: `dmPolicy=NONE`, `mediaPolicy=NONE`, `profileDiscoverable=false` set edilir.
- WS namespace: `/` (varsayılan). Auth: handshake `auth.token` (access JWT).

---

## 5. DTO Şekilleri (paylaşılan)

```typescript
// İstemciye dönen kullanıcı (passwordHash ASLA dönmez)
interface UserDto {
  id: string; username: string; email: string; avatarUrl: string | null;
  isMinor: boolean; verificationStatus: VerificationStatus; createdAt: string;
}
interface AuthTokensDto { accessToken: string; }   // refresh httpOnly cookie ile döner, body'de DEĞİL
interface GuildDto {
  id: string; name: string; ownerId: string; adultsOnly: boolean; iconUrl: string | null; createdAt: string;
}
interface ChannelDto {
  id: string; type: ChannelType; guildId: string | null; name: string | null; ageGated: boolean; position: number;
}
interface MessageDto {
  id: string; channelId: string; content: string; replyToId: string | null;
  author: { id: string; username: string; avatarUrl: string | null };
  createdAt: string;
}
```

---

## 6. HTTP Endpoint İmzaları

> Tümü response envelope ile döner: `{ success, statusCode, data }`. Auth gereken endpoint'ler `Bearer <accessToken>`.
> Refresh token **httpOnly + Secure cookie** olarak set/clear edilir (body'de taşınmaz).

### Auth (`/auth`)
- **POST `/auth/register`** — Body `{ username, email, password, birthDate (ISO) }` →
  `201 { data: { user: UserDto, accessToken } }` + refresh cookie set. Hata: 409 `USERNAME_TAKEN`/`EMAIL_TAKEN`.
- **POST `/auth/login`** — Body `{ email, password }` → `200 { data: { user: UserDto, accessToken } }` + refresh cookie.
  Hata: 401 `INVALID_CREDENTIALS`.
- **POST `/auth/refresh`** — refresh cookie'den okur → `200 { data: { accessToken } }` + yeni refresh cookie (rotasyon).
  Reuse tespiti → aile iptal, 401 `REFRESH_REUSE_DETECTED`. Geçersiz → 401 `INVALID_REFRESH`.
- **POST `/auth/logout`** — (auth) mevcut Session revoke + cookie clear → `200 { data: null }`.
- **GET `/auth/me`** — (auth) → `200 { data: UserDto }`.

### Guilds (`/guilds`)
- **POST `/guilds`** — (auth) Body `{ name }` → `201 { data: GuildDto }`. **Yan etki:** OWNER `GuildMember` +
  varsayılan `#genel-sohbet` GUILD_TEXT kanalı atomik oluşturulur (transaction).
- **GET `/guilds`** — (auth) üye olunan guild'ler → `200 { data: GuildDto[] }`.
- **POST `/guilds/:id/join`** — (auth) guild ID ile katıl (Sprint 1 basitleştirmesi) → `201 { data: GuildDto }`.
  Hata: 404 `GUILD_NOT_FOUND`, 409 `ALREADY_MEMBER`.

### Channels (`/guilds/:id/channels`)
- **POST `/guilds/:id/channels`** — (auth, OWNER/ADMIN) Body `{ name }` → `201 { data: ChannelDto }`.
  Hata: 403 `FORBIDDEN`.
- **GET `/guilds/:id/channels`** — (auth, üye) → `200 { data: ChannelDto[] }` (position sıralı).

### Messages (`/channels/:id/messages`)
- **GET `/channels/:id/messages?before=<msgId>&limit=50`** — (auth, kanalın guild'ine üye) →
  `200 { data: MessageDto[] }` (createdAt desc, sayfalı). Hata: 403 `NOT_CHANNEL_MEMBER`.
- **POST `/channels/:id/messages`** — (auth, üye) Body `{ content, replyToId? }` → `201 { data: MessageDto }`.
  **Yan etki:** WS `message.created` event'i kanal room'una broadcast (bkz. §7).

---

## 7. WebSocket Event Sözleşmesi (Socket.IO)

- **Bağlantı:** handshake `auth: { token: <accessToken> }`. Geçersiz → `connect_error` (`UNAUTHORIZED`).
- **İstemci → sunucu:**
  - `channel:join` payload `{ channelId }` → sunucu üyelik doğrular, `room:<channelId>`'e join. Ack `{ ok: true }` / `{ ok:false, error }`.
  - `channel:leave` payload `{ channelId }`.
- **Sunucu → istemci:**
  - `message.created` payload `MessageDto` → `room:<channelId>`'deki herkese (gönderen dahil) broadcast.
    REST `POST .../messages` başarılı olunca yayılır (tek kaynak: REST yazar, WS yayar).
- Sprint 1'de typing/presence event'i YOK (Sprint 6).

---

## 8. UI Yerleşim (tasarıma referans)

> Tasarım dosyaları tek görsel kaynak; piksel kopyalama değil, token + yapı uyumu.

- **Auth:** `LoginView` ← `knowledge/projects/kankaverse/design/kankaverse_giris_yap` (e-Devlet butonu **görsel
  placeholder**, tıklama Sprint 8 — disabled/tooltip). `RegisterView`: username, email, password, **doğum tarihi (zorunlu)**.
- **App shell:** `knowledge/projects/kankaverse/design/kankaverse_ana_sohbet`.
  - `ServerRail` 72px — altıgen guild ikonları (`clip-path`), en altta "+" (guild oluştur).
  - `ChannelPanel` 248px — guild adı başlık + "METİN KANALLARI" listesi + alt kullanıcı çubuğu.
  - Mesaj alanı — başlık (kanal adı), mesaj listesi (avatar daire + username + zaman "18.42" + içerik), input (min 44px).
  - `MemberPanel` 248px — **Sprint 1'de statik stub** (üye listesi işlevi Sprint 6 presence ile).
- Tüm metin `i18n/tr.json`'dan. Tarih "25 Ekim 2023", saat "18.42".

---

## 9. Hata Kodları (machine `error`)

`USERNAME_TAKEN`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `INVALID_REFRESH`, `REFRESH_REUSE_DETECTED`,
`UNAUTHORIZED`, `FORBIDDEN`, `GUILD_NOT_FOUND`, `ALREADY_MEMBER`, `CHANNEL_NOT_FOUND`, `NOT_CHANNEL_MEMBER`,
`VALIDATION_FAILED`. Hepsi Türkçe `message` ile birlikte döner.

---

## 10. Bağımsızlık, DoD, Açık Sorular

**Bağımsızlık notları (paralel çalışma):**
- Backend ve frontend bu contract'tan paralel ilerler. Frontend, backend hazır olmadan §5-7'deki sözleşmeye
  göre mock/tip üretebilir. Entegrasyon contract imzalarına göre yapılır.
- Backend `message.created` payload'ı `MessageDto` ile **birebir** aynı olmalı (REST POST dönüşüyle aynı şekil).

**Definition of Done (Sprint 1):**
- [ ] İki tarayıcıda iki kullanıcı: biri sunucu kurar + mesaj atar, diğeri guild'e join olup mesajı **gerçek zamanlı** görür.
- [ ] Sayfa yenilenince mesaj geçmişi REST'ten yüklenir.
- [ ] Access token süresi dolunca 401 → otomatik refresh → istek şeffaf tekrar.
- [ ] Tüm UI metni Türkçe, i18n dosyasından (gömülü string yok).
- [ ] Response envelope tüm endpoint'lerde tutarlı; Swagger (`/api/docs`) OpenAPI üretiyor.
- [ ] Redis adapter bağlı (tek instance olsa bile yapılandırılmış).
- [ ] **R7:** auth modülü (register/login/refresh rotasyon + Session) diff'i kullanıcı incelemesinden geçti.

**Açık sorular (PM'e yönlendir):**
- [ ] Geliştirme ortamı: PostgreSQL + Redis lokal mi (docker-compose) yoksa dev VPS mi? (PM kararı — varsayılan: lokal docker-compose)
- [ ] `POST /guilds/:id/join` Sprint 1 basitleştirmesi onaylandı mı, yoksa minimal davet kodu mu tercih edilir? (varsayılan: join-by-id, davet Sprint 7)
- [ ] Avatar yükleme Sprint 1'de yok; `avatarUrl` null + UI'da username baş harfi placeholder yeterli mi? (varsayılan: evet)
