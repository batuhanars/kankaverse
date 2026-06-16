# SPRINT C1 — Kalıcı Bildirim Sistemi

> Durum: **TASARIM KİLİTLİ (2026-06-16).** PM compose. V3+ yol haritası Track C1.
> Sprint 6.3 oturum-içi bildirimi (volatile, friend.*/mention) → **kalıcı** modele yükseltir.
> **R7-hafif:** bildirim üretimi yalnız **zaten T&S-süzülmüş** tetikleyicilerden (resolveMentions çıktısı, friend event'leri) doğar → yeni erişim/sızıntı yolu YOK. PM bunu inceler.

---

## §0 — Kapsam ve Kararlar

**IN:**
- `Notification` Prisma modeli (kalıcı) + WS anlık teslim + ilk-bağlanışta snapshot.
- Bildirim türleri: **MENTION** · **FRIEND_REQUEST** · **FRIEND_ACCEPT**.
- REST: liste (cursor) + okundu (tümü/tekil) + okunmamış sayaç.
- Bell yeniden-kurgu: kalıcı veriyle, **tıkla → ilgili yere git/mesaja zıpla** (mevcut `useMessageJump`).

**OUT / ertelendi (sahip onayıyla eklenebilir):**
- **DM mesaj bildirimi** — mevcut unread rozeti yeterli; gürültü riski. (Sahip "ekle" derse türe eklenir.)
- **Web push** (tarayıcı bildirimi, sekme kapalı) — service worker + VAPID + izin akışı = ayrı büyük iş. C1 **yalnız uygulama-içi**.
- **Etkinlik hatırlatması (EVENT_REMINDER)** — **zaman-tabanlı → zamanlayıcı (job) gerektirir.** C1 substratı kurar; hatırlatma **ayrı küçük follow-up** (C1 üstüne `EVENT_REMINDER` türü + tek scheduler; bu sözleşmede YOK). `eventId` kolonu o turda additive eklenir.
- **FRIEND_REMOVE bildirimi** — **kasıtlı YOK (T&S):** arkadaşlıktan çıkarma/engelleme **sessizdir** (engellenen taraf "engellendin" görmez). WS `friend.remove` event'i liste-senkronu için kalır ama **Notification satırı ÜRETİLMEZ**.
- **Retention/temizlik** — MVP'de yok (kapalı önizleme düşük hacim); liste sorgusu cap'li (take 50). Borç → D-listesi (ileride read+eski temizlik, gerekirse job'suz create-anı cap).

> **Mevcut WS event'leri KORUNUR:** `mention` (kanal/guild `unreadMentionCount` rozetini sürür) ve `friend.request/accept/remove` (arkadaş listesi senkronu) **kaldırılmaz**. C1, bunlara **paralel** yeni bir `notification` event'i + kalıcılık ekler. Bell artık ham friend.*/mention yerine **`notification`** event'ini + REST + snapshot'ı tüketir (ayrışma temiz).

---

## §1 — Veri Modeli (Prisma)

```prisma
enum NotificationType {
  MENTION
  FRIEND_REQUEST
  FRIEND_ACCEPT
}

model Notification {
  id        String           @id @default(cuid())
  userId    String           // ALICI
  user      User             @relation("UserNotifications", fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType

  actorId   String?          // tetikleyen (mesaj yazarı / istek gönderen) — User
  actor     User?            @relation("NotificationActor", fields: [actorId], references: [id], onDelete: SetNull)

  guildId   String?          // mention bağlamı (navigasyon)
  channelId String?          // mention: zıplama hedefi kanal
  messageId String?          // mention: zıplama hedefi mesaj
  preview   String?          // mention metni anlık görüntüsü (≤120; mesaj sonradan silinse de kalır)

  readAt    DateTime?        // null = okunmamış
  createdAt DateTime         @default(now())

  @@index([userId, readAt])
  @@index([userId, createdAt])
}
```
`User`'a `notifications Notification[] @relation("UserNotifications")` + actor karşı-ilişki eklenir. **Migration additive, UYGULANIR** (`migrate status` temiz — DoD; prod Railway start-command'ı otomatik uygular). `eventId` EKLENMEZ (hatırlatma turunda additive gelir).

---

## §2 — Üretim (generation) — T&S-süzülmüş tetikleyicilerden

**Yeni `NotificationsService.create(userId, data)`:** Notification persist eder → `RealtimeService.emitToUser(userId, 'notification', dto)` → DTO döner. (persist SONRA emit.)

- **MENTION:** `messages.gateway.notifyMentions` içinde, mevcut `mention` emit'ine **paralel**: her `mentionedUserId` (resolveMentions çıktısı — **zaten minör/yaş/erişim süzülü**) için `create({ userId: mentionedUserId, type: MENTION, actorId: author.id, guildId, channelId, messageId, preview })`. `author === mentioned` atlanır (mevcut kural). **Yeni erişim sorgusu YOK** — resolveMentions çıktısı kaynak.
- **FRIEND_REQUEST:** `friends.service` istek oluşturma, mevcut `friend.request` emit'ine paralel: `create({ userId: target.id, type: FRIEND_REQUEST, actorId: requester.id })`.
- **FRIEND_ACCEPT:** kabul, mevcut `friend.accept` emit'ine paralel: `create({ userId: requester.id, type: FRIEND_ACCEPT, actorId: accepter.id })`.
- **FRIEND_REMOVE / block:** Notification ÜRETİLMEZ (§0 — sessiz T&S). `friend.remove` WS aynen kalır.

> Emit'ler ilgili transaction/işlem SONRASI (mevcut emit deseniyle aynı yerde). NotificationsService `friends.service` ve `messages.gateway`'e inject edilir (SharedModule export ya da NotificationsModule import).

---

## §3 — Teslim (WS)

- **Anlık:** `notification` event → `user:<userId>` (NotificationDto §5).
- **Snapshot:** handshake'te (`messages.gateway.handleConnection`, presence:snapshot deseninin yanında) → `notification:snapshot` `{ notifications: NotificationDto[], unreadCount }` — son **okunmamış**lar (take 50, createdAt desc) + toplam okunmamış sayısı.
- Mevcut `mention`/`friend.*` event'leri **değişmez** (başka tüketicileri var).

---

## §4 — REST Endpoint'leri

| Method | Path | Açıklama |
|---|---|---|
| GET | `/notifications?cursor=&limit=` | Kullanıcının bildirimleri, `createdAt` azalan, cursor sayfalama (limit ≤50). → `NotificationDto[]` (+ nextCursor) |
| GET | `/notifications/unread-count` | Okunmamış sayısı. → `{ count }` |
| POST | `/notifications/read` | Tümünü okundu işaretle (`readAt=now` where readAt null). → `{ count }` |
| POST | `/notifications/:id/read` | Tek bildirimi okundu (sahiplik kontrolü; başkasınınki → 404). → `NotificationDto` |

Hepsi `JwtAuthGuard`. Yalnız çağıranın kendi bildirimleri (userId eşleşmesi; aksi 404 jenerik). Envelope standart.

---

## §5 — NotificationDto

```jsonc
{
  "id",
  "type",                       // MENTION | FRIEND_REQUEST | FRIEND_ACCEPT
  "actor": { "id", "username", "avatarUrl" } | null,  // read-time User join (taze)
  "guildId", "channelId", "messageId",                // mention navigasyonu (diğerlerinde null)
  "preview",                                          // mention metni (diğerlerinde null)
  "readAt",                                           // null = okunmamış
  "createdAt"
}
```
`actor` okuma anında `User`'dan çözülür (denormalize değil → avatar/ad taze). Silinen actor → null (SetNull).

---

## §6 — Frontend (`web/`)

**Store `stores/notifications.ts` (yeniden-kurgu — kalıcı destekli):**
- `items: NotificationDto[]`, `unreadCount` (readAt null sayısı ya da snapshot count).
- `loadInitial()` — `notification:snapshot` WS'inden doldur (ya da gerekirse REST `GET /notifications`). 
- `handleIncoming(dto)` — `notification` WS event'i → başa ekle + unread artır.
- `loadMore()` — REST cursor sayfalama (panel scroll).
- `markAllRead()` — `POST /notifications/read` → tümü readAt set, badge sıfır.
- `markRead(id)` — tıklamada `POST /notifications/:id/read`.
- **Mevcut volatile friend.*/mention biriktirme KALDIRILIR** → bell artık `notification` event'i + snapshot'tan beslenir. (friends store hâlâ `friend.*` dinler — o ayrı.)

**`NotificationBell.vue` (yeniden-kurgu):**
- `useSocket` → `notification` + `notification:snapshot` dinle (mevcut presence/friend dinleme deseni).
- Panel: kalıcı liste (okundu/okunmamış görsel ayrım), scroll → `loadMore`. Açınca `markAllRead` (mevcut davranış korunur).
- **Tıkla → navigasyon (YENİ):**
  - MENTION → kanal/DM'e git + `useMessageJump.requestJump(channelId, messageId)` (mesaja zıpla+vurgula). + `markRead(id)`.
  - FRIEND_REQUEST → arkadaş istekleri görünümü. FRIEND_ACCEPT → arkadaşlar/DM. + `markRead(id)`.
- Türk yereli zaman ("5 dk önce" / mevcut tarih util'i), Kor aksan unread, `--kv-*` token.

**i18n:** `notification.mention` ("{actor} seni etiketledi"), `notification.friendRequest` ("{actor} sana kanka isteği gönderdi"), `notification.friendAccept` ("{actor} isteğini kabul etti"), `notification.empty`, `notification.markAllRead` vb. `tr.json`. Gömülü string yok.

---

## §7 — Trust & Safety (R7-hafif)

- **Yeni erişim kararı YOK.** Bildirim yalnız mevcut süzülmüş tetikleyicilerden doğar: MENTION = `resolveMentions` çıktısı (minör/ageGated/adultsOnly/erişim zaten elenmiş → minör 18+ kanalda mention bildirimi ALMAZ); FRIEND_* = mevcut addressee/requester hedefleri.
- **FRIEND_REMOVE/block → Notification YOK** (sessizlik korunur; engellenen "engellendin" görmez).
- `actor` yalnız public alanlar (username/avatar). `preview` = mention edilen kullanıcının zaten erişebildiği kanaldaki mesaj (geçerli mention şartı). Sızıntı yok.
- REST'te yalnız çağıranın kendi bildirimleri; başkasının id'si → jenerik 404.
- **PM inceleme noktası:** üretim noktalarının resolveMentions/friend-hedef süzmesini aynen miras aldığı + friend_remove'un üretmediği.

---

## §8 — DoD

- [ ] `Notification` model + enum + `User` ilişki + migration (additive, **uygulandı**, `migrate status` temiz)
- [ ] `NotificationsService` (create/list-cursor/markAll/markOne/unreadCount) + controller (§4) + modül
- [ ] Üretim: MENTION (notifyMentions paralel, resolveMentions çıktısı) · FRIEND_REQUEST/ACCEPT (friends.service paralel) · **FRIEND_REMOVE üretmez**
- [ ] WS `notification` anlık + handshake `notification:snapshot` (unread, take 50); mevcut `mention`/`friend.*` event'leri DEĞİŞMEDİ
- [ ] Frontend store kalıcı-destekli yeniden-kurgu + bell navigasyon/zıplama + i18n; tab yenilemede bildirimler durur (kalıcı)
- [ ] `nest build` + `vue-tsc` + `vite build` temiz; birim test (create+emit, markAll/markOne sahiplik, unread sayım, mention üretim resolveMentions süzmesini miras, friend_remove üretmez)
- [ ] **R7-hafif:** PM inceler (üretim süzülmüş tetikleyicilerden, friend_remove sessiz, sızıntı yok)
- [ ] Sahip canlı test: 2 hesap — mention at → diğerinde bell + tıkla mesaja zıpla; kanka isteği → bell; yenile → durur; minör 18+ kanal mention'ı almaz

---

## §9 — Sapma Kuralı

Endpoint/DTO/enum/şema sapması → dev DURUR, PM'e döner. **Zaman-tabanlı job ekleme ihtiyacı (hatırlatma) → bu sözleşmenin DIŞI** (ayrı follow-up). **Yeni bildirim türü/erişim yolu eklemek** (DM mesaj, web push, friend_remove) → PM+sahip kararı; bu sözleşme MENTION+FRIEND_REQUEST+FRIEND_ACCEPT ile sınırlı.
