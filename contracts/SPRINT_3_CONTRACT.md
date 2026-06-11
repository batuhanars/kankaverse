# Sprint 3 Contract — DM + Arkadaşlık + Engelleme + Merkezi DM Karar Fonksiyonu

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli.
>
> **R7 — `DmPermissionService` (DM karar fonksiyonu) + DM erişim kontrolü T&S karar fonksiyonudur; satır satır
> insan incelemesi zorunlu.** Hata bedeli çocuk güvenliği (brief §5.1 + **§5.1.b yaş güvencesi**, §13 #2). Diğer CRUD kısımları standart inceleme.
>
> **Kapsam (scope turu kararları, 2026-06-11):** arkadaş **kodu** ile ekleme (username keşif yüzeyi DEĞİL);
> **yalnız 1-1 DM** (grup DM sonraki sprint'e). Karantina kontrolü = no-op hook (Sprint 7).

---

## 1. Hedef

V1'in sosyal katmanı + çocuk güvenliğinin kalbi:
1. **Arkadaşlık** — kodla istek gönder/kabul/reddet/sil (PENDING/ACCEPTED/DECLINED).
2. **Engelleme (UserBlock)** — engelle → DM kesilir, arkadaşlık bozulur, bekleyen istekler iptal.
3. **1-1 DM** — `Channel(type=DM)` + `ChannelMember`; mevcut mesaj/WS altyapısı yeniden kullanılır.
4. **🫀 `DmPermissionService.canDm(sender, target)`** — `blok + arkadaşlık + isMinor + dmPolicy + ortak sunucu`
   tek noktada (brief §13 #2). Tek T&S doğruluk noktası (denetim #2 dersi: tekrar etme).

**Kapsam dışı:** grup DM, mesaj arama, presence/typing (Sprint 6), yeni-üye karantinası (Sprint 7).

---

## 2. Prisma Modelleri (Sprint 3 deltası)

```prisma
model User {
  // ... mevcut alanlar değişmez ...
  friendCode          String          @unique  // tahmin edilemez; TEK arkadaş-lookup yolu (username DEĞİL)
  friendshipsSent     Friendship[]    @relation("FriendRequester")
  friendshipsReceived Friendship[]    @relation("FriendAddressee")
  blocksMade          UserBlock[]     @relation("Blocker")
  blocksReceived      UserBlock[]     @relation("Blocked")
  channelMemberships  ChannelMember[]
}

model Friendship {
  id          String           @id @default(cuid())
  requesterId String
  requester   User             @relation("FriendRequester", fields: [requesterId], references: [id])
  addresseeId String
  addressee   User             @relation("FriendAddressee", fields: [addresseeId], references: [id])
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  @@unique([requesterId, addresseeId])
  @@index([addresseeId, status])
}

enum FriendshipStatus { PENDING ACCEPTED DECLINED }

model UserBlock {
  id        String   @id @default(cuid())
  blockerId String
  blocker   User     @relation("Blocker", fields: [blockerId], references: [id])
  blockedId String
  blocked   User     @relation("Blocked", fields: [blockedId], references: [id])
  createdAt DateTime @default(now())
  @@unique([blockerId, blockedId])
  @@index([blockedId])
}

model ChannelMember {
  id         String    @id @default(cuid())
  channelId  String
  channel    Channel   @relation(fields: [channelId], references: [id])
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  lastReadAt DateTime?
  createdAt  DateTime  @default(now())
  @@unique([channelId, userId])
  @@index([userId])
}
```

> `Channel` zaten var (`type=DM`, `guildId=null`). `Channel`'a `members ChannelMember[]` ilişkisi eklenir.
> **`friendCode` register'da üretilir** (R7: register değişir, additive yan etki). Format: 8 karakter base32
> (örn. `K7M2QX9F`), çakışmada yeniden üret. Mevcut kullanıcılara migration backfill.

---

## 3. 🫀 DmPermissionService.canDm — KARAR MATRİSİ (R7, brief §5.1 + §5.1.b)

`canDm(senderId, targetId): { allowed: boolean; reason?: string }` — **sırayla**:

1. `senderId === targetId` → **deny** (`CANNOT_DM_SELF`).
2. **Blok** (her iki yönde de `UserBlock`) → **deny** (`BLOCKED`).
3. **Arkadaş** (aralarında `Friendship.ACCEPTED`) → **allow.** (Arkadaşlık her şeyi geçersiz kılar — blok hariç; minor + arkadaş = izin.)
4. Arkadaş değil:
   - **a.** sender VEYA target `isMinor` → **deny** (`DM_NOT_ALLOWED`). *Reşit olmayan yalnız arkadaşlarıyla; yabancı cold-DM kapalı.*
   - **b.** sender VEYA target **YENİ HESAP** (`createdAt` < `NEW_ACCOUNT_DM_LOCK` eşiği, config) → **deny** (`DM_NOT_ALLOWED`).
     *§5.1.b: HER yeni hesap, beyan yaşından BAĞIMSIZ, muhafazakâr başlar — yabancıdan DM kapalı. Yeni alıcıyı korur (yaşını
     yalanlamış olabilir) + kötü niyetli yetişkinin yeni hesapla hızlı avını engeller. Kısıt hesap yaşıyla otomatik gevşer.*
   - **c.** İkisi de yetişkin + **yerleşik** (yeni değil), arkadaş değil → target `dmPolicy`:
     `EVERYONE` → **allow** · `FRIENDS` → **ortak sunucu varsa allow** · `NONE` → **deny** (`DM_NOT_ALLOWED`).
5. **Hook'lar — yapı kurulu, davranış ait olduğu sprint'te (§5.1.b):**
   - **Güven seviyesi:** fonksiyon `verificationStatus` okur; *doğrulanmış yetişkin* gevşemesi/ayrıcalığı **e-Devlet (Sprint 8)** ile.
     Şimdi herkes "beyan edilmiş" → ek davranış yok, ama okuma noktası kurulu.
   - **Davranışsal koruma** ("muhtemel reşit değil" → koruyucu mod) → **Sprint 4+** (tespit/AI tier). No-op.
   - **Topluluk report'u** ("yaşı küçük" kategorisi) → **Sprint 4** (Report). No-op.
   - **Karantina** (yeni-üye) → **Sprint 7**. No-op.

> **Kapı yeri:** Tam `canDm` yalnız **DM başlatmada** (kanal oluşturma). Açık kanalda gönderim = `ChannelMember` +
> **aktif blok yok** (blok sonradan konuşmayı keser). `canDm` yönlü (başlatan = sender). `NEW_ACCOUNT_DM_LOCK` eşiği config'den (§4).
> Not: bu fonksiyon **tek T&S DM otoritesi** — frontend yalnız UX gating yapar, karar burada.

---

## 4. Sabitler

- `friendCode`: 8 karakter base32 (40-bit), karışık-harf hariç (RFC4648). Yeniden üretilebilir (anti-spam).
- **`NEW_ACCOUNT_DM_LOCK`: 7 gün (config — gelir-model deseni gibi DB/env'den ayarlanır, kod değil).** Bu süreden
  genç hesap "yeni" sayılır; canDm §4b'de yabancı DM kapalı. Davranış/doğrulamayla erken gevşeme ileride (§5.1.b hook).
- Rate limit: `POST /friends/requests` 20/saat, `POST /dm/channels` 30/saat, `POST /blocks` 30/saat.
- DM mesaj sayfalama: mevcut (cursor `before`, 50).

---

## 5. DTO Şekilleri (paylaşılan)

```typescript
interface FriendCodeUserDto { id: string; username: string; avatarUrl: string | null; }  // minimal, keşif değil
interface FriendDto { friendshipId: string; user: FriendCodeUserDto; since: string; }
interface FriendRequestDto {
  id: string; direction: 'incoming' | 'outgoing'; user: FriendCodeUserDto; createdAt: string;
}
interface BlockedUserDto { user: FriendCodeUserDto; since: string; }
interface DmChannelDto {
  id: string; otherUser: FriendCodeUserDto; lastMessage: MessageDto | null; unread: boolean;
}
// UserDto'ya EK: friendCode (kendi kodunu görüp paylaşsın)
interface UserDto { /* ... mevcut ... */ friendCode: string; }
```

---

## 6. HTTP Endpoint İmzaları

> Envelope `{ success, statusCode, data }`. Tümü (auth). DM mesaj uçları **mevcut** `/channels/:id/messages` ile.

### Arkadaşlık (`/friends`)
- **GET `/friends`** → `200 { data: FriendDto[] }` (ACCEPTED).
- **GET `/friends/requests`** → `200 { data: FriendRequestDto[] }` (incoming + outgoing PENDING).
- **POST `/friends/requests`** — Body `{ friendCode }` → kodla kullanıcı bul; **kontroller:** kod yok → `404 USER_NOT_FOUND`;
  kendine → `400 CANNOT_FRIEND_SELF`; blok varsa → `403 BLOCKED`; zaten arkadaş/bekleyen istek → `409 ALREADY_FRIENDS`/`REQUEST_EXISTS`.
  Karşı taraftan bekleyen istek varsa → **otomatik ACCEPTED** (karşılıklı). → `201 { data: FriendRequestDto | FriendDto }`.
- **POST `/friends/requests/:id/accept`** — (addressee) → `200 { data: FriendDto }`. Yetki: yalnız addressee.
- **POST `/friends/requests/:id/decline`** — (addressee) → `200 { data: null }` (status DECLINED).
- **DELETE `/friends/:userId`** — arkadaşlığı sil → `200 { data: null }`.

### Engelleme (`/blocks`)
- **GET `/blocks`** → `200 { data: BlockedUserDto[] }`.
- **POST `/blocks`** — Body `{ userId }` → `UserBlock` oluştur + **yan etki (transaction):** mevcut arkadaşlık sil +
  bekleyen istekleri iptal. → `201 { data: null }`. Kendini → `400 CANNOT_BLOCK_SELF`.
- **DELETE `/blocks/:userId`** — engeli kaldır → `200 { data: null }`.

### DM (`/dm`)
- **GET `/dm/channels`** → `200 { data: DmChannelDto[] }` (kullanıcının DM kanalları, son mesaj + unread; `lastReadAt`'e göre).
- **POST `/dm/channels`** — Body `{ userId }` → **`canDm(me, userId)` uygula**; izinliyse mevcut DM kanalını döndür ya da
  oluştur (`Channel(DM)` + 2 `ChannelMember`, transaction). → `201/200 { data: DmChannelDto }`.
  Reddedilirse `canDm.reason` koduyla `403` (`BLOCKED`/`DM_NOT_ALLOWED`/`CANNOT_DM_SELF`).
- **POST `/dm/channels/:id/read`** — `lastReadAt = now` (okundu işaretle) → `200 { data: null }`.
- DM mesaj geçmişi/gönderme → **mevcut** `GET/POST /channels/:id/messages` (bkz. §7).

---

## 7. MembershipService Genişletme + Mesaj Erişimi (R7 — güvenlik açığı kapanışı)

> **Mevcut açık:** `MembershipService.requireChannelAccess` `guildId` null (DM) kanallarda üyelik kontrolü
> ATLIYORDU (Sprint 1/2'de DM yoktu). DM gelince **kanal ID'sini bilen herkes DM okuyabilir/yazabilir** → bu sprint kapatır.

- `requireChannelAccess(userId, channelId)`: kanal `guildId` null (DM) ise → **`ChannelMember` kontrolü** (üye değilse
  `403 NOT_CHANNEL_MEMBER`). guild kanalında eski davranış (guild üyeliği).
- **DM mesaj GÖNDERME** ek kontrol: DM kanalında karşı tarafla **aktif blok varsa** `403 BLOCKED` (blok sonradan konuşmayı keser).
- Bu değişiklik `messages.service` + `messages.gateway`'i de etkiler (ikisi de `requireChannelAccess` kullanıyor — tek nokta).

---

## 8. WebSocket

- DM kanalı = room (`room:<channelId>`). `channel:join` mevcut akış; `requireChannelAccess` artık DM `ChannelMember`'ı doğrular.
- `message.created` DM room'una yayılır (mevcut REST-yazar-WS-yayar + istemci yerel eko deseni korunur).
- Yeni event YOK (arkadaş isteği/DM bildirimleri için real-time push Sprint 6 presence/bildirim kapsamı; şimdilik liste yenilemeyle).

---

## 9. UI Yerleşim (web)

- **Home (arkadaş/DM ekranı)** — rail'deki **marka hexagon'una tıklayınca** açılır (Sprint 1'de hazırladığımız giriş noktası):
  - Geniş sidebar: **DM listesi** (son mesaj + unread rozeti), üstte "Arkadaşlar" sekmesi.
  - Arkadaşlar görünümü: liste + bekleyen istekler + **"Arkadaş Ekle" (kod gir)** + **kendi kodunu göster/kopyala** (`useClipboard`).
  - Engellenenler yönetimi (ayarlar veya home alt sekmesi).
- **DM görünümü:** mesaj alanı mevcut bileşenlerle (guild kanalıyla aynı); başlıkta karşı kullanıcı.
- Engelle/arkadaşlıktan çıkar: kullanıcı bağlam menüsü (ConfirmDialog).
- Tüm metin `i18n/tr.json`; yeni hata kodları map'e.

---

## 10. Hata Kodları — Sprint 3 ekleri

`USER_NOT_FOUND` (404), `CANNOT_FRIEND_SELF` (400), `CANNOT_BLOCK_SELF` (400), `CANNOT_DM_SELF` (400),
`ALREADY_FRIENDS` (409), `REQUEST_EXISTS` (409), `BLOCKED` (403), `DM_NOT_ALLOWED` (403). Mevcut `NOT_CHANNEL_MEMBER` korunur.

---

## 11. DoD & Açık Sorular

**DoD (Sprint 3):**
- [ ] Arkadaş kodu register'da üretiliyor; kullanıcı kendi kodunu görüyor; username ile arama YOK.
- [ ] Kod ile istek gönder → kabul → arkadaş; karşılıklı istek otomatik kabul.
- [ ] Engelle: arkadaşlık bozulur + bekleyen istekler iptal + DM kesilir.
- [ ] **`canDm` matrisi (§3) birebir:** blok yener; **minor ↔ yabancı DM kapalı**; **yeni hesap → yabancı DM kapalı (§5.1.b)**; arkadaş izinli; dmPolicy doğru kapılar.
- [ ] canDm `verificationStatus` okuma noktası kurulu (doğrulanmış-yol Sprint 8'e boş); davranış/report/karantina no-op hook.
- [ ] **DM erişim açığı kapandı:** ChannelMember olmayan DM kanalına erişemez (REST + WS).
- [ ] DM gönder/al gerçek zamanlı (mevcut gateway); unread `lastReadAt` ile.
- [ ] Blok sonradan DM gönderimini keser.
- [ ] **R7:** `DmPermissionService` + `requireChannelAccess` DM kontrolü satır satır kullanıcı incelemesinden geçti.

**Açık sorular:**
- [ ] `friendCode` yeniden-üretme endpoint'i bu sprint mi, sonraki mi? (öneri: bu sprint, küçük — anti-spam değeri yüksek)
- [ ] DM'de minor↔minor (iki reşit olmayan arkadaş) izinli — teyit (brief §5.1 "kendi iradesiyle kurduğu ilişki" ile uyumlu).
- [ ] `dmPolicy=FRIENDS`'te "ortak sunucu" istisnası V1 cut'ı — onay (alternatif: FRIENDS = sadece arkadaş, ortak sunucu yok).

---

## 12. Bağımsızlık & Bağımlılık

- **Yeni runtime bağımlılığı YOK** (friendCode = crypto, zaten var). Migration additive + `friendCode` backfill.
- Backend/frontend §3,5,6 sözleşmesinden paralel. `canDm` matrisi (§3) ikisinin de referansı (frontend UX gating, backend otorite).
