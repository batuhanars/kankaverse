# SPRINT R11 — Ses Kanalı Moderasyonu (Sustur + Taşı) Sözleşmesi

> **Tek doğruluk kaynağı.** Endpoint imzası / DTO / enum / socket event adı buradan sapamaz.
> Kapsam: ses kanalında yetkili kullanıcının başka bir katılımcıyı **kalıcı susturması** (server-mute)
> ve **başka ses kanalına taşıması** (tam taşı). T&S: ses moderasyon yolu → backend enforcement **R7 incelemesi**.

## Kararlar (sahip onayı 2026-06-16)
- **Mute = KALICI.** `VoiceMute` kaydı + `mintToken` kontrolü → kullanıcı çıkıp tekrar katılsa da susturulmuş kalır.
- **Taşı = TAM.** Sunucu kaynak odadan çıkarır + hedef kullanıcıya socket event → istemci hedef kanala katılır.

## İzinler (mevcut flag'ler — yeni flag YOK)
- Sustur/aç: **`MUTE_MEMBERS`** (owner/ADMINISTRATOR örtük geçer — `hasGuildPermission`).
- Taşı: **`MOVE_MEMBERS`**.
- **Hedef kısıtı:** OWNER hedeflenemez; kendine uygulanamaz (self). (Rol hiyerarşisi ince ayarı V2'ye ertelendi —
  şimdilik yalnız owner + self bloğu.)

## Şema (migration ZORUNLU)
```prisma
model VoiceMute {
  id         String   @id @default(cuid())
  channelId  String
  userId     String
  guildId    String
  mutedById  String
  createdAt  DateTime @default(now())
  @@unique([channelId, userId])
  @@index([channelId])
}
```
Per-kanal mute. `npx prisma migrate dev --name add_voice_mute` (additive → veri kaybı yok). Prod: Railway `migrate deploy` otomatik.

## Endpoint'ler (voice modülü; envelope otomatik, `data: null`)

### 1. Sustur — `POST /voice/:channelId/mute/:userId`
- Envelope: `{ success, statusCode, data: null }`
- Yetki: `MUTE_MEMBERS` (kanalın guild'inde). Yetkisiz → 403 `FORBIDDEN`.
- Doğrulama: kanal `GUILD_VOICE` olmalı (değilse `NOT_VOICE_CHANNEL`); hedef OWNER ise 403 `CANNOT_MUTE_OWNER`; hedef = actor ise 400 `CANNOT_MUTE_SELF`.
- Etki: `VoiceMute` upsert (`channelId+userId`, `guildId`, `mutedById=actor`). LiveKit best-effort:
  `roomService.updateParticipant(channelId, userId, undefined, { canPublish: false, canSubscribe: true, canPublishData: false })`
  (katılımcı bağlı değilse / LiveKit yoksa sessiz geç — kayıt kalıcıdır, mintToken zorlar). Socket: room'a `voice.participant_muted { channelId, userId }`.

### 2. Susturmayı kaldır — `DELETE /voice/:channelId/mute/:userId`
- Yetki: `MUTE_MEMBERS`. Etki: `VoiceMute` sil. LiveKit best-effort `updateParticipant` ile `canPublish` **geri ver ama karantinaya saygı**: `canPublish = resolveCanPublish(userId, guildId)` (kör `true` DEĞİL). Socket: `voice.participant_unmuted { channelId, userId }`.

### 3. Taşı — `POST /voice/:channelId/move/:userId`  body `{ "targetChannelId": "..." }`
- Yetki: `MOVE_MEMBERS`. Doğrulama: kaynak + hedef ikisi de **aynı guild**'de `GUILD_VOICE`; hedef yoksa `CHANNEL_NOT_FOUND`; hedef `userLimit` doluysa 403 `CHANNEL_FULL` (R10 ile tutarlı; taşınan kullanıcı zaten katılımcı değilse sayılır); hedef = kaynak ise 400 `SAME_CHANNEL`; hedef kullanıcı OWNER ise `CANNOT_MOVE_OWNER`, self ise `CANNOT_MOVE_SELF`.
- Etki: `roomService.removeParticipant(channelId, userId)` (kaynaktan çıkar). Socket: **yalnız taşınan kullanıcıya** `voice.moved { fromChannelId, toChannelId }` (kitle değil — hedef user'a `emitToUsers`).

## mintToken entegrasyonu (kalıcı mute)
`mintToken` GUILD_VOICE dalında `canPublish` hesabı:
```
const muted = await this.isVoiceMuted(channelId, userId);   // VoiceMute kaydı var mı
canPublish = muted ? false : await resolveCanPublish(userId, channel.guildId);
```
→ Server-muted kullanıcı yeniden katılsa da konuşamaz (kalıcı). R10 limit kontrolü mevcut sırada kalır.

## Socket event'leri (server → client)
- `voice.participant_muted` `{ channelId, userId }` — room'a.
- `voice.participant_unmuted` `{ channelId, userId }` — room'a.
- `voice.moved` `{ fromChannelId, toChannelId }` — yalnız taşınan kullanıcıya.

## Frontend
- **voiceApi:** `mute(channelId, userId)`, `unmute(channelId, userId)`, `move(channelId, userId, targetChannelId)`.
- **voice store:** `serverMutedUserIds: Set<string>` — `voice.participant_muted/unmuted` ile güncellenir (self-mute/`mutedUserIds`'ten AYRI; moderatör susturması). `voice.moved` → mevcut sesten ayrıl + `join(toChannelId)` + o kanala yönlen + toast "Bir yetkili seni başka kanala taşıdı."
- **VoiceRoomView katılımcı kartı:** `MUTE_MEMBERS`/`MOVE_MEMBERS` olan kullanıcıya, kendi+owner DIŞINDAKİ katılımcıda bir aksiyon menüsü (hover ⋯ veya sağ-tık):
  - "Sustur" / "Susturmayı Kaldır" (`serverMutedUserIds`'e göre) — `MUTE_MEMBERS`.
  - "Taşı" → guild'in diğer `GUILD_VOICE` kanalları listesi → seç → `move` — `MOVE_MEMBERS`.
  - Server-muted göstergesi: kart üzerinde belirgin (kırmızı moderatör-mute ikonu; self-mute'tan görsel ayrışsın, en az mevcut mute ikonu reuse).
- Hata kodları → `toast.error` (backend Türkçe mesaj). `CHANNEL_FULL` taşıma'da da yakalanır.

## DoD
- `api`: build + `tsc --noEmit` + voice testleri + `prisma migrate status` temiz. **R7 incelemesi: mute/move yetki kapıları + mintToken mute-check + canPublish geri-verme (karantinaya saygı) satır satır.**
- `web`: `vue-tsc --noEmit` + `vite build` temiz.
