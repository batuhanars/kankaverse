# SPRINT C52: Bildirimden hızlı cevap + bildirime dokununca sohbete gitme düzeltmesi

> Durum: **TASARIM KİLİTLİ (2026-11-09).** PM compose (Opus). Sahip isteği. **Yalnız mobil.** Yol haritasında **1c**.
> R7 dışı: auth/oturum koduna (`api/http.ts`, `stores/auth.ts`) DOKUNULMAZ; cevap mevcut `refreshAccessToken()` ve mevcut gönderme ucunu kullanır. Gönderme yetkisi sunucuda (bugünkü kapılar).
> Deneme: dal `spike/quick-reply` (11e1b0a, 55e1ce7), sahip MIUI cihazında 3 durumda geçti. Başlangıç noktası o dal.

## §0 Sorun ve karar

**Hızlı cevap (sahip, 2026-11-09):** kısa mesaja uygulamayı açmadan kısa cevap. Bildirimde "Cevapla", tek satır metin (klavye emojisi yeterli; ek, emoji seçici, sesli mesaj YOK). Gönderilince bildirimin altına "Ben: ..." eklenir.

**Deneme bulguları:**
- Uygulama kapalıyken cevap düğmesi `HeadlessJsTaskService` ile JS'i uyandırıyor, oturum ~0,6 sn'de yenileniyor, mesaj gidiyor (toplam ~1,4 sn).
- **Arka plan görevi ile arayüz TEK JS ortamını paylaşıyor** (tek önbellekli `ReactHost`; logda cevap ortamı kimliği = sonradan açılan arayüz ortamı kimliği, yarış testinde dahil). Bu yüzden iki eşzamanlı yenileme oluşamaz; mevcut tek uçuş koruması yeterli. Süreç genelinde kilit ve 401 yakalayıcı değişikliği GEREKMEZ.

**Hata (C50'den, canlıda vc59 dağıtılmadı):** uygulama kapalıyken bildirim gelince JS ortamı ekransız uyanıyor. Kullanıcı birkaç saniye içinde bildirime dokunursa etkinlik bu çalışan ortamın üstüne açılıyor ve dokunma bilgisi kayboluyor; uygulama açılıyor ama sohbete gitmiyor. Bu en yaygın kullanım. Sahip turu C50'de geçmişti çünkü dokunuş gecikmeliydi (süreç ölmüş, soğuk açılış).

## §1 Dokunma düzeltmesi (`modules/conversation-notification`)
- Kök neden varsayımı: `getInitialTap` `appContext.currentActivity` null iken çağrılıyor ya da etkinlik hazır olduğunda yeniden kontrol yapılmıyor (`AppState` zaten `active`'e geçmiş, değişim olayı kaçıyor). Dev önce §1 tanı loglarıyla doğrular, sonra düzeltir.
- Düzeltme ilkesi: **dokunma native tarafta ilk görüldüğü yerde yakalanır ve modülde saklanır; JS hazır olduğunda teslim edilir.** Yakalama noktaları: `OnActivityEntersForeground` (etkinliğin intent'i), `OnNewIntent`, ve `getInitialTap` çağrısı. Saklanan dokunuş bir kez teslim edilir (`consumeTap` ekstraları siler, modüldeki bekleyen alan da temizlenir). Dinleyici varsa `onTap` olayı da gönderilir. JS tarafı (`responseGate.ts`) değişmeden kalabilir ya da `getInitialTap`'i ilk mount + `active` geçişinde çağırmaya devam eder; ikisi aynı dokunuşu iki kez işleyemez.
- Tanı logları (release'te de, `Log.i` etiket `ConversationTap`; JS `[tap]`): yakalama noktası, intent ekstrası var mı, teslim edildi mi. **Sahip turu bittikten sonra `__DEV__`/kaldırma** (§5).

## §2 Hızlı cevap (deneme dalından)
- **Kotlin:** "Cevapla" eylemi `RemoteInput` (`kv_reply_text`), `SEMANTIC_ACTION_REPLY`, `setShowsUserInterface(false)`, `setAllowGeneratedReplies(false)`. PendingIntent `getBroadcast`, açık bileşen, sohbet başına request code, `FLAG_UPDATE_CURRENT | FLAG_MUTABLE` (RemoteInput için zorunlu, yalnız API 31+'da mutable). Etiket JS'ten (`mobile.notifications.reply`). `QuickReplyReceiver` (exported=false) + `QuickReplyService` (`HeadlessJsTaskService`, zaman aşımı 30 sn, ön planda da çalışabilir).
- `appendOwnReply(conversationId, text, ts)`: görünen bildirimin stilini çıkarır, "ben" mesajı ekler, son 10'u tutar, `NotificationCompat.Builder(context, notification)` ile yeniden kurar, `setOnlyAlertOnce(true)` (cevap ses çıkarmaz). Bildirim yoksa false. 🔴 Yeniden kurulan bildirimin **dokunma intent'i ve Cevapla eylemi korunmalı** (§1 düzeltmesiyle birlikte cihazda doğrulanır: cevaptan sonra bildirime dokununca sohbet açılır).
- **JS (`src/notifications/quickReply.ts`, deneme dosyası yeniden adlandırılır):** `AppRegistry.registerHeadlessTask('KvQuickReply', ...)` `index.js` kök düzeyinde. Akış: erişim anahtarı yoksa `refreshAccessToken()`; `messagesApi.send(conversationId, text)` (composer ile aynı uç); başarıda `appendOwnReply`; hata olursa bildirime `mobile.notifications.replyFailed` metniyle ("Gönderilemedi: <metin>") ekle. Metin boşsa/yalnız boşluksa hiçbir şey gönderilmez. Uzunluk sınırı composer'la aynı (sunucu zaten doğruluyor; istemci aynı sabiti kullanır, kopya sayı yazmaz).
- Oturum yenileme başarısızsa (oturum düşmüş): mevcut davranış (`http.ts` anahtarı siler) korunur, bildirime "Gönderilemedi" düşer. Yeni davranış icat edilmez.
- Uygulama ön planda ve o sohbet açıkken bildirim zaten gösterilmiyor (C50), dolayısıyla cevap düğmesi o durumda yok.
- Çevrimiçi olmayan cihaz: istek zaman aşımına düşer (mevcut 15 sn), "Gönderilemedi". Kuyruk/yeniden deneme YOK.
- Deneme logları (`[spike-reply]`, `__kvRuntimeId`, `_layout.tsx` logu) KALDIRILIR.

## §2.1 Kendi avatarım (Revize 1, 2026-11-09 sahip turu)
Grup DM ve ortam bildiriminde "ben" satırlarına varsayılan simge geliyor. "Ben" `Person`'una kullanıcının kendi statik avatarı (daire kırpılmış) verilir. 1-1'de Android satır avatarı göstermiyor; değişiklik yok. Uygulama kapalıyken kullanıcı bilgisi bellekte olmadığı için avatar adresi oturum açıkken (auth store kullanıcısı yüklenince/değişince) AsyncStorage'a yazılır, görev oradan okur. Yalnız herkese açık avatar adresi; token/kişisel veri YOK. Çıkışta silinir. Avatar yoksa bugünkü gibi simgesiz.

## §3 Sürüm
versionCode 60. Release APK PM tarafından kısa yol kopyasında, kaynakla `cmp` eşitlemesi doğrulanarak derlenir; APK'da yeni sınıflar aranır ([[kisa-yol-derleme-kopyasi]]). Dev APK derlemez.

## §4 Sahip cihaz turu
1. Uygulama kapalı, mesaj gelir, **hemen** bildirime dokun → doğru sohbet açılır. Birkaç dakika bekleyip dokun → yine açılır. Arka plandayken dokun → açılır.
2. Cevapla (kapalı / arka plan / ortam kanalı / grup DM) → mesaj karşı tarafta, bildirimde "Ben: ...", ses çıkmaz.
3. Cevaptan sonra bildirime dokun → sohbet açılır, cevap sohbette görünür.
4. İnternet kapalıyken cevap → "Gönderilemedi: ...".
5. Cevap verip hemen uygulamayı aç → oturum düşmez.

## §5 Kapanış
Tur geçince tanı logları kaldırılır (ya da `__DEV__`), vc60 yeniden derlenir. 1b (aramalar) bu derlemeye eklenecekse vc60 Play'e 1b ile birlikte gider.

## §6 Kapsam dışı
Ek/ses/emoji seçici, uzun metin, cevap kuyruğu, iOS, E2EE (cevabın şifrelenmesi E2EE'de JS görevine eklenecek; bu sprint yapıyı ona hazır bırakır: gönderme tek fonksiyonda).
