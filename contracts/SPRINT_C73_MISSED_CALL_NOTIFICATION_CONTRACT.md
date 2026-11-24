# SPRINT C73: Cevapsız arama bildirimi + zil titreşim deseni

> Durum: **TAMAM (2026-11-24).** Titreşim + cevapsız bildirimi cihazda geçti (vc90, incelemede). PM compose (Opus). Mobil (Android native + JS) + api'de küçük alan ekleme. Web değişmez.
> R7 kapsamı dışında (auth/T&S karar fonksiyonu yok). Native değişiklik: yeni build (versionCode 90, C72 Rev.1 ile aynı paket).
> Önkoşul: C72 (native arama bildirimi) + C72 Rev.1 (`FLAG_INSISTENT`).

## §0 Sahip bulguları (2026-11-24, düşük bellekli test cihazı)
1. Zil 30 sn içinde cevaplanmazsa bildirim sessizce kayboluyor; kullanıcının "biri aradı" bilgisi hiçbir yerde kalmıyor.
2. Titreşim aralığı sık. Kanal deseni `[0,400,200,400,2000]`; cihaz kısa parçaları birleştirip ~her saniye titriyor.
3. (Kayıt) Paneli aşağı çekmek zili susturuyor: Android'in kuralı, kusur değil. Bildirimin üstte kalması (tam ekran
   arama) sahip kararıyla bu sprintte YOK, ayrı iş (kapsamı önce konuşulacak).

## §1 api: `call_end` yüküne neden
`V2CallEndData`'ya `reason: 'canceled' | 'answered' | 'rejected'` eklenir; `PushService.sendCallEnd(userId, callChannelId, reason)`.
- `CallSignalService.cancel` → `canceled` (arayan kapattı ya da arayanın 30 sn zaman aşımı).
- `CallSignalService.accept` → `answered`, `reject` → `rejected` (aynı hesabın diğer cihazlarına).
- `voice:group_call_cancel` → `canceled`.
Eski istemci alanı yok sayar (geri uyumlu). Spec'ler güncellenir.

## §2 Native: bekleyen arama kaydı ve cevapsız bildirimi (`CallPush`)
- Zil bildirimi çizilince bekleyen kayıt yazılır (SharedPreferences, anahtar kanal kimliği): `callerName`, `isGroup`, `at`.
  Aynı anda 30 sn sonrası için yedek alarm kurulur (`AlarmManager.set`, `ELAPSED_REALTIME_WAKEUP`, kesin alarm izni
  ISTEMEZ; birkaç saniye gecikebilir, kabul). Alarm hedefi yeni `MissedCallReceiver` (exported=false).
- **Cevapsız sayılır** (kayıt varsa ve 120 sn'den eski değilse): `call_end` `reason == canceled` ya da yedek alarm.
  İşlem: kayıt silinir, alarm iptal, zil bildirimi kapatılır, cevapsız bildirimi çizilir. İki yol yarışırsa kayıt silme
  tek seferliktir (senkron), ikinci yol hiçbir şey yapmaz.
- **Cevapsız sayılmaz** (kayıt silinir, alarm iptal, cevapsız YOK): `call_end` neden `answered`/`rejected`/yok (eski sunucu),
  bildirimden Katıl, bildirimden Reddet, JS kabul/reddet (`resolveNativeCall`).
- Gövdeye dokunup uygulamayı açmak kaydı SİLMEZ (açıp cevap vermezse cevapsız düşer).
- Ön planda gelen arama native çizilmediği için kayıt yok, cevapsız bildirimi yok (kullanıcı uygulamadaydı).

### §2.1 Cevapsız bildirimi
- Kanal `missed_call_v1` (JS kurar, önem DEFAULT; native KURMAZ, yoksa çizmez). Kategori `CATEGORY_MISSED_CALL`.
- Başlık/gövde etiket önbelleğinden: 1-1 `callMissedTitle` / `callMissedBody` (`{name}`), grup `callMissedGroupTitle` /
  `callMissedGroupBody`. `setWhen(arama anı)` + `setShowWhen(true)`: saat görünür. `setAutoCancel(true)`, zaman aşımı YOK
  (kullanıcı kaldırana ya da dokunana dek panelde kalır).
- Kimlik: tag `kv-missed:<kanal>`, sabit id. Aynı kanaldan yeni cevapsız arama eskisinin yerini alır (en son saat).
- Dokunma: C72'deki `open` eylemiyle aynı (sohbeti açar). Ek düğme YOK (Geri ara ayrı iş; boş yüzey açılmaz).
- Önbellek ya da kanal yoksa çizilmez (C72 §4 kuralı: gömülü metin yok).

## §3 JS
- `acceptIncomingCall` / `rejectIncomingCall` native `resolveNativeCall(channelId)` çağırır (kayıt + alarm temizliği).
- `cacheNotificationDefaults` dört yeni anahtarı yazar; `PushHold.DEFAULT_KEYS`'e eklenir.
- tr.json `mobile.call` altına: `missedTitle`, `missedBody`, `missedGroupTitle`, `missedGroupBody`, `missedNotifChannel`.
- `ensureIncomingCallNotificationsSetup` `missed_call_v1` kanalını kurar.

## §4 Zil titreşim deseni
- Desen `[0, 1000, 1500]` (1 sn titreşim, 1,5 sn ara). Kanal ayarı kurulduktan sonra değişmediği için kimlikler artar:
  `incoming_call_v4` → `incoming_call_v5`, ön plan kanalı `incoming_call_quiet_v1` → `incoming_call_quiet_v2`
  (native `CallPush.CHANNEL_ID` dahil). Eski iki kanal kurulumda silinir.
- api'deki v1 `androidChannelId: 'incoming_call_v4'` DEĞİŞMEZ (yalnız eski sürümlere gider, onlarda v5 yok).
- Ön plan `Vibration.vibrate` aynı sabiti kullanır.

## §5 Kapsam dışı
Tam ekran arama ekranı / üstte kalan bildirim, Geri ara düğmesi, cevapsız sayacı ("2 cevapsız"), uygulama içi arama
geçmişi, iOS.

## §6 Doğrulama
- api: `tsc -p tsconfig.build.json`, ilgili jest spec'leri. mobil: `tsc`, eslint (dokunulan dosyalar).
- Yerel derleme önce (native kural); paket içinde `MissedCallReceiver` manifest kaydı.
- Cihaz turu (düşük bellekli cihaz, uygulama kapalı, titreşim modu):
  1. Ara, 30 sn bekle → zil uzun desenle çalar, sonra "Cevapsız arama" bildirimi saatle panelde kalır.
  2. Ara, 10 sn sonra arayan kapatır → zil hemen kalkar, cevapsız bildirimi düşer.
  3. Ara, Reddet → cevapsız YOK. Ara, Katıl → cevapsız YOK.
  4. Cevapsız bildirimine dokun → sohbet açılır, bildirim kalkar.
  5. Uygulama açıkken ara, cevaplama → cevapsız bildirimi YOK (regresyon yok, şerit bugünkü gibi).
- api deploy, mobil AAB'den ÖNCE (yeni alan sunucudan gelmezse cevapsız yalnız yedek alarmla düşer).
