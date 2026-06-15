# SPRINT V3 — Ortam Etkinlikleri (Scheduled Events)

> Durum: **TASARIM KİLİTLİ (2026-06-15), uygulama 2026-06-16.** PM compose; sahip onaylı kapsam kararları.
> Referans görseller: sahip ekran görüntüleri (Discord etkinlik akışı, 2026-06-15) — sihirbaz 3 adım + listeleme modalı + başarı ekranı.
> **R7-hafif:** ses-kanalı etkinliği görünürlük filtresi (minör/yaş kapısı) PM incelemesi. Çekirdek auth/T&S karar fonksiyonu değil; ama minör görünürlüğü dokunuyor → dikkat.

---

## §0 — Kapsam ve Kararlar (sahip onaylı 2026-06-15)

**MVP (bu sprint):** etkinlik oluştur (3-adım sihirbaz) · listele (sidebar "Etkinlikler" sekmesi → modal kartlar) · "İlgileniyor" toggle · ses-kanalı/dış-konum · `MANAGE_EVENTS` izni.

**Ertelendi (şemaya baştan düşünüldü → yarın additive):**
- **Tekrarlama motoru** — `recurrence` enum şemada var (default `NONE`); MVP yalnız tek seferlik. Günlük/haftalık/aylık otomatik üretim **yarın**.
- **Hatırlatma / otomatik başlatma / bildirim** — `status` enum şemada var (default `SCHEDULED`); MVP'de zamanlayıcı yok, durum `startAt`'a göre türetilir. Zamanlayıcı + bildirim **yarın**.
- **Kapak görseli** — `coverImageId` (nullable FK Attachment) şemada var; MVP'de **kullanılmaz/gösterilmez**. CSAM tarayıcı gelene dek yeni upload yüzeyi açılmaz (ikon borcu D14 ile aynı politika). Gerçek tarayıcı → açılır.
- **Davet-etkinlik bağlama** (Discord `?event=` paylaş linki) — davet sistemiyle birlikte sonraya. MVP "Paylaş" = uygulama-içi derin link.
- **Takvim / "Sırala ve Görüntüle"** görünümü — sonraya.

> **Şema-foresight gerekçesi (over-engineering değil):** `recurrence`/`status`/`coverImageId` alanları bugün eklenir çünkü yarın eklenecekleri **kesin** (sahip onaylı) ve eklememek `GuildEvent` tablosunda migration churn'ü yaratır. Alanlar güvenli default'larla gelir; **mantık/motor eklenmez**. Bu, "olmayan özelliğe boş iskele" değil, kararlaştırılmış özelliğe ileri-uyumlu şemadır.

---

## §1 — Response Envelope

Tüm endpoint'ler kök CLAUDE.md envelope'unu kullanır (`TransformInterceptor`/`GlobalExceptionFilter`). Controller sarmaz, doğrudan veri döner.

---

## §2 — Veri Modeli (Prisma)

```prisma
enum EventLocationType {
  VOICE_CHANNEL
  EXTERNAL
}

enum EventRecurrence {
  NONE      // MVP — yalnız bu kullanılır
  DAILY
  WEEKLY
  MONTHLY
}

enum EventStatus {
  SCHEDULED // MVP varsayılan
  ACTIVE
  COMPLETED
  CANCELED
}

model GuildEvent {
  id               String            @id @default(cuid())
  guildId          String
  guild            Guild             @relation(fields: [guildId], references: [id], onDelete: Cascade)
  creatorId        String
  creator          User              @relation("EventCreator", fields: [creatorId], references: [id])

  name             String            // "Etkinlik Konusu" (zorunlu)
  description      String?           // markdown (mevcut markdown render boru hattı)

  locationType     EventLocationType
  channelId        String?           // VOICE_CHANNEL ise zorunlu
  channel          Channel?          @relation(fields: [channelId], references: [id], onDelete: SetNull)
  externalLocation String?           // EXTERNAL ise zorunlu (metin/konum/link, düz metin)

  startAt          DateTime
  endAt            DateTime?         // opsiyonel

  recurrence       EventRecurrence   @default(NONE)   // motor yarın
  status           EventStatus       @default(SCHEDULED) // otomatik geçiş yarın
  coverImageId     String?           // Attachment (yarın); MVP null

  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  deletedAt        DateTime?

  interests        GuildEventInterest[]

  @@index([guildId, startAt])
}

model GuildEventInterest {
  id        String     @id @default(cuid())
  eventId   String
  event     GuildEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId    String
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime   @default(now())

  @@unique([eventId, userId])
}
```

`Guild`, `User`, `Channel`'a karşı-ilişki alanları eklenir. Migration **additive**, uygulanır (`prisma migrate status` temiz — DoD).

---

## §3 — İzin: `MANAGE_EVENTS`

- `common/permissions.ts` `PERMISSION_FLAGS`'a **`MANAGE_EVENTS`** eklenir (Genel/Üyelik dışı; UI grubu: "Etkinlik" ya da Genel altında).
- **Oluştur / düzenle / sil** → `hasGuildPermission(userId, guildId, 'MANAGE_EVENTS')` (OWNER/enum-ADMIN/ADMINISTRATOR otomatik geçer — mevcut çözüm).
- **"İlgileniyor" toggle + listeleme/görüntüleme** → her üye (izin gerekmez; görünürlük §5'e tabi).
- `DEFAULT_EVERYONE_PERMISSIONS`'a EKLENMEZ.
- i18n: `permsFlags.MANAGE_EVENTS` (label "Etkinlikleri Yönet", desc "Ortam etkinliği oluştur, düzenle ve sil.").

---

## §4 — Endpoint'ler

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| POST | `/guilds/:id/events` | `MANAGE_EVENTS` | Etkinlik oluştur. Body `CreateEventDto`. → `EventDto` |
| GET | `/guilds/:id/events` | üye + görünürlük (§5) | Görünür etkinlikler, `startAt` artan. → `EventDto[]` |
| GET | `/events/:id` | üye + görünürlük | Tek etkinlik. → `EventDto` |
| PATCH | `/events/:id` | `MANAGE_EVENTS` | Güncelle. Body `UpdateEventDto` (PartialType). → `EventDto` |
| DELETE | `/events/:id` | `MANAGE_EVENTS` | Soft-delete (`deletedAt`). → `null` |
| POST | `/events/:id/interest` | üye + görünürlük | İlgileniyor işaretle (idempotent upsert). → `EventDto` |
| DELETE | `/events/:id/interest` | üye | İlgiyi kaldır (idempotent). → `EventDto` |

**Hata kodları:** `EVENT_NOT_FOUND` (404) · `INVALID_EVENT_CHANNEL` (ses kanalı değil / başka guild) · `EVENT_LOCATION_REQUIRED` (konum eksik) · `EVENT_START_IN_PAST` (geçmiş tarih) · `FORBIDDEN` (izin) · `AGE_RESTRICTED` (minör, yaş-kapılı kanal).

---

## §5 — Görünürlük & T&S (R7-hafif)

**Tek choke-point: `findVisibleEvents` / `requireEventAccess`.**

- **VOICE_CHANNEL etkinliği:** görünürlük = `MembershipService.requireChannelAccess(viewerId, channelId)`. Yani:
  - 18+/yaş-kapılı (`ageGated`) ya da `adultsOnly` kanaldaki etkinliği **minör görmez** (REST listede süzülür, GET 404/`AGE_RESTRICTED`, WS yayını süzülü).
  - Özel kanal (`isPrivate`) etkinliği yalnız kanal üyelerine görünür.
  - **Oluştururken:** creator de o kanala erişebilmeli (`requireChannelAccess`) → minör 18+ kanalda etkinlik kuramaz.
- **EXTERNAL etkinliği:** tüm guild üyelerine görünür (kanal kapısı yok). `externalLocation` **düz metin** saklanır + render edilir (otomatik embed YOK, XSS-güvenli — mevcut mesaj içerik politikası). Link tıklanabilir ama önizleme yok.
- **Minör statüsü sızmaz:** görünmeyen etkinlik jenerik 404 / listede yok (özel sebep dönmez).
- **Fail-closed:** ilişki/erişim belirsizse görünmez.

> **R7-hafif inceleme noktası:** `findVisibleEvents` voice-kanal süzme + creator erişim kapısı. PM satır-satır okur; çocuk-güvenliği kapısı (yaş/adultsOnly) `requireChannelAccess` ile miras → izin sisteminin/etkinliğin ÜSTÜNDE, delinmez.

---

## §6 — DTO'lar

**CreateEventDto** (`class-validator`):
- `name: string` — `@Length(1, 100)`, zorunlu.
- `description?: string` — `@MaxLength(1000)`.
- `locationType: 'VOICE_CHANNEL' | 'EXTERNAL'` — `@IsEnum`.
- `channelId?: string` — `VOICE_CHANNEL` ise zorunlu (servis doğrular: guild'e ait + `GUILD_VOICE` türü).
- `externalLocation?: string` — `EXTERNAL` ise zorunlu, `@MaxLength(200)`.
- `startAt: string` (ISO) — `@IsDateString`, gelecekte (servis kontrolü `EVENT_START_IN_PAST`).
- `endAt?: string` (ISO) — opsiyonel, `> startAt`.
- `recurrence?: 'NONE'` — MVP yalnız `NONE` kabul (diğerleri `400` ya da sessiz `NONE`; **yarın açılır**).

**UpdateEventDto** = `PartialType(CreateEventDto)`.

**EventDto** (yanıt):
```jsonc
{
  "id", "guildId", "creatorId",
  "name", "description",
  "locationType", "channelId", "channelName",   // channelName: voice ise çözülür
  "externalLocation",
  "startAt", "endAt",
  "recurrence", "status",                        // status MVP: startAt>now ? SCHEDULED : COMPLETED (türetilir)
  "interestedCount",                             // GuildEventInterest sayısı
  "interestedByMe",                              // viewer ilgileniyor mu
  "createdAt"
}
```

---

## §7 — Gerçek Zamanlı (WS)

`RealtimeService.emitToUsers` ile **görünür üyelere** (voice ise kanal-erişimliler, external ise tüm üyeler):
- `guild.event_created` → `EventDto`
- `guild.event_updated` → `EventDto`
- `guild.event_deleted` → `{ guildId, eventId }`

İlgi sayacı: toggle yanıtı `EventDto` döndüğü için frontend optimistik + store güncellemesi yeterli; ayrı `event.interest` event'i MVP'de **opsiyonel** (gerekirse eklenir, başkalarının sayacı için).

---

## §8 — Frontend (`web/`)

**Giriş:**
- ChannelPanel ortam-menüsüne (mevcut dropdown) **"Etkinlik Oluştur" + 📅 takvim ikonu** satırı → `MANAGE_EVENTS` ile gizlenir (`useGuildPermissions`).

**Sihirbaz — `CreateEventWizard.vue` (3 adım, Teleport modal, üst stepper "Konum / Etkinlik Bilgisi / İncele"):**
1. **Konum:** "Etkinliğin nerede olacak?" radio: **Ses Kanalı** (seçince guild GUILD_VOICE kanalları selectbox) · **Başka Bir Yer** (metin input: konum/link). İptal / İleri.
2. **Etkinlik Bilgisi:** Konu* (input) · Başlangıç Tarihi* + Saati* · Etkinlik Sıklığı* (select — MVP yalnız "Tekrarlanmaz" etkin, diğerleri disabled "yakında") · Açıklama (textarea, markdown destekli not) · ~~Kapak Görseli~~ (MVP'de **gösterilmez**). Geri / İleri.
3. **İncele:** önizleme kartı (tarih+saat, konu, kanal/konum, ilgilenen 0). Geri / İptal / **Etkinlik Oluştur**.
- **Başarı ekranı:** "Her şey tamam!" + uygulama-içi paylaş linki (derin link, kopyala). (Discord davet-event linki → sonraya.)

**Listeleme:**
- Sidebar'da kanal listesinin **üstünde, border ile ayrılmış** "Etkinlikler" satırı/sekmesi + adet rozeti → tıkla → **events modal**.
- Modal: başlık "N Etkinlik" + (`MANAGE_EVENTS` ise) "Etkinlik Oluştur" butonu + etkinlik kartları listesi.
- **Kart:** tarih+saat (TR format: "bugün saat 23.00" / "15 Haziran 22.00") · konu · konum (🔊 kanal adı / 📍 dış) · ilgilenen sayısı · **"İlgileniyor"** toggle (yeşil aktif) · Paylaş · ⋯ (yetkiliye: Düzenle/Sil).
- Boş durum: "Henüz etkinlik yok."

**Store:** `stores/events.ts` (guild başına liste) + `api/events.ts`. `useSocket` `guild.event_*` handler'ları → store. i18n `event.*`; renk/şekil `--kv-*` token. Tarih TR yereli.

---

## §9 — DoD

- [ ] Prisma model + 3 enum + migration (additive, **uygulandı**, `migrate status` temiz)
- [ ] `MANAGE_EVENTS` bayrağı + enforcement (oluştur/düzenle/sil); interest her üye
- [ ] Görünürlük tek choke-point: voice → `requireChannelAccess` (minör/yaş/özel süzülü), external → tüm üyeler; minör statüsü sızmaz
- [ ] CRUD + interest endpoint'leri; `EventDto` (status türetilir, interestedCount/ByMe); WS event_created/updated/deleted görünür üyelere
- [ ] Sihirbaz (3 adım) + listeleme modalı + sidebar "Etkinlikler" sekmesi + "İlgileniyor" toggle; kapak görseli **gösterilmez**, sıklık yalnız "Tekrarlanmaz"
- [ ] `nest build` + `vue-tsc` + `vite build` temiz; birim testler (CRUD + izin + görünürlük/minör + interest idempotent)
- [ ] **R7-hafif:** `findVisibleEvents` minör/yaş süzme PM incelemesi; çocuk-güvenliği kapısı `requireChannelAccess` mirası korundu
- [ ] Sahip canlı test (2 hesap: oluştur → listele → İlgileniyor; minör 18+ kanal etkinliğini görmez)

---

## §10 — Sapma Kuralı

Bu sözleşmedeki endpoint/DTO/enum'a uymama ihtiyacı → dev DURUR, PM'e döner; contract revize edilir, sonra kod. Tekrarlama/bildirim/kapak alanları şemada var ama **MVP'de mantık eklenmez** (yarın ayrı tur).
