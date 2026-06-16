# SPRINT R12 — Bildirim Tercihleri (Sustur + Seviye) Sözleşmesi

> **Tek doğruluk kaynağı.** Sahip kararı: tam kapsam — sunucu + kanal bazında **sustur** + **bildirim seviyesi**
> (Tümü / Yalnız bahsetmeler / Hiçbiri). Discord deseni. Kaynak: Revizeler-3 (Görsel #1 "Sunucuyu Sustur" +
> "Bildirim Ayarları"; Görsel #8 "Kanalı Sustur"). T&S DEĞİL (bildirim tercihi; R7 gerekmez).

## Veri modeli (api/prisma — migration ZORUNLU)
```prisma
enum NotificationLevel { ALL MENTIONS NONE }
enum NotifTargetType   { GUILD CHANNEL }

model NotificationPref {
  id         String            @id @default(cuid())
  userId     String
  user       User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  targetType NotifTargetType
  targetId   String            // GUILD → guildId, CHANNEL → channelId
  muted      Boolean           @default(false)
  level      NotificationLevel @default(ALL)
  updatedAt  DateTime          @updatedAt
  @@unique([userId, targetType, targetId])
  @@index([userId])
}
```
`User`'a ters relation ekle. Nullable-unique tuzağından kaçınmak için `targetType+targetId` deseni (iki ayrı tablo değil).

## Endpoint'ler (envelope otomatik)
Yeni controller (`notifications` modülü altında, `@UseGuards(JwtAuthGuard)`):

### `GET /notifications/prefs` → `NotificationPrefDto[]`
Kullanıcının TÜM tercih kayıtları (varsayılandan sapanlar). Frontend store'a hidrasyon. Boş olabilir.
`NotificationPrefDto = { targetType, targetId, muted, level }`.

### `PUT /notifications/prefs`  body `{ targetType, targetId, muted?, level? }` → `NotificationPrefDto`
- DTO: `targetType` ∈ {GUILD,CHANNEL} (`@IsEnum`), `targetId` (`@IsString @IsNotEmpty`), `muted?` (`@IsBoolean @IsOptional`), `level?` (`@IsEnum(NotificationLevel) @IsOptional`).
- **Hafif erişim kontrolü:** GUILD → kullanıcı o guild üyesi; CHANNEL → `requireChannelAccess` (mevcut helper). Değilse 403/404 (sızıntı yok).
- Upsert (`@@unique`). Verilmeyen alan korunur (kısmi update). Hem `muted=false` hem `level=ALL` ise kaydı **silmek** opsiyonel (varsayılan = kayıt yok); ama upsert tutmak da kabul — basit tut.

## Suppression — mention bildirimi üretimi
Tek entegrasyon noktası: mention-notification üretildiği yer (`messages.gateway.ts`, `notificationsService.create` çağrısı). Üretmeden ÖNCE etkin tercihi çöz:
- Helper `NotificationsService.shouldNotifyChannel(userId, guildId, channelId): Promise<boolean>`:
  - Kanal tercihi VARSA onu kullan; yoksa guild tercihine düş; o da yoksa varsayılan (muted=false, level=ALL).
  - **Etkin `muted === true` → false** (bildirim yok). **Etkin `level === 'NONE'` → false.** Aksi (ALL/MENTIONS) → true. *(Mevcut bildirimlerimiz zaten yalnız mention → ALL ve MENTIONS bu noktada eşdeğer; ayrım badge'de.)*
- `shouldNotifyChannel` false → `create` çağrılmaz (ne persist ne emit). DM/friend bildirimleri guild/kanal-kapsamlı DEĞİL → etkilenmez.

## Frontend (Wave 2 — bağlama)
- **API:** `notificationsApi.getPrefs()`, `notificationsApi.setPref({targetType,targetId,muted?,level?})`.
- **Store** `notificationPrefs`: load'da `getPrefs` → Map(`${type}:${id}` → pref). Getter'lar: `isMuted(type,id)`, `effectiveLevel(type,id)` (kanal→guild→varsayılan), `prefFor(type,id)`. Action `setPref(...)` → PUT + optimistik Map güncelle.
- **Bağlandığı menüler (Wave 2):** ortam sağ-tık + kanal sağ-tık menülerinde "Sunucuyu/Kanalı Sustur" toggle + "Bildirim Ayarları" alt-menü (Tümü/Yalnız bahsetmeler/Hiçbiri). Etkin değere göre işaretli.
- **Badge:** okunmamış rozet gösterimi muted guild/kanalda gizlenir; `level==='MENTIONS'` → rozet yalnız bahsetmede; `NONE` → rozet yok. (Frontend, prefs store ile süzer — backend rozet hesabı yoksa client-side mevcut okunmamış mantığına filtre.)

## DoD
- api: build + tsc + test + `prisma migrate status` temiz. Mention bildirim testi: muted/NONE → create çağrılmaz.
- web: vue-tsc + vite build temiz.
