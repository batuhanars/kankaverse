# Sprint V2 — LiveKit Ses Kanalları (audio-only v1) Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön. Envelope `{ success, statusCode, data }`.
> İlgili: yeni `modules/voice/`, `membership.service.ts` (`requireChannelAccess` yeniden kullanılır), `channels` (ChannelType),
> frontend ChannelPanel + yeni ses-kanalı UI. Stack sapması yok: LiveKit **Cloud** (server SDK `livekit-server-sdk`).
> **R7 ZORUNLU:** `POST /channels/:id/voice/token` bir **T&S karar fonksiyonu** (erişim + yaş + karantina → yetenek üretimi).
> Webhook imza doğrulaması dahil satır satır insan incelemesinden geçmeden merge edilmez.

## Kurul kararı (2026-06-14) — değişmez sınırlar

Bu sprint kurul + sahip onayıyla şu sert kesimlerle çerçevelendi (gerekçeler `kurul` verdiktinde):

1. **v1 = audio-only.** Video + ekran-paylaşımı + DM/grup-DM sesi **KAPSAM DIŞI** (ayrı sprint). Token grant `canPublishSources` yalnız mikrofon.
2. **Ses kaydı / egress YOK.** Ses hiçbir koşulda kaydedilmez (istismar sesi depolama = CSAM/KVKK riski). Delil = **metadata** (`VoiceSession` audit + rapor anı snapshot), ses değil.
3. **Karantina → konuşma kapalı.** Guild'e yeni katılan üye (joinedAt < `quarantineHours`) sesi **dinler ama konuşamaz** (`canPublish=false`). Mevcut `quarantineHours` config'i yeniden kullanılır.
4. **Yaş kapısı token'dan önce.** `requireChannelAccess` (ageGated/adultsOnly → minör elenir) mint'ten ÖNCE; yalan beyan doğrulanmış-yetişkin sesine sokmaz.
5. **Presence = webhook→WS.** LiveKit webhook (imzalı) birincil kaynak + `VoiceSession` audit'in kaynağı. Client room event'i yalnız yerel UI hızı (opsiyonel, güven kaynağı değil).
6. **Maliyet izleme (beta notu):** eşzamanlı ses dakikası LiveKit faturasıyla doğrusal; kapalı beta'da kullanım metriği izlenecek (kod değil, operasyon notu).

---

## A. Env (api/.env — sahip sağladı, mevcut)

```
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://<proje>.livekit.cloud
```

- `configuration.ts`: `livekit: { apiKey, apiSecret, url }`. **Prod fail-fast:** üçü de yoksa boot'ta hata (2FA `TOTP_ENC_KEY` deseni). Dev'de yoksa → ses özelliği **devre dışı** (endpoint `503 VOICE_DISABLED`), boot devam eder.
- Secret **asla** istemciye dönmez; `LIVEKIT_URL` token yanıtında döner (public bilgi).

---

## B. Şema değişikliği (additive + migration)

### B1. `ChannelType` enum — yeni değer
```prisma
enum ChannelType {
  GUILD_TEXT
  GUILD_VOICE   // ← yeni (audio-only)
  DM
  GROUP_DM
}
```

### B2. `VoiceSession` — append-only T&S audit (presence DEĞİL, geçmiş)
```prisma
model VoiceSession {
  id         String   @id @default(cuid())
  channelId  String
  channel    Channel  @relation(fields: [channelId], references: [id])
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  joinedAt   DateTime @default(now())
  leftAt     DateTime?   // webhook participant_left ile set; null = (kayda göre) hâlâ içeride
  createdAt  DateTime @default(now())

  @@index([userId, joinedAt])   // §4 davranış örüntüsü: yetişkin→çok sayıda minör teması
  @@index([channelId, leftAt])
}
```
- `Channel.voiceSessions VoiceSession[]`, `User.voiceSessions VoiceSession[]` ters ilişki.
- **Migration uygulanır** ([[migration-uygulanmali]]); DoD `migrate status` temiz.
- **Anlık katılımcı tablosu YOK** — "şu an kim var" LiveKit room state + WS ile; kalıcı current-participants tutulmaz.

---

## C. Endpoint'ler — `modules/voice/`

Envelope ilk satır: tümü `{ success, statusCode, data }`. Tümü `JwtAuthGuard` (webhook hariç).

### C1. `POST /channels/:id/voice/token` — odaya katılım token'ı  **(R7)**
- **Kanal türü:** kanal `GUILD_VOICE` değilse → `400 NOT_VOICE_CHANNEL`.
- **Erişim kapısı (mint'ten ÖNCE):** `membership.requireChannelAccess(userId, channelId)` aynen çağrılır → yaş kapısı (`AGE_RESTRICTED`), guild üyeliği (`NOT_CHANNEL_MEMBER`), özel kanal (`NOT_CHANNEL_MEMBER`) hatalarını olduğu gibi yayar. **Yeni kapı yazma — mevcut helper'ı yeniden kullan.**
- **Yetenek (grant) hesabı:**
  - `roomJoin: true`, `room: channelId`, `canSubscribe: true`.
  - `canPublish`: **karantinada değilse** `true`. Karantina = bu guild'deki `GuildMember.joinedAt > now - quarantineHours` (config; `quarantineHours=0` → kapalı → herkes konuşur). Karantinadaysa `canPublish=false`.
  - `canPublishSources: ['microphone']` (audio-only; kamera/ekran v1 yok — karantinadan bağımsız video hiç yok).
  - `canPublishData: false` (v1; veri kanalı yok).
- **Identity/metadata:** token `identity = userId`; participant `name = username`; `metadata = JSON({ avatarUrl })` (istemci katılımcı kartı için). **TTL kısa** (≈10 dk); istemci `disconnected`/expiry'de yeniden ister.
- **Dönüş `data`:** `{ token: string, url: string, canPublish: boolean }` (`url` = `LIVEKIT_URL`).
- Env eksikse → `503 VOICE_DISABLED`.

### C2. `POST /voice/webhook` — LiveKit webhook (presence + audit kaynağı)  **(R7)**
- **`JwtAuthGuard` YOK** — bunun yerine **LiveKit imza doğrulaması** (`WebhookReceiver(apiKey, apiSecret).receive(body, authHeader)`). Geçersiz imza → `401`. **Ham gövde gerekir** → bu route için raw-body (aşağıda main.ts notu).
- İşlenen olaylar:
  - `participant_joined`: `VoiceSession` oluştur (`channelId=room`, `userId=identity`, `joinedAt=now`). WS yayını `voice.participant_joined`.
  - `participant_left`: o kullanıcının o oda için **en son açık** (`leftAt=null`) `VoiceSession`'ını `leftAt=now` yap. WS yayını `voice.participant_left`.
  - `room_finished`: o odanın açık tüm session'larını `leftAt=now` kapat (güvenlik ağı). (`track_*`, diğer olaylar yok sayılır.)
- İdempotent/dayanıklı: çift `joined` → ikinci'yi yok say (açık session zaten varsa); eksik `left` → `room_finished` kapatır. Webhook işleme hatası 200 döner (LiveKit retry'ı sonsuz döngüye sokmaz; hata loglanır).
- Dönüş: `{ received: true }` (LiveKit gövde şeklini umursamaz; 2xx yeter).

### C3. `GET /channels/:id/voice/participants` — anlık katılımcılar (ilk yükleme)
- WS'e bağlanmadan önce/oda açılınca mevcut katılımcıları çekmek için. **Kaynak: LiveKit `RoomServiceClient.listParticipants(room)`** (room state = tek doğruluk; DB değil).
- Erişim: `requireChannelAccess` (dinleyemeyen liste de görmesin — tutarlı). LiveKit'te oda yoksa → boş dizi.
- Dönüş `data`: `Array<{ userId, username, avatarUrl, isSpeaking?: false, mutedSelf?: boolean }>` (LiveKit participant→DTO; konuşma durumu anlık değil, WS/client güncelleyecek).

> **Not:** "Sustur/at" (force-mute / remove from room) ses moderasyon aksiyonları **bu sprint dışı** (ayrı T&S kalemi). Rapor yolu mevcut `ReportModal` ile kullanıcıya zaten açık; ses-bağlam metadata snapshot'ı o kalemde eklenecek. Bu sprint **katıl/dinle/konuş/ayrıl + presence** ile sınırlı.

---

## D. WS olayları (Socket.IO, mevcut gateway + Redis adapter)

Oda = mevcut kanal room deseni (`channel:join` zaten var). Ses olayları aynı kanal room'una yayınlanır; ses kanalını **açan** (panel görüntüleyen) herkes alır:

- `voice.participant_joined` → `{ channelId, participant: { userId, username, avatarUrl } }`
- `voice.participant_left` → `{ channelId, userId }`

Frontend `messages`/presence store deseniyle tüketir. (Konuşuyor/sustu göstergesi v1'de **client-side** LiveKit `ActiveSpeakers`/`isSpeaking` ile yerel; WS'e taşınmaz.)

---

## E. Frontend (web/)

### E1. Kanal türü etkinleştirme
- Kanal-oluştur modalında "Ses" türü **etkin** (mevcut "yakında" devre dışı kaldırılır; forum **kapalı kalır**). Tür seçilince `type: 'GUILD_VOICE'`.
- ChannelPanel: ses kanalı 🔊 ikonu; metin kanalından ayırt. Tıklama → kanala "girmez" (route metin gibi değil), **ses oturumuna katıl** akışı (E2).
- (Opsiyonel, küçük) guild create varsayılanına "Ses Kanalları" kategorisi — **DEFER edilebilir**; zorunlu değil. Çekirdek: tür çalışsın.

### E2. Sese katıl / ayrıl
- `livekit-client` (PM onaylı yeni dep — aşağıda). Ses kanalına tıkla → `POST .../voice/token` → `Room.connect(url, token)` → mikrofon publish (izin `canPublish` ise; değilse dinleyici, "karantinada konuşamazsın" ipucu).
- Aktif ses oturumu **kalıcı bar** (alt-sol/ServerRail yakını): bağlı kanal adı + **Ayrıl** + **kendini sustur (mute)** + bağlantı durumu. Kanal değiştirince oturum kopmaz (Discord deseni).
- Mikrofon izni reddi / bağlantı hatası → kullanıcıya Türkçe mesaj (sessiz başarısızlık yok).

### E3. Katılımcı listesi
- Ses kanalı seçilince katılımcılar: ilk yük `GET .../voice/participants`, sonra WS `voice.participant_joined/left` ile canlı. Konuşan vurgusu LiveKit `isSpeaking` (yeşil halka, client).
- Avatar daire (kullanıcı), token deseni; gölge yok.

### E4. i18n
- Tüm yeni metin `tr.json` (`voice.*`): katıl/ayrıl/sustur, "karantinada konuşamazsın", hata kodları (`VOICE_DISABLED`, `NOT_VOICE_CHANNEL`, mevcut `AGE_RESTRICTED`/`NOT_CHANNEL_MEMBER` zaten var). Gömülü string yok.

---

## F. Yeni bağımlılıklar (PM onaylı)

- **Backend:** `livekit-server-sdk` (token üretimi + `WebhookReceiver` + `RoomServiceClient`). LiveKit resmi.
- **Frontend:** `livekit-client` (Room/connect/publish). LiveKit resmi.
- Başka dep yok. (UI primitive mevcut Kv* + token'larla.)

---

## G. main.ts notu (webhook raw-body)
- `POST /voice/webhook` **ham gövde** ister (imza doğrulaması). NestJS `rawBody: true` (`NestFactory.create(AppModule, { rawBody: true })`) veya bu route'a özel `express.raw({ type: 'application/webhook+json' })` middleware. Global `ValidationPipe`/JSON parse bu route'u bozmamalı. R7 incelemesinde imza yolu doğrulanır.

---

## H. T&S / R7 özeti (incelemede aranacaklar)

- [ ] `requireChannelAccess` token mint'ten **önce** çağrılıyor; hata kodları sapmadan yayılıyor (yaş sızıntısı yok).
- [ ] Karantina (`joinedAt < quarantineHours`) → `canPublish=false`; `quarantineHours=0` kapalı.
- [ ] `canPublishSources` yalnız `microphone`; video/ekran grant'i **hiçbir yolda** açılmıyor.
- [ ] Webhook imza doğrulaması zorunlu; doğrulanmamış istek `VoiceSession` yazamaz.
- [ ] Hiçbir yerde ses kaydı/egress başlatılmıyor (kod `EgressClient` içermez).
- [ ] Secret loglanmıyor, yanıtta dönmüyor; yalnız `LIVEKIT_URL` public.

---

## I. DoD (Sprint V2 LiveKit)

- [ ] `GUILD_VOICE` enum + `VoiceSession` + **migration uygulandı** (`migrate status` temiz).
- [ ] `POST /channels/:id/voice/token`: erişim+yaş+karantina kapıları; audio-only grant; `503` env yok. **R7 geçti.**
- [ ] `POST /voice/webhook`: imza doğrulama; joined/left/finished → `VoiceSession` audit + WS yayını; idempotent. **R7 geçti.**
- [ ] `GET /channels/:id/voice/participants`: LiveKit room state'ten; erişim kapılı.
- [ ] Frontend: ses kanalı oluştur/gör; katıl/ayrıl/kendini-sustur kalıcı bar; katılımcı listesi canlı (WS); karantinada dinleyici modu + ipucu.
- [ ] İki kullanıcı uçtan uca sesli konuşur; biri ayrılınca presence düşer; minör `adultsOnly`/`ageGated` ses kanalına giremez.
- [ ] Ses kaydı yok; video/ekran/DM-ses yok (kapsam dışı doğrulandı).
- [ ] Tüm metin i18n; envelope tutarlı; Swagger üretiyor.
- [ ] Backend testleri yeşil (token kapıları + webhook idempotency + karantina dahil).

---

## J. Kapsam DIŞI (bu sprint yapma)

Video · ekran paylaşımı · DM/grup-DM sesi · ses kaydı/egress · force-mute/odadan-at moderasyon aksiyonları · ses-bağlam rapor snapshot'ı (ayrı T&S kalemi) · "Ses Kanalları" zorunlu varsayılan kategori (opsiyonel) · forum kanalı.
