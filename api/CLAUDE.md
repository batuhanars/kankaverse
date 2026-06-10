# Kankaverse API — Backend CLAUDE.md (NestJS)

> Bu dosya **kök `../CLAUDE.md` ile birlikte** yüklenir (cascade). Cross-cutting kurallar (response envelope,
> i18n, T&S inceleme, çalışma modeli) kökte; burada yalnızca backend-spesifik kurallar var.

Stack: **NestJS 11 + Prisma + PostgreSQL**. Referans: `knowledge/stack/nestjs/code-organization.md`.

---

## Klasör Yapısı

```
src/
├── modules/<feature>/          # auth, users, guilds, channels, messages, ...
│   ├── <feature>.module.ts
│   ├── <feature>.controller.ts # SADECE HTTP katmanı — route + DTO map + service çağrısı
│   ├── <feature>.service.ts    # Business logic burada
│   ├── dto/                    # create-x.dto.ts, update-x.dto.ts (class-validator)
│   └── strategies/             # (auth) jwt.strategy.ts, ...
├── common/
│   ├── decorators/             # @CurrentUser(), @Roles()
│   ├── filters/                # GlobalExceptionFilter (envelope)
│   ├── guards/                 # JwtAuthGuard, RolesGuard
│   ├── interceptors/           # TransformInterceptor (envelope)
│   ├── pipes/                  # ValidationPipe customization
│   └── utils/                  # saf TS helper (NestJS dekoratörü yok)
├── shared/                     # SharedModule — çok modülde gereken servisler (exports zorunlu)
├── config/                     # typed config (ConfigModule)
├── prisma/                     # PrismaService (PrismaModule global)
├── app.module.ts
└── main.ts                     # global pipe/interceptor/filter + Swagger + Redis adapter burada
```

## Katman Sorumlulukları

- **Controller:** route tanımla, DTO'ya map et, service çağır, veriyi DÖN (sarmalama). Business logic yok.
- **Service:** business logic + Prisma çağrıları. Injectable.
- **Module:** feature bazlı; dışa açılan servisler `exports`'a girer.
- **Cross-cutting:** loglama/auth/transform/validation controller'a yazılmaz → guard/interceptor/pipe/filter.
  Global olanlar `main.ts`'te bağlanır.

## DTO

- Endpoint başına ayrı DTO; validation `class-validator` ile DTO içinde.
- `UpdateXDto extends PartialType(CreateXDto)` — tekrar yazma.

---

## Kimlik Doğrulama & Oturum (brief §8 — R7 kapsamında, insan incelemesi zorunlu)

- Şifre hash: **argon2id**.
- **JWT access token ~15 dk** + **rotasyonlu refresh token**: her kullanımda yenilenir; çalınan token tekrar
  kullanılırsa **tüm token ailesi iptal** edilir. Her refresh token bir `Session` kaydına bağlı.
- Saklama (istemci tarafı sözleşmesi): web → httpOnly+Secure cookie. (Electron safeStorage, Flutter secure
  storage sonraki istemcilerde.)
- E-posta doğrulanmamış hesap girebilir ama **kısıtlı** (sunucu kuramaz, DM başlatamaz).
- Hassas işlemler (şifre/e-posta değişimi, 2FA kapatma, hesap silme) → **yeniden kimlik doğrulama** ister. (Sprint 2+)

## Gerçek Zamanlı (Socket.IO)

- **Socket.IO + Redis adapter ilk günden** (`@socket.io/redis-adapter`) — tek instance yeterken bile mimaride hazır.
- Handshake'te access token doğrulanır; yenileme bağlantı üzerinden.
- Kanal = "room" mantığı; `message.created` ilgili room'a broadcast edilir.

## Veritabanı (Prisma + PostgreSQL)

- `PrismaService` global modülde; service'lere inject edilir.
- Şema brief §7 haritasından sprint sprint büyür. **T&S alanları birinci sınıf** — şemaya gömülü kalır,
  enforce ilgili sprint'te açılır.
- Soft delete (`deletedAt`) pattern'i User/Guild/Message/Channel'da.
- `Message` en hızlı büyüyen tablo: kritik indeks `(channelId, createdAt)`; partitioning büyüme eşiğinde (decisions-log).

---

## Dağılma Sinyalleri

- Controller 50+ satır → business logic service'e çıkar.
- Service 200+ satır → sorumluluk böl.
- Aynı query 2 service'te → repository/shared util.
- `imports` 5+ modül → circular dependency riski, gözden geçir.

## Sapma Kuralı

Contract'taki bir endpoint/DTO/enum'u değiştirme ihtiyacı → **dur, kullanıcıya bildir, PM'e dön.** Backend'de
mimari karar verme; contract revize edilir, sonra kod.
