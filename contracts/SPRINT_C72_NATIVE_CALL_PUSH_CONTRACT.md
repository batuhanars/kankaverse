# SPRINT C72: Gelen arama bildirimini native çizmek (JS'i beklemeden)

> Durum: **TAMAM (2026-11-24).** Cihaz turu düşük bellekli test cihazında 6/6 (APK 89); sahip telefonu regresyonu sahip kararıyla atlandı. PM compose (Opus). **Yalnız mobil (Android native + JS).** API, web değişmez.
> R7 kapsamı dışında (auth/T&S karar fonksiyonu yok). Native değişiklik: yeni build şart (AAB/versionCode 89).

## §0 Sorun (kanıt: test cihazı, Redmi Note 9 / MIUI 13, 4 GB, sistemce "lowmemory device", 2026-11-24)
Uygulama kapalıyken mesaj push'u (geç de olsa) düşüyor, **arama push'u hiç düşmüyor.** Otomatik başlatma + pil
"Kısıtlama yok" açıkken de aynı. logcat:
- `17.52.36 Start proc ... com.kankaverse.app for broadcast {...NotificationsService}`: push ANINDA geliyor, süreç kalkıyor.
- `17.52.40 lowmemorykiller: Kill 'com.kankaverse.app' (14601) oom_score_adj 915` (3,5 sn sonra);
  ikinci denemede `17.53.02 Kill ... adj 935 ... device is low on memory` (5 sn sonra).

Kök: v2 arama push'unu (`kind: 'call'`) **yalnız JS** çiziyor (`conversationPush.ts handleCall` → `presentIncomingCall`).
React Native bu cihazda 3-5 sn'de ayağa kalkmıyor; Expo `onMessageReceived`'i hemen bitirdiği için süreç "cached"
(adj 900+) sayılıyor ve LMK JS çizmeden öldürüyor. Push ömrü 30 sn, FCM yeniden teslim etmiyor. Mesaj yolunda E3'ün
native bekletme kapısı + yedek çizimi (`PushHold`) olduğu için mesaj düşüyor; aramada eşdeğeri yok.
Belleği bol cihazda JS yarışı kazandığı için sahibin telefonunda görünmüyor.

## §1 Karar
Arka plandaki gelen arama bildirimini `KvFirebaseMessagingService` **native olarak, JS'i beklemeden** çizer.
JS sonradan ayağa kalkarsa **ikinci bildirim çizmez**, native olanı sahiplenir. Ön plan davranışı (WS + uygulama-içi
şerit, ses için görünmez bildirim) **değişmez.**

## §2 Native çizim (`modules/conversation-notification/android/...`)
`KvFirebaseMessagingService.onMessageReceived`, `super.onMessageReceived` ÇAĞRILMADAN ÖNCE:

1. v2 yükü ayrıştır (`PushHold.parse` ile aynı kaynak sırası: `body` → `dataString` → düz alanlar). Yeni ayrıştırıcı
   `CallPush.parse`: `v == "2"`, `kind ∈ {call, call_end}`, `callChannelId` zorunlu; `call` için `callerId` zorunlu,
   `callerName`, `isGroup` (bool ya da `"true"`), `groupName` isteğe bağlı.
2. **`call_end`:** o kanalın native arama bildirimini hemen iptal et. Sonra `super` (JS yolu aynen sürer).
3. **`call`:** aşağıdaki koşulların HEPSİ sağlanırsa native çiz, sağlanmazsa hiçbir şey yapma (JS yolu bugünkü gibi):
   - Uygulama süreci ön planda DEĞİL (kendi sürecinin `importance` değeri `IMPORTANCE_FOREGROUND` değil). Ön planda
     WS + şerit yolu çalışır; native çizim burada çift sinyal olur.
   - `NotificationManagerCompat.areNotificationsEnabled()` true (sahip kararı 2026-08-12: arkada + izin yok = hiçbir şey).
   - `incoming_call_v4` kanalı var ve önemi `NONE` değil (kanalı JS kurar, native KURMAZ; kanal yoksa çizme).
   - Etiket önbelleği dolu (§4). Boşsa çizme (uygulama güncellemeden sonra hiç açılmamış): **gömülü metin yok.**
4. Bildirim: kanal `incoming_call_v4`, `CATEGORY_CALL`, `PRIORITY_MAX`, `setAutoCancel(false)`, `setOngoing(false)`,
   **`setTimeoutAfter(30_000)`** (zil süresi sunucunun 30 sn ttl'i ve JS `RING_TIMEOUT_MS` ile aynı; süreç ölse bile
   sistem kaldırır), `VISIBILITY_PUBLIC`. Başlık/gövde §4 önbelleğinden: 1-1 `incomingTitle` / `incomingBody`
   (`{name}` = callerName), grup `incomingGroupTitle` / `incomingGroupBody`. Ses ve titreşim kanaldan gelir; native ayrıca
   titreşim/ses çalmaz. Avatar bu sprintte YOK (ağ beklenmez; bildirim anında çıkmalı).
   **Rev.1 (2026-11-24, sahip bulgusu):** kanal titreşimi bildirim başına tek atış; JS'in `Vibration.vibrate` döngüsü
   native sahiplenmede çalışmadığı için telefon bir kez titreyip duruyordu (sessiz modda arama fark edilmez). Bildirime
   `Notification.FLAG_INSISTENT` eklenir: ses + titreşim bildirim kapanana dek (kabul · reddet · call_end · 30 sn) tekrarlar.
   Ayrı titreşim kodu yazılmaz. Doğrulama: düşük bellekli cihazda §6 madde 1 ve 6, telefon titreşim modundayken.
5. Kimlik: tag `kv-call:<callChannelId>`, sabit id. Aynı kanala ikinci `call` push'u gelirse yeniden çizmez (var olanı bırakır).
6. Çizimden sonra `super.onMessageReceived` çağrılır (JS görevi bugünkü gibi tetiklenir, §3 yinelenmeyi önler).

### §2.1 Düğmeler ve dokunma
- **Aramaya Katıl:** `PendingIntent.getActivity` → MainActivity, ekstralar `{kvCallAction: "accept", channelId, callerName,
  isGroup}`. JS bunu açılışta/`onNewIntent`'te okur ve mevcut `acceptIncomingCall(channelId, callerName, isGroup)` yolunu
  çağırır (mikrofon izni, `mic_denied` uyarısı dahil aynen). Okunan ekstra tüketilir (bir kez); `ConversationNotifier.consumeTap`
  deseni örnek alınır.
- **Reddet:** `PendingIntent.getService` → yeni `CallActionService : HeadlessJsTaskService` (`QuickReplyService` deseni),
  görev adı `KvCallAction`, veri `{action: "reject", channelId, isGroup, postedAt}`. JS görevi mevcut `rejectIncomingCall`
  mantığını çalıştırır; `Date.now() - postedAt > 30_000` ise reddetmez, yalnız `dismissIncomingCall` (bugünkü "eski yanıt" kuralı).
  Bildirim, düğmeye basılınca native tarafta hemen iptal edilir (kullanıcı beklemesin).
- **Gövdeye dokunma:** Katıl ile aynı aktivite, `kvCallAction: "open"` → JS bugünkü `DEFAULT_ACTION` davranışı
  (`router.push(dmTarget(channelId))`).
- PendingIntent request code'ları kanal + eylem başına ayrı (karışmasın); `FLAG_IMMUTABLE`.

## §3 JS tarafı (`src/notifications/`)
- `presentIncomingCall` arka plan dalında, zil bildirimi kurmadan önce native modüle sorar:
  `isNativeCallShowing(channelId)` (aktif bildirimlerde tag `kv-call:<id>` var mı). Varsa **yeni bildirim kurmaz**;
  `current = { channelId, notificationId: null, native: true, timeoutTimer }` olarak sahiplenir. JS titreşimi
  (`Vibration.vibrate`) bu durumda ÇALIŞMAZ (kanal titreşimi zaten var; çift titreşim yok).
- `dismissIncomingCall(channelId)`: `current.native` ise native modülün `dismissNativeCall(channelId)` çağrısıyla kapatır.
  Bitiş yollarının dördü de (kabul · reddet · zaman aşımı · arayan iptal) aynı ortak çıkıştan geçer, yeni yol açılmaz.
- `clearStaleIncomingCallNotifications` native arama bildirimlerini de kapsar (tag ön eki ile).
- `KvCallAction` headless görevi `index.js`'te `AppRegistry.registerHeadlessTask` ile kaydedilir (`KvQuickReply` yanına).
- Katıl/aç ekstraları için okuma noktası, mevcut soğuk açılış kapısıyla (`useGatedNotificationResponder` / oturum hazır olma
  kapısı) AYNI sırayı izler: oturum hazır olmadan katılma denenmez.

## §4 Etiket önbelleği (gömülü metin yasağı)
JS, mevcut `setNotificationDefaults` çağrısında (her görev/açılış) şu anahtarları da yazar: `callTitle`, `callBody`,
`callGroupTitle`, `callGroupBody`, `callRejectLabel`, `callJoinLabel`. Değerler `t()`'den (`mobile.call.incomingTitle`,
`mobile.call.incomingBody`, `mobile.call.incomingGroupTitle`, `mobile.call.incomingGroupBody`, `call.reject`,
`mobile.call.joinAction`); gövde şablonları `{name}` yer tutucusuyla ham yazılır, native yerine koyar.
`PushHold.DEFAULT_KEYS`'e eklenir. tr.json'a yeni anahtar EKLENMEZ.

## §5 Kapsam dışı
Tam ekran (full-screen intent) arama ekranı, avatar, ConnectionService/telefon entegrasyonu, sunucu değişikliği,
eski (format 1) push yolu, iOS. Bunlar ayrı iş.

## §6 Doğrulama
- `tsc` (mobil, bilinen hatalar dışında yeni yok), dokunulan dosyalarda eslint, mevcut test paketi.
- **Yerel derleme önce** (native kural): `expo prebuild` + `gradlew` başarılı; paket içinde `CallActionService` ve
  `KvCallAction` kaydı var (sembol/manifest kontrolü).
- **Cihaz turu (düşük bellekli test cihazı, uygulama son uygulamalardan kapatılmış, ekran kilitli ve açık iki durum):**
  1. Sahip arar → ≤ 2 sn içinde zil + "Gelen Arama" bildirimi. logcat: native çizim satırı, LMK ölümü olsa bile bildirim kalır.
  2. Reddet → bildirim anında kalkar, arayanda arama reddedildi görünür.
  3. Katıl → uygulama açılır, aramaya bağlanır (E8 şifreli), çift bildirim yok.
  4. Arayan kapatır → bildirim kalkar (call_end).
  5. 30 sn cevapsız → bildirim kendiliğinden kalkar.
  6. Uygulama arka planda (kapalı değil) → tek bildirim (native + JS çift çizmez), tek titreşim.
  7. Uygulama açık → bugünkü şerit, sistem bildirimi görünmez (regresyon yok).
  8. Grup araması → grup başlığı/gövdesi.
- Sahibin telefonunda (bellek bol) 1, 6, 7 tekrar: regresyon yok.
