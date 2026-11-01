# SPRINT C46: Tepkiler: kişi başı tek tepki, çift dokunma, kimler tepki verdi, tepki bildirimi

> Durum: **TASARIM KİLİTLİ (2026-11-01).** PM compose (Opus). Sahip isteği.
> **api + web + mobil.** Mobil vc45. R7: yalnız §4 (bildirim alıcı süzgeci: engel + sessize alma) PM satır incelemesi, merge sahipte.
> Ön düzeltme canlı (5325930): tepki olayı yalnız durum gerçekten değişince yayınlanır.

## §0 Kararlar (sahip, 2026-11-01)
1. **Kişi başı mesaj başına TEK tepki** (WhatsApp/Instagram modeli). Farklı emoji seçmek eskisinin YERİNE geçer.
   Farklı kişilerin farklı emojileri yan yana pil olarak durur (❤️ 2 · 👍 1).
2. Mobilde mesaja **çift dokunma** = kişinin hızlı tepki listesindeki **ilk emoji**. Yalnız EKLER: kişinin bu mesajda
   zaten herhangi bir tepkisi varsa hiçbir şey olmaz (yanlışlıkla değiştirme/silme yok).
3. **Kimler tepki verdi:** web ipucu + pencere, mobil alt panel; emoji sekmeleri + kaydırmalı kişi listesi.
4. **Tepki bildirimi** mesaj sahibine: DM → yalnız push + masaüstü bildirimi (çan kaydı yok, mevcut DM kuralı);
   ortam → push + çan kaydı + masaüstü bildirimi. Kullanıcı ayarında açma/kapama anahtarı (varsayılan açık).

## §1 Veri (api)
1. `MessageReaction` tekil anahtarı `(messageId, userId, emoji)` → **`(messageId, userId)`**.
2. Migration önce çiftleri temizler: her `(messageId, userId)` için **en son `createdAt`** satırı kalır, diğerleri silinir;
   sonra eski unique index düşer, yeni unique index kurulur. Tek migration, SQL elle yazılır (Prisma çift varken index kuramaz).
3. `User.reactionNotifications Boolean @default(true)`.
4. `NotificationType` enum'una `REACTION`. `Notification.preview` = emoji + " " + mesaj önizlemesi (≤120, mevcut kırpma yardımcısı).
5. 🔴 DoD: `prisma migrate status` canlıda temiz (deploy işi `migrate deploy` çalıştırıyor, teyit et) + `prisma generate`
   sonrası `tsc -p tsconfig.build.json`.

## §2 Tepki ekleme / kaldırma (api)
1. `POST /channels/:id/messages/:messageId/reactions` `{ emoji }` imzası DEĞİŞMEZ. Davranış (tek transaction):
   - Kişinin bu mesajda aynı emojisi var → değişiklik yok, yayın yok.
   - Başka emojisi var → eskisi silinir, yenisi eklenir; yayın sırası `reaction.removed` (eski) sonra `reaction.added` (yeni).
   - Hiç yok → eklenir, `reaction.added`.
   - Yarış (P2002) → bir kez yeniden dene, yine olmazsa değişiklik yok say.
2. `DELETE .../reactions/:emoji` aynı (yalnız gerçekten silinince yayın, mevcut).
3. Mevcut WS olay adları ve payload'ları DEĞİŞMEZ: eski istemciler (vc44 ve öncesi) kaldır+ekle çiftini doğru sayar.
4. Servis dönüşü: `{ removed: string | null; added: string | null }`; controller yayını buna göre yapar, bildirimi (§4) `added` doluysa tetikler.

## §3 Kimler tepki verdi (api)
1. `GET /channels/:id/messages/:messageId/reactions` → envelope `data`:
   ```jsonc
   [ { "emoji": "❤️", "count": 2,
       "users": [ { "id": "...", "username": "ali", "avatarUrl": "..." } ] } ]
   ```
   Gruplar ilk tepki zamanına göre, kişiler `createdAt` artan. Mesaj başına en fazla 200 satır okunur (fazlası `count`ta görünür, listede yok).
2. Erişim: `requireChannelAccess` (mesajı görebilen listeyi görür; yeni ifşa yok). Silinmiş mesaj 404 `MESSAGE_NOT_FOUND`.
3. Kullanıcı alanları mevcut kullanıcı özet DTO'sundan (yeni şekil uydurma; varsa `displayName` de gelir).

## §4 Tepki bildirimi (api) 🔴 R7
1. Tetik: §2'de `added` dolu. Alıcı = mesaj yazarı. Şunlardan biri doğruysa **bildirim yok**:
   - yazar = tepki veren; yazar yok/silinmiş; webhook mesajı;
   - yazarın kanala erişimi kalmamış (ortamdan ayrılmış/atılmış, DM/grup üyesi değil). Mevcut üyelik kontrolü kullanılır, yeni kontrol yazılmaz;
   - `author.reactionNotifications === false`;
   - iki yönlü herhangi bir engel (yazar ↔ tepki veren);
   - ortam kanalında `shouldNotifyChannel(author, guildId, channelId) === false` (sessize alma / NONE);
     DM'de mevcut DM push süzgecinin aynısı (DM sessize alma). Yeni süzgeç YAZILMAZ, mevcut olanlar çağrılır.
   - **tekrar süzgeci:** Redis `SET rxn:notif:{messageId}:{actorId} NX EX 86400` başarısızsa (aynı kişi aynı mesaj için 24 saatte
     bildirim üretmiş) → yok. Koy/kaldır/değiştir döngüsü tek bildirim.
2. Ortam: `NotificationsService.create(author, { type: REACTION, actorId, guildId, channelId, messageId, preview })` (push + WS
   `notification` mevcut yol). Push gövdesi: `"{actor} mesajına {emoji} bıraktı: {önizleme}"`, önizleme yoksa `"{actor} mesajına {emoji} bıraktı."`
   `tag` VERİLMEZ.
3. DM: çan kaydı YOK. Push doğrudan `PushService.sendToUsers` (aynı gövde, `data.type = 'REACTION'`, `channelId`, `messageId`,
   kanal `messages_v6`) + WS `user:<authorId>` odasına `reaction.notify` `{ actor: {id, username, avatarUrl}, emoji, channelId, messageId, preview }`.
4. Bildirim hatası tepki isteğini ASLA düşürmez (fire-and-forget, mevcut desen).
5. `PATCH /users/me` (mevcut profil/ayar ucu) `reactionNotifications?: boolean` kabul eder; `UserDto`'da döner.
6. Testler: kendi mesajı yok, engel yok, kapalı ayar yok, sessiz kanal yok, tekrar süzgeci, değiştirmede ikinci bildirim yok,
   DM'de çan kaydı yok, ortamda var.

## §5 Web
1. Mevcut tepki akışı: başkasının pili → `add` (sunucu benimkini değiştirir); kendi pilim → `remove`; menü/seçici → `add`.
   İstemci ek mantık gerektirmez; WS olayları sayacı yönetir. Seçicide kişinin mevcut emojisi vurgulu.
2. **İpucu:** pilin üzerine gelince (300 ms gecikme) `GET reactions` (mesaj başına önbellek; o mesaja tepki olayı gelince önbellek düşer)
   → "Ali, Ayşe ve 3 kişi daha" (ilk 3 isim). i18n.
3. **"Tepkileri gör"** mesaj menüsünde (yalnız tepki varsa) → `KvModal`: üstte emoji sekmeleri ("Tümü" + her emoji ve sayısı),
   altta avatar + ad kaydırmalı liste; kişiye tıklayınca mevcut kullanıcı kartı. Dar ekranda tam genişlik (390/320 ölç).
4. Masaüstü bildirimi: `useNativeNotifications` `REACTION` türünü (WS `notification`) ve `reaction.notify` olayını işler;
   metin `notification.reaction`. Tıklayınca mesaja zıplar (mevcut bahsetme zıplama yolu).
5. `NotificationBell` `REACTION` satırı: metin + önizleme, tıklayınca mesaja zıplama.
6. Ayarlar → Bildirimler: "Tepki bildirimleri" anahtarı (`reactionNotifications`).
7. i18n: `reaction.whoReacted`, `reaction.tooltip` (çoğul), `reaction.all`, `notification.reaction`, ayar etiketi/açıklaması. Uzun çizgi yok.

## §6 Mobil (vc45)
1. **Çift dokunma:** `MessageBubble` metin alanında `Gesture.Tap().numberOfTaps(2)` (gesture-handler zaten kurulu, yeni paket yok).
   Uzun basma ve yazar adına dokunma korunur; görsel/video/ses/bağlantı öğelerinin kendi dokunmaları korunur (çift dokunma onlarda yok).
   Emoji = kişinin etkin hızlı tepki listesinin ilki (`utils/quickReactions`). Kişinin mesajda tepkisi varsa no-op. Yerel/gönderilmemiş mesajda yok.
   Küçük geri bildirim: hafif titreşim (`expo-haptics` kuruluysa; değilse yok, yeni paket EKLENMEZ).
2. **Kimler tepki verdi:** pile uzun basma + mesaj eylem panelinde "Tepkileri gör" → alt panel (mevcut sheet deseni): yatay emoji
   sekmeleri + `FlatList` kişi listesi; kişiye dokununca mevcut profil paneli.
3. Bildirim ekranı + push gezinmesi (`pushNavigation`) `REACTION` → mesaja git (bahsetme yolu). DM push `data.type='REACTION'` da aynı.
4. Ayarlar: "Tepki bildirimleri" anahtarı.
5. Tepki pili davranışı web §5.1 ile aynı.
6. Cihaz doğrulaması sahipte; release APK canlı sunucuya karşı.

## §7 DoD
- api: tüm testler + `tsc -p tsconfig.build.json --noEmit` + eslint dokunulan dosyalar; migration yerelde uygulanır, `migrate status` temiz.
- web: `vue-tsc -b` (6 önceden-var) + eslint dokunulan + `vite build`; pencere 390/320'de ölçülür.
- mobil: `npm run typecheck` + `npm run lint`.
- Sahip turu: (a) kalp → 👍 seçince kalp kalkar, 👍 1; başkasının kalbi yanında kalır. (b) eski sürüm mobil (vc44) ile sayaçlar doğru.
  (c) çift dokunma ekler, ikinci çift dokunma bir şey yapmaz. (d) ipucu + pencere + mobil panel. (e) DM ve ortamda bildirim; koy/kaldır/koy
  tek bildirim; ayar kapalıyken yok; sessiz kanalda yok.

## §8 OUT
Tepki bildirimlerini gruplama ("Ali ve 3 kişi"), web'de çift tıklama, tepki animasyonu, özel/sunucu emojileri, listede sayfalama.
