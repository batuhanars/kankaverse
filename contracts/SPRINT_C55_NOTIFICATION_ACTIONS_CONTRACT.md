# SPRINT C55: Bildirimde "Okundu olarak işaretle" ve "Sessize al"

> Durum: **TASARIM KİLİTLİ (2026-11-09).** PM compose (Opus). Sahip isteği (WhatsApp davranışı). **Yalnız mobil**, vc60'a girer. API değişikliği YOK (uçlar mevcut). R7 dışı.

## §0 Karar
Sohbet bildiriminde (C50 MessagingStyle) "Cevapla"nın yanına iki düğme: **Okundu olarak işaretle** ve **Sessize al**. Android en çok 3 eylem gösteriyor; sıra: Cevapla · Okundu olarak işaretle · Sessize al (sistem düzeni farklı gösterebilir).

**Sessize al = 8 saat** (sahip kararı; WhatsApp'ın en kısa süresi, unutulsa da kendiliğinden açılır). DM'de o DM, ortamda **yalnız o kanal** (ortamın tamamı değil).

## §1 Kotlin (`modules/conversation-notification`)
- İki yeni eylem, C52 Cevapla ile aynı yol: `getBroadcast`, açık bileşen, sohbet + eylem başına ayrı request code, `FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE` (RemoteInput yok, mutable gerekmez). `SEMANTIC_ACTION_MARK_AS_READ` ve `SEMANTIC_ACTION_MUTE`, `setShowsUserInterface(false)`.
- Etiketler JS'ten parametre (i18n); Kotlin'de metin yok. Mevcut uygun anahtar varsa yeniden kullanılır, yoksa `mobile.notifications.markRead` = "Okundu olarak işaretle", `mobile.notifications.mute` = "Sessize al".
- Alıcı mevcut `QuickReplyReceiver` genişletilebilir ya da ortak bir eylem alıcısı olur; JS'e `{ action: 'reply' | 'markRead' | 'mute', conversationId, type, guildId, text? }` gider. Tek headless görev (`KvQuickReply` adı genelleştirilebilir), dallanma JS'te.
- `appendOwnReply` sonrası yeniden kurulan bildirimde üç eylem de korunur (C52'deki açık kopyalama).
- Düğmeye basılınca bildirim **hemen** kapanır (ağ isteğini beklemeden; kullanıcı geri bildirimi anında olsun).

## §2 JS
- `markRead`: erişim anahtarı yoksa `refreshAccessToken()`; DM ise `dmApi.markRead(conversationId)`, ortam kanalı ise `channelsApi.markRead(conversationId)` (ayrım `guildId` / `type` ile). Uygulama açıkken okundu durumunu tutan store'lar varsa onların mevcut temizleme fonksiyonu da çağrılır (rozet düşsün). Sunucu C50 sayesinde diğer cihazlara `read:self` + v2 okundu push'u zaten gönderiyor.
- `mute`: mevcut tercih ucu (`PUT /notifications/prefs`, mevcut istemci fonksiyonu) ile `targetType: CHANNEL`, `targetId: conversationId`, `muted: true`, `mutedUntil: şimdi + 8 saat`. Uygulamadaki susturma ekranının kullandığı aynı fonksiyon/sabit kullanılır; 8 saat sabiti tek yerde (mevcut susturma süre listesinde 8 saat varsa o sabit).
- Hata: sessiz geçilir (bildirim zaten kapandı); yeniden deneme yok. `__DEV__` dışında log yok.
- Mevcut kanal tercihi (ör. bildirim seviyesi) ezilmez; yalnız susturma alanları yazılır (ucun kısmi güncelleme davranışı kaynaktan doğrulanır).

## §3 DoD
`npm run typecheck`, `npm run lint`. PM derler (kısa yol, `cmp`). Sahip turu:
1. Kapalı uygulama, DM bildirimi → Okundu olarak işaretle → bildirim kapanır, web'de o DM okunmuş, rozet yok.
2. Ortam bildirimi → Sessize al → bildirim kapanır, aynı kanaldan 8 saat bildirim gelmez, uygulamada kanal susturulmuş görünür (süreli), aynı ortamın başka kanalları bildirim vermeye devam eder.
3. Cevap verdikten sonra yeniden kurulan bildirimde üç düğme de duruyor.
