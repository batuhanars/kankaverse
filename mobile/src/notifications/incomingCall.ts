import { useEffect } from 'react';
import { Alert, AppState, type AppStateStatus, Linking, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useVoiceStore } from '@/stores/voice';
import { useDmStore } from '@/stores/dm';
import { callAccept, callReject, isSocketConnected } from '@/realtime/socket';
import { getAccessToken, refreshAccessToken } from '@/api/http';
import { voiceApi } from '@/api/voice';
import { channelTitle } from '@/utils/channelTitle';
import { dmTarget } from '@/utils/pushNavigation';
import { useGatedCallAction, useGatedNotificationResponder } from '@/notifications/responseGate';
import {
  dismissNativeCall,
  dismissNativeCalls,
  isNativeCallShowing,
  resolveNativeCall,
} from '../../modules/conversation-notification';
import { t } from '@/i18n';

/**
 * M4a-2 sözleşme §8 — mobilde **gelen** arama, uygulama açıkken. Sunum TAM EKRAN DEĞİL, bildirim
 * (§8.1, sahip görselleri `design-refs/m4-ses/13-14`): "Gelen Arama" / "<ad> seni arıyor!" + Reddet ·
 * Aramaya Katıl. `voice.incoming_call` WS'ten gelir (`realtime/socket.ts`, uygulama ön plandayken).
 *
 * 🔴 M4a-3 (sözleşme §9) — aynı sunum artık push tetikleyicisini de karşılar: uygulama ölüyken
 * `api/`nin gönderdiği push, kanal/kategori kurulumunu (§9.2.2) ve `useGatedNotificationResponder`
 * ile soğuk açılış zincirini (§9.2.3) paylaşır. Bu dosyada YENİ bir ekran/kanal-kavramı YOK; değişen
 * yalnız zilin nereden geldiği (§9.2.1) ve kurulumun ne zaman çalıştığı (§9.2.2).
 *
 * §9.2.1 🔴 KANIT (sahip cihaz turu 2026-08-07) — sessiz kanal (eski `incoming_call_v2`, `sound:
 * null` + JS'te `expo-audio` ile döngülü zil) heads-up ÇIKARMIYORDU; aynı arama sırasında `api/`nin
 * (henüz kurulmamış) `incoming_call_v3` kanalına düşen push ÇIKARDI. Fark eden tek değişken kanalın
 * GERÇEK sesi. Ölçümün 1. seçeneği izlendi: TEK kanal (`incoming_call_v3`, sunucudaki
 * `androidChannelId` ile birebir aynı string), kanala GÖMÜLÜ ~30 sn'lik kendi içinde döngülü bir zil
 * dosyası (`assets/sounds/incoming_call_channel.wav`).
 *
 * 🔴 KAYNAK: `assets/sounds/incoming-call.wav` (M4a-2'nin çift-zil ritmi, SİLİNMEDİ — bilerek: bu
 * dosyanın tek işi bu üretimin kaynağı olmak, kod hiçbir yerden `require` etmiyor). Üretim komutu
 * (M4b §14.3, dinamik aralık sıkıştırması — eski hâli yalnız `volume=13.9dB` idi):
 * ```
 * ffmpeg -stream_loop 9 -i incoming-call.wav -af "compand=attacks=0.001:decays=0.01:points=-80/-80|-45/-2.5|-15/-1.2|0/-1:soft-knee=3,volume=6dB,alimiter=limit=0.891:attack=5:release=50,volume=-1dB" -ar 22050 -ac 1 -sample_fmt s16 incoming_call_channel.wav
 * ```
 * — kaynağı 10 kez ardışık dizip (~30 sn) mono/22kHz/16-bit'e indiriyor (aşağıdaki APK boyutu
 * notuna bkz.). Aynı ton reçetesi, yeni kayıt yok. Zincirin işi sırayla: `compand` zilin kendi
 * içindeki genlik dalgalanmasını (20 ms'lik pencerelerde -20…-28 dB arası titreşen bir warble)
 * düzleştirir, `volume=6dB` limitere iş verir, `alimiter` tepeyi TAŞIRMADAN sınırlar (compand tek
 * başına +6.4 dBFS'e taşıyordu — s16'ya çevrilince sessizce KIRPILIRDI), son `volume=-1dB` tepeyi
 * -1 dB'ye oturtur.
 *
 * 🔴 ÖLÇÜM TUZAĞI (M4b §14.3 sırasında bulundu): ara dosyayı s16 yazıp `volumedetect` ile ölçmek
 * YANILTIR — taşan tepe s16'da zaten kırpılmış olur ve `max_volume` masum bir `0.0 dB` gösterir.
 * Kazanç ayarı yapılacaksa ara ürün `-c:a pcm_f32le` ile FLOAT yazılıp `astats` `Peak level dB`
 * okunmalı. Kırpma kanıtı: `astats` `Flat factor: 0.000000` (kırpma düz plato üretir).
 *
 * 🔴 D44 (PM ölçümü 2026-08-07, sahip cihaz turu) — dosya teknik olarak sağlamdı (30 sn/mono/22050/s16)
 * ama SESSİZDİ: `ffmpeg -af volumedetect` tepe **-14.9 dB** / ortalama **-28.4 dB** ölçtü — tam ölçeğin
 * ~%18'i, bildirim sesi zaten sistemce kısılarak çalındığı için pratikte duyulmuyordu. `volume=13.9dB`
 * kazancı kaynağa (döngüden ÖNCE, `-i` sonrası `-af`) uygulanarak tepe **-1.0 dB** / ortalama **-14.5 dB**'ye
 * çıkarıldı — süre/format/kanal/örnekleme AYNI kaldı (yalnız kazanç), dosya boyutu değişmedi (1 292 KiB /
 * 1 323 078 bayt, aynı PCM matematiği). Kanal kimliği (`incoming_call_v3`, aşağıda) BİLEREK değişmedi —
 * içerik değişti, kanal ayarı değil.
 *
 * 🔴 M4b §14.3 (sahip ikinci cihaz turu) — zil HÂLÂ kısıktı. Tepe zaten sınırdaydı (-1.0 dB), sorun
 * ORTALAMAYDI: -14.5 dB. Yukarıdaki compand+limiter zinciriyle tepe **-0.98 dB** (değişmedi),
 * ortalama **-10.7 dB** (+3.8 dB), EBU R128 gürlüğü **-11.4 → -7.6 LUFS**. Kırpma yok
 * (`Flat factor 0.000000`), süre/format/kanal/örnekleme ve dosya boyutu AYNI.
 *
 * ⚠️ Neden -9 dB DEĞİL (sözleşmenin istediği hedef): zilin ritmi 3 sn'lik bir döngüde 0.8 sn ton +
 * 2.2 sn SESSİZLİK (0.4+0.2+0.4+2.0). Ortalama tüm sessizliği de sayar; tonun görev döngüsü %26.7
 * olduğu için tepe -1 dB'de kalan KIRPILMAMIŞ bir sinüs bile en fazla **-9.75 dB** ortalama verir
 * (10·log10(0.267) = -5.74 dB, sinüsün tepe/RMS farkı 3.01 dB). -10.7 bu fiziksel tavanın 1 dB
 * altında; kalanı ancak dalga biçimini kırparak (cızırtı) ya da ritmi değiştirerek alınır, ikisi de
 * §14.3'te yasak. Daha gür isteniyorsa değiştirilecek şey ritim (sessizliği kısaltmak), kazanç değil.
 *
 * 🔴 Dosya adı ALT ÇİZGİ ile: Android ham kaynak adı `[a-z0-9_]` dışına çıkamıyor, tire (`-`)
 * `expo prebuild`'i "Resource name is not valid" hatasıyla düşürüyor — ilk denemede öğrenildi.
 *
 * 🔴 APK boyutu (PM incelemesi 2026-08-07) — ilk üretim 44.1kHz/mono/16-bit'te 2.6 MB'tı, zil sesi
 * için gereksiz büyüktü. mono+22kHz+16-bit'e düşürüldü → 1.29 MB (`22050 Hz × 2 byte × 30 sn` —
 * WAV sıkıştırmasız PCM olduğu için matematik bu, PM'in tahmin ettiği ~300 KB'a bu parametrelerle
 * ulaşılmıyor; daha küçük istenirse örnekleme hızını daha da düşürmek ya da döngü süresini kısaltmak
 * gerekir, ikisi de ayrı bir karar — bkz. rapor). Format `.wav` kalmak ZORUNDA: `expo-notifications`
 * plugin `sounds` dizisi `.wav` bekliyor, `.ogg`'a geçmek doğrulanamayan bir risk (emülatörde format
 * uyumluluğu test edilemez, yalnız cihazda görülür).
 *
 * Ön plan (WS) yolundaki `expo-audio` zili KALDIRILDI (paket de `package.json`'dan çıkarıldı — gerçek
 * kullanımı kalmadı, M4a-1'in "tek derleme kuralı" gerekçesi artık geçersiz); iki yol da (WS'in yerel
 * bildirimi + push) artık kanalın sesini kullanıyor — Android bildirim sesini kendi başına
 * TEKRARLAMAZ, dosyanın ~30 sn uzunluğu döngünün yerini tutuyor (§8.2'nin 30 sn zaman aşımı ve
 * `api/`nin 30 sn `ttl`siyle örtüşüyor).
 *
 * 🟢 M4a-2'nin açık borcu (D40, "cihaz sessizdeyken zil çalmasın") bu değişiklikle KENDİLİĞİNDEN
 * kapanıyor: Android kanal sesini ringer modundan bağımsız ÇALAMAZ (sistemin kendi davranışı),
 * uygulamanın ringer modunu SORGULAMASINA gerek kalmadı.
 *
 * ⚠️ 🔴 Titreşim BİLEREK iki kaynaktan geliyor, ÇAKIŞMA VAR (PM incelemesi 2026-08-07) — kanal
 * `enableVibrate: true` + gerçek `vibrationPattern` ile kurulu (M4a-2'de v1 tam tersini yapmıştı:
 * `enableVibrate: false`, "tek kaynak, çift titreşim yok"; burada o karar BİLEREK TERSİNE ÇEVRİLDİ).
 * Android bildirim gösterildiğinde kanal titreşimini uygulama ön planda olsun olmasın çalıştırır; JS
 * de ön planda `Vibration.vibrate` ile ayrıca döngüde titreşiyor (ringer modundan bağımsız çalıştığı
 * M4a-2'de doğrulandı). Sonuç: ÖN PLANDA bildirim gösterildiği ilk anda kanal titreşimi (tek atış) ile
 * JS'in döngüsü üst üste biner. Bu ÇAKIŞMA KALDIRILMIYOR çünkü ikisi de gerekli: arka planda/push'ta
 * JS koşmuyor, kanal titreşimi olmazsa orada HİÇ titreşim olmaz (M4a-3'ün asıl var oluş nedeni).
 * Alternatif arka planda titreşimsizlik olurdu, o daha kötü. Sahip cihazda ön planda aramanın ilk
 * saniyesinde garip/çift bir titreşim hissederse bu BİLİNEN ve KABUL EDİLMİŞ bir durumdur, yeni kusur
 * sanıp tur açmasın.
 *
 * 🔴 GERİYE DÖNÜK DÜZELTME (emülatör doğrulaması sırasında bulundu, 2026-08-07) — yukarıdaki §9.2.1
 * KANIT paragrafındaki "sessiz kanal heads-up çıkarmıyordu" gözlemi YÖNÜ doğru (kanalın gerçek sesi
 * gerekiyordu) ama M4a-2'den beri **ek bir kusurla** karışıktı: `presentIncomingCall`'ın
 * `scheduleNotificationAsync` çağrısı `trigger: null` kullanıyordu, bu ise Android'de kanalı HİÇBİR
 * ZAMAN `CHANNEL_ID`'ye değil, `expo-notifications`'ın kendi `expo_notifications_fallback_notification_
 * channel`ine yönlendiriyordu (bkz. aşağıdaki `trigger: { channelId: CHANNEL_ID }` satırının yorumu).
 * Yani WS yolunun kanalı hiçbir zaman ne `incoming_call_v2` ne `incoming_call_v3`'tü — KANIT'teki
 * karşılaştırma "bizim kanalımız" ile değil, kütüphanenin varsayılan kanalıyla push'un doğru kanalı
 * arasındaydı. Sonuç (gerçek ses gerekli) hâlâ geçerli, ama WS yolu şimdi düzeltiliyor: doğru trigger
 * ile artık gerçekten `CHANNEL_ID`'ye gidiyor.
 *
 * ⚠️ Ölçüm 2. adımı (kabul/reddet/iptal ile bildirim kaldırıldığında kanal sesinin gerçekten
 * KESİLİP kesilmediği) SAHİPTE doğrulanacak — bu dev session'ın cihazı yok (bkz. rapor). Kesilmezse
 * (Android bazı OEM'lerde bildirim sesini iptalde durdurmayabilir) §9.2.1'in 3. seçeneğine
 * (`incoming_call_bg_v1`, iki ayrı kanal) düşülür; o zaman bu dosyadaki CHANNEL_ID VE
 * `api/messages.gateway.ts`'teki `androidChannelId` BİRLİKTE güncellenir.
 */

// 🔴 Kanal kimliği SÜRÜMLÜ ve SUNUCUYLA EŞLEŞMEK ZORUNDA (`api/src/modules/messages/gateway/
// messages.gateway.ts` `androidChannelId: 'incoming_call_v4'`). Android bildirim kanalı bir kez
// kurulduktan sonra ayarları (ses/titreşim/önem) **değiştirilemez**; `setNotificationChannelAsync`
// aynı kimlikle çağrılınca sessizce hiçbir şey yapmaz. Ayar değişince kimlik de artırılır — bu yüzden
// v3'e geçildi (v2: sessiz kanal, heads-up çıkarmıyordu, §9.2.1 KANIT).
// C73 §4: titreşim deseni değişti → v4'ten v5'e (kanal ayarı kurulduktan sonra değişmez). Native `CallPush` ile aynı.
const CHANNEL_ID = 'incoming_call_v5';
/**
 * 🔴 ÖN PLAN KANALI (sahip bulgusu 2026-08-12, cihaz turu). Uygulama açıkken sunum bizim kendi
 * şeridimiz; bildirim yalnız ZİL SESİ için kuruluyor ve görünmemesi gerekiyor. İlk denemede bu
 * `push.ts`teki `setNotificationHandler` ile (`shouldShowBanner: false`) yapılmıştı — CİHAZDA
 * ÇALIŞMADI: o handler uygulama önündeyken GELEN bildirimleri süzüyor, bizim zil bildirimimiz ise
 * yerel olarak ZAMANLANAN bir bildirim ve Android'de sistem tarafından doğrudan gönderiliyor,
 * JS'teki karar noktasına hiç uğramıyor. (Mesaj bildirimlerinde çalışmasının sebebi onların
 * sunucudan gelmesi.)
 *
 * Karar bu yüzden işletim sistemi seviyesine taşındı: üstten inme davranışı KANALIN ÖNEMİNDEN
 * geliyor. MAX/HIGH üstten iner, DEFAULT yalnız ses çalıp gölgeye düşer. Aynı ses, aynı zil-tonu
 * akışı, yalnız önem farklı — yani sessiz mod/DND saygısı da aynen korunuyor.
 */
const FOREGROUND_CHANNEL_ID = 'incoming_call_quiet_v2'; // C73 §4: v1'den (desen)
// §9.2.1b — sahip cihaz turunda ayarlarda İKİ ayrı "Gelen arama" kanalı birikmiş görüldü (v1 + v2,
// aynı adla). Yeni kanal kurulurken eskiler silinir; kullanıcı ayarlarda hangisinin gerçek olduğunu
// artık ayırt etmek zorunda kalmaz.
const OLD_CHANNEL_IDS = ['incoming_call', 'incoming_call_v2', 'incoming_call_v3', 'incoming_call_v4', 'incoming_call_quiet_v1'];
/** C73: cevapsız arama bildirimi kanalı; native `MissedCall` çizer, kanalı burada kurulur. */
const MISSED_CHANNEL_ID = 'missed_call_v1';
const CHANNEL_SOUND_FILE = 'incoming_call_channel.wav'; // app.json expo-notifications plugin `sounds`
const CATEGORY_ID = 'incoming_call';
const NOTIFICATION_DATA_TYPE = 'incoming_call';

// C73 §4: 1 sn titreşim + 1,5 sn ara. Eski kısa parçalı desen (0.4+0.2+0.4+2) düşük cihazda birleşip ~her saniye titriyordu.
const VIBRATE_PATTERN = [0, 1000, 1500];
const RING_TIMEOUT_MS = 30_000; // §8.2 — 30 sn cevapsız; §9.2.4'te "eski yanıt" eşiği olarak da kullanılır

let setupDone = false;

interface RingingCall {
  channelId: string;
  notificationId: string | null;
  /** C72: bildirimi native (Kotlin) çizdi, JS sahiplendi; kapatma `dismissNativeCall` ile. */
  native?: boolean;
  timeoutTimer: ReturnType<typeof setTimeout>;
  /** Uygulama-içi şerit yolunda bildirim KURULMAZ; o durumda null (bkz. `presentIncomingCall`). */
}

/**
 * 🔴 M4b §14.1 — çağrının türü. `'dm'` M4a'nın 1-1 daveti (`voice.incoming_call`), `'group'` grup
 * DM'in `voice.group_call_started`'ı. SUNUM aynı (aynı kanal, aynı zil, aynı iki düğme); ayrım
 * yalnız METİN ve SİNYAL'de:
 * - grupta kabul/reddet sunucuya GÖNDERİLMEZ. Sunucudaki `voice:call_accept`/`voice:call_reject`
 *   karşı tarafı `otherDmMember` ile buluyor; o fonksiyon "kendisi olmayan İLK üye"yi döndürüyor,
 *   yani grup kanalında hedef RASTGELE bir üye olurdu (yanlış kişinin ekranında "arama reddedildi").
 *   Arayan zaten odada; kimin reddettiğini bilmesi de gerekmiyor (§14.1).
 * - katılma `startOrJoin`e `kind: 'group'` ile gider (grup dalı — `voice:group_call_start` sinyali
 *   `invite:false` ile zaten atlanıyor, biz KATILANIZ, yeniden çaldıran taraf değil).
 */
type IncomingCallKind = 'dm' | 'group';

let current: RingingCall | null = null;

const REJECT_DEDUPE_MS = 10_000;
let lastReject: { channelId: string; at: number } | null = null;

/**
 * §9.2.2 — kanal + kategori kurulumu artık uygulama AÇILIŞINDA bir kez çağrılır (`(app)/_layout.tsx`,
 * `syncPushToken` ile aynı yer, oturum açıldıktan sonra). Push ile gelen bildirimi SİSTEM gösterir,
 * JS'e hiç uğramaz: kanal kurulu değilse ses/önem yanlış olur, kategori kurulu değilse Reddet/
 * Aramaya Katıl düğmeleri HİÇ çıkmaz. `presentIncomingCall` (WS yolu) da kendi güvenliği için çağırır
 * — idempotent (`setupDone`), mantık kopyalanmıyor, yalnız çağrı noktası eklendi.
 */
export async function ensureIncomingCallNotificationsSetup(): Promise<void> {
  if (setupDone) return;
  setupDone = true;

  // §9.2.1b — eski kanallar temizlenir. İdempotent: kanal zaten yoksa `deleteNotificationChannelAsync`
  // sessizce döner, ama savunmacı try/catch (kurulum akışı bir eski-kanal hatasıyla asla düşmesin).
  for (const oldChannelId of OLD_CHANNEL_IDS) {
    try {
      await Notifications.deleteNotificationChannelAsync(oldChannelId);
    } catch {
      // yoksay — zaten yoktu
    }
  }

  // §9.2.1 — ayrı ve YÜKSEK önemli kanal; M4a-1'in "Sesli arama sürüyor" bildirimi (native
  // `call-foreground-service` modülü, kendi kanalını Kotlin tarafında kurar) düşük önemli — ikisi
  // karışmaz, burası tamamen ayrı bir kanal kimliği. Kanalın artık GERÇEK bir sesi var (KANIT'in
  // gösterdiği tek değişken). `enableVibrate: true` + gerçek `vibrationPattern` BİLEREK: arka
  // planda/push'ta tek titreşim kaynağı bu; ön planda JS'in `Vibration.vibrate`'iyle KESİŞTİĞİ
  // (dosya başı yorumu) kabul edilmiş bir çakışma, çözülmüyor.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: t('mobile.call.incomingNotifChannel'),
    importance: Notifications.AndroidImportance.MAX,
    sound: CHANNEL_SOUND_FILE,
    enableVibrate: true,
    vibrationPattern: VIBRATE_PATTERN,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    // 🔴 SES AKIŞI (sahip cihaz turu 2026-08-07, v3→v4 sebebi): v3'te bu alan verilmiyordu, yani
    // ses VARSAYILAN olarak `NOTIFICATION` akışından çalıyordu. Android'de bildirim sesi çalarken
    // ses tuşuna basmak sesi SUSTURUR, seviyeyi ayarlamaz — sahip "sesi artıramıyorum, duruyor"
    // dedi. Gerçek arama uygulamaları zil akışını kullanır: `NOTIFICATION_RINGTONE` ses tuşunu
    // ZİL seviyesine bağlar ve ringer moduna (sessiz/DND) saygı davranışı AYNEN korunur — yani
    // D40'ı kapatan mekanizma bozulmuyor, yalnız doğru akışa taşınıyor.
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
  // Ön plan kanalı: yukarıdakiyle AYNI ses/titreşim/akış, yalnız önem DEFAULT — üstten inmez,
  // gölgeye düşer. Ayarlarda ikinci bir satır olarak görünür; bilinçli, kullanıcı zilin uygulama
  // açıkkenki halini ayrıca kısabilsin.
  await Notifications.setNotificationChannelAsync(FOREGROUND_CHANNEL_ID, {
    name: t('mobile.call.incomingNotifChannelForeground'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: CHANNEL_SOUND_FILE,
    enableVibrate: true,
    vibrationPattern: VIBRATE_PATTERN,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
  await Notifications.setNotificationChannelAsync(MISSED_CHANNEL_ID, {
    name: t('mobile.call.missedNotifChannel'),
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    { identifier: 'reject', buttonTitle: t('call.reject'), options: { opensAppToForeground: false } },
    { identifier: 'accept', buttonTitle: t('mobile.call.joinAction'), options: { opensAppToForeground: true } },
  ]);
}

/** §9.2.5 — bu kanal için ZATEN bir bildirim çalıyor mu? `push.ts`'teki global handler foreground'da
 *  gelen ikinci kopyayı (WS + push aynı anda) bastırmak için okur. */
export function isChannelRinging(channelId: string): boolean {
  // İki sunum yolu var (bildirim · izin kapalıyken uygulama-içi şerit) ve "bu kanal çalıyor mu"
  // sorusunun tek cevabı olmalı: aramaya bağlanınca zili susturan kural (dosya sonundaki voice
  // store aboneliği) da, yinelenen olayları eleyen kapı da buradan okuyor.
  return current?.channelId === channelId || useVoiceStore.getState().incomingCall?.channelId === channelId;
}

/**
 * `voice.incoming_call` (WS) alınınca çağrılır (`realtime/socket.ts`). Aynı kanal için ikinci bir
 * bildirim AÇILMAZ (M4a-1'in "yeniden giriş" dersi #2). Farklı bir kanaldan eş zamanlı ikinci bir
 * arama gelirse öncekinin yerini alır.
 */
export async function presentIncomingCall(
  channelId: string,
  caller: { id: string; username: string; avatarUrl: string | null },
  options?: { kind?: IncomingCallKind },
): Promise<void> {
  if (isChannelRinging(channelId)) return; // aynı çağrı — yinelenen event, no-op
  // Farklı bir kanaldan eş zamanlı ikinci arama: öncekinin yerini alır. Önceki hangi yolla
  // sunulmuşsa (bildirim ya da uygulama-içi şerit) ortak çıkıştan kapanır.
  const previous = current?.channelId ?? useVoiceStore.getState().incomingCall?.channelId ?? null;
  if (previous) await dismissIncomingCall(previous);

  // 🔴 İzin yoksa HİÇBİR sinyal verilmez (sahip kararı 2026-08-12, cihaz turu). Titreşim
  // `Vibration.vibrate` ile JS tarafından geliyor ve bildirim iznine BAĞLI DEĞİL: izin kapalıyken
  // bildirim hiç görünmüyor ama telefon titremeye devam ediyordu. Ortaya yüzü olmayan bir sinyal
  // çıkıyordu — kullanıcı neyin titreştiğini bilmiyor, susturacak bir düğme de yok (sahip bunu yeni
  // kurulumdan sonra yaşadı). Karar: kullanıcı bildirim istemediğini söylediyse uygulama sessiz kalır.
  //
  // Kabul edilen bedel: uygulama AÇIKKEN bile gelen çağrıdan haberin olmaz. Doğru çözüm ön plandayken
  // uygulamanın kendi kabul/reddet yüzeyini çizmesi (bildirim izni sistem bildirimlerini kapatır,
  // uygulamanın kendi ekranını değil) — yeni bir yüzey demek, ayrı bir işin konusu.
  /**
   * SUNUM KARARI (sahip kararı 2026-08-12) — iki eksen: uygulama önde mi, bildirim izni var mı.
   *
   *  | Uygulama | İzin | Sunum                                                        |
   *  |----------|------|--------------------------------------------------------------|
   *  | Önde     | Var  | Kendi şeridimiz + kanal sesi (bildirim kurulur, GÖRÜNMEZ)     |
   *  | Önde     | Yok  | Kendi şeridimiz, sessiz                                       |
   *  | Arkada   | Var  | Sistem bildirimi (bugünkü yol, kabul/reddet düğmeleriyle)     |
   *  | Arkada   | Yok  | Hiçbir şey                                                    |
   *
   * Neden ön planda kendi yüzeyimiz: bildirim penceresini Android çiziyor — düğmesi, süresi,
   * sırası bizim elimizde değil ve uygulamanın üstünü kapatıyor. Uygulama zaten açıkken bunu
   * kullanmak için sebep yok (Discord/WhatsApp da böyle ayırıyor).
   *
   * Ön planda bildirim yine de KURULUR (izin varsa): zil sesi kanalın kendi sesinden geliyor ve o
   * kanal `USAGE_NOTIFICATION_RINGTONE` ile kurulu, yani sessiz mod ve rahatsız etmeyin saygısını
   * bedavaya taşıyor. Kendi ses çalarımızı yazmak bu saygıyı elle taşımak demekti (M4a-2'de o yol
   * denenip bilinçle kaldırılmıştı). Görünmesini `push.ts` handler'ı bastırıyor — ses çalar,
   * banner düşmez, ekranda yalnız bizim şeridimiz kalır.
   *
   * Son satır ("arkada + izin yok → hiçbir şey") sabahki kararın kalanı: gösterecek bir yüzey
   * yokken titreşim vermek, kullanıcının neyin titreştiğini bilememesi demekti.
   */
  const permission = await Notifications.getPermissionsAsync();
  const foreground = AppState.currentState === 'active';

  if (foreground) {
    useVoiceStore.getState().setIncomingCall({
      channelId,
      callerName: caller.username,
      avatarUrl: caller.avatarUrl,
      isGroup: options?.kind === 'group',
    });
  } else if (!permission.granted) {
    return; // gösterecek yüzey yok → sessiz kal
  }

  const kind: IncomingCallKind = options?.kind ?? 'dm';

  // C72: arka planda native servis bildirimi JS'ten önce çizmiş olabilir. Varsa ikinci bildirim kurma, sahiplen
  // (kanal titreşimi zaten çalıyor: JS titreşimi de yok, çift titreşim olmasın).
  if (!foreground && (await isNativeCallShowing(channelId))) {
    const timeoutTimer = setTimeout(() => {
      void dismissIncomingCall(channelId);
    }, RING_TIMEOUT_MS);
    current = { channelId, notificationId: null, native: true, timeoutTimer };
    return;
  }

  const notificationId = permission.granted
    ? await scheduleRingNotification(channelId, caller, kind, foreground)
    : null;

  const timeoutTimer = setTimeout(() => {
    void dismissIncomingCall(channelId); // §8.2 — 30 sn cevapsız, YALNIZ yerel temizlik (WS'e bir şey gönderilmez)
  }, RING_TIMEOUT_MS);

  current = { channelId, notificationId, timeoutTimer };
  // §9.2.1 — izin varsa kanalın kendi sesi çalıyor; titreşim ayrıca JS'ten (ringer modundan
  // bağımsız çalıştığı M4a-2'de doğrulandı). İzin yokken tek sinyal titreşim ama artık ekranda
  // onu açıklayan bir şerit var — "yüzü olmayan sinyal" kuralı korunuyor.
  Vibration.vibrate(VIBRATE_PATTERN, true);
}

/**
 * Zil bildirimini kurar ve kimliğini döner. `presentIncomingCall`ten AYRILDI çünkü artık koşullu:
 * ön planda yalnız SES için kuruluyor (görünmesini `push.ts` bastırıyor), arka planda ise tek
 * sunum yüzeyi bu. İçeriği değişmedi, satır satır taşındı.
 */
async function scheduleRingNotification(
  channelId: string,
  caller: { id: string; username: string; avatarUrl: string | null },
  kind: IncomingCallKind,
  foreground: boolean,
): Promise<string> {
  await ensureIncomingCallNotificationsSetup();
  const isGroup = kind === 'group';
  return Notifications.scheduleNotificationAsync({
    content: {
      // §14.1 — "bildirim metni grubu belli etmeli": 1-1'de "Gelen Arama / <ad> seni arıyor!",
      // grupta "Grup Araması / <ad> grup aramasına başladı". Grubun ADI metne girmiyor: sunucunun
      // `voice.group_call_started` yükü yalnız `{ channelId, by }` taşıyor, grup adı istemcide
      // türetiliyor (`channelTitle`) ve DM listesi henüz yüklenmemişken (soğuk açılış) boş çıkardı —
      // yanlış/eksik bir başlık yerine kimin başlattığı yeterli bilgi.
      title: isGroup ? t('mobile.call.incomingGroupTitle') : t('mobile.call.incomingTitle'),
      body: isGroup
        ? t('mobile.call.incomingGroupBody', { name: caller.username })
        : t('mobile.call.incomingBody', { name: caller.username }),
      // 🔴 PM bulgusu (2026-08-07, ikinci tur) — `source: 'ws'` BİLEREK eklendi. `push.ts`'in
      // bastırma kontrolü (§9.2.5) `isChannelRinging(channelId)`e bakıyordu ama bu, `current`
      // state'i `scheduleNotificationAsync` çözüldükten SONRA (senkron, aynı satır bloğunda) yazılıyor
      // — handler ise native köprüden bir sonraki tick'te çağrılıyor. Yani KENDİ ürettiğimiz bu
      // bildirim bile `isChannelRinging` sorusuna `true` yanıtı buluyor ve kendi kendini bastırıyordu
      // (titreşim vardı çünkü o handler'dan bağımsız, ama banner/liste/ses tamamen gitmişti — sahip
      // cihazda gördü). `api/`nin push payload'ı ve bu yerel bildirim AYNI `data.type`/`channelId`
      // taşıyor (o gün "birebir aynı yap" doğru görünmüştü, ayırt etmeyi imkânsız kıldı). `source`
      // BUNUN İÇİN VAR: yalnız bu dosyanın ürettiği bildirimde bulunur, `api/` payload'ında YOK (ve
      // eklenmeyecek — `api/` diffi sıfır kalmalı). `push.ts` handler'ı artık `source !== 'ws'`
      // ŞARTINI da arıyor, kendi bildirimimiz zamanlamadan bağımsız her zaman geçiyor.
      data: {
        type: NOTIFICATION_DATA_TYPE,
        channelId,
        callerId: caller.id,
        callerName: caller.username,
        source: 'ws',
        // §14.1 — yanıt işleyicisi (soğuk açılışta bile) yalnız bu yükü görür; kabul/reddetin
        // sinyal göndermeyeceğini buradan bilir. `api/`nin push yükünde bu alan YOK → `undefined`
        // → 'dm' varsayılanı, yani 1-1 push yolu DEĞİŞMEDİ (`api/` diffi sıfır kalır).
        callKind: kind,
      },
      categoryIdentifier: CATEGORY_ID,
      // §9.2.1 — `sound` alanı BİLEREK verilmiyor: Android, kanalın kendi gömülü sesini kullanır
      // (M4a-2'de burada `sound: false` vardı, zil `expo-audio`'dan geliyordu — o yol kaldırıldı).
      priority: Notifications.AndroidNotificationPriority.MAX,
      // Gövdeye dokunma yalnız DM'e götürür (§8.2) — bildirim otomatik SİLİNMEZ, kullanıcı hâlâ
      // Reddet/Aramaya Katıl'a basabilmeli (kabul/reddet/zaman aşımı/iptal `dismissIncomingCall`
      // ile elle kaldırıyor — tek kapanış noktası, dosya başı yorumu).
      autoDismiss: false,
    },
    // 🔴 KRİTİK DÜZELTME (emülatör doğrulaması sırasında bulundu, 2026-08-07) — `trigger: null`
    // "hemen gönder" gibi görünüyor ama Android tarafında `BaseNotificationBuilder.channelId`
    // (`expo-notifications` native kaynağı) trigger'ı OKUYARAK kanal kimliğini bulur; `trigger`
    // JS `null` gelince native `trigger == null` dalına düşer ve HER ZAMAN
    // `expo_notifications_fallback_notification_channel`e (kütüphanenin kendi varsayılan kanalı,
    // IMPORTANCE_HIGH ama BİZİM sesimiz/titreşimimiz/görünürlüğümüz YOK) düşer — `CHANNEL_ID`
    // (`incoming_call_v3`) HİÇ KULLANILMAZ. Bu M4a-2'den beri (`trigger: null` o zaman da vardı)
    // sessizce yanlıştı; logcat'te "Couldn't get channel for the notifications - trigger is 'null'.
    // Fallback to '...' channel" satırıyla yakalandı. Doğru "hemen gönder" şekli
    // `ChannelAwareTriggerInput` (`{ channelId: string }`) — kanalı taşıyan, gecikmesiz trigger.
    trigger: { channelId: foreground ? FOREGROUND_CHANNEL_ID : CHANNEL_ID },
  });
}

/** Dört bitiş yolunun (kabul · reddet · zaman aşımı · arayan iptal) ORTAK çıkışı. */
export async function dismissIncomingCall(channelId: string): Promise<void> {
  // Uygulama-içi şerit de bu ortak çıkıştan kapanır: kabul · reddet · zaman aşımı · arayanın
  // iptali, dördü de buraya uğruyor.
  if (useVoiceStore.getState().incomingCall?.channelId === channelId) {
    useVoiceStore.getState().setIncomingCall(null);
  }
  if (current?.channelId === channelId) {
    clearTimeout(current.timeoutTimer);
    const { notificationId, native } = current;
    current = null;
    Vibration.cancel();
    if (native) await dismissNativeCall(channelId).catch(() => undefined);
    if (notificationId) {
      try {
        await Notifications.dismissNotificationAsync(notificationId);
      } catch {
        // yoksay — bildirim zaten kullanıcı tarafından temizlenmiş olabilir
      }
    }
  }

  // 🔴 M5g §3 — EK OLARAK, bu kanalın EKRANDA duran BÜTÜN "Gelen Arama" bildirimleri kapatılır.
  // `current` yalnız bu modülün WS yolundan kurduğu TEK bildirimi biliyor; FCM push'un kurduğu
  // kopya (§0.B — ön planda iki bildirim yarışıyor) `current` ile hiç eşleşmiyordu ve iptal gelse
  // bile çalmaya devam ediyordu. `source` (WS/FCM) fark etmez — `clearStaleIncomingCallNotifications`
  // teki tarama deseni örnek alınır, hata yutulur. Bu tarama YUKARIDAKİ `current` denetiminden
  // BİLEREK bağımsız çalışır: arka planda `current` hiç dolmamış olabilir (§0.C, bildirimi FCM
  // kurduysa), o durumda bile push kopyası kapatılmalı.
  // `void` ile çağrılan yerler var (socket.ts, zaman aşımı): liste okunamazsa hata YUTULUR,
  // yakalanmamış rejection'a dönüşmez.
  let presented: Notifications.Notification[];
  try {
    presented = await Notifications.getPresentedNotificationsAsync();
  } catch {
    return;
  }
  const matches = presented.filter((n) => {
    const data = n.request.content.data as Record<string, unknown> | undefined;
    return data?.type === NOTIFICATION_DATA_TYPE && data?.channelId === channelId;
  });
  await Promise.all(
    matches.map((n) =>
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {
        // yoksay — bildirim zaten kullanıcı tarafından temizlenmiş olabilir
      }),
    ),
  );
}

/**
 * §9.2.5 — "arayan iptal ettiyse bildirim kendiliğinden kaybolur" WS yolunda `voice.call_canceled`
 * ile çalışıyor (`realtime/socket.ts` → `dismissIncomingCall`). Uygulama ARKA PLANDAYKEN iptal olursa
 * (soket kapalı, JS o event'i hiç görmedi) tray'de asılı bir "Gelen Arama" kalabilir — iptal push'ı
 * YOK (data-only push Android'de güvenilir değil). Bunun yerine uygulama ön plana her dönüşünde
 * ARTIK aktif olmayan (bizim `current`'ımızla eşleşmeyen) `incoming_call` bildirimleri temizlenir.
 * 30 sn'lik `ttl` zaten geç düşen push'ı server tarafında eliyor, bu da kalan asılı kayıtları siler.
 */
async function clearStaleIncomingCallNotifications(): Promise<void> {
  // C72: JS'in sahiplendiği dışındaki native arama bildirimleri de bayattır.
  await dismissNativeCalls(current?.native ? current.channelId : null).catch(() => undefined);
  const presented = await Notifications.getPresentedNotificationsAsync();
  const stale = presented.filter((n) => {
    const data = n.request.content.data as Record<string, unknown> | undefined;
    if (data?.type !== NOTIFICATION_DATA_TYPE) return false;
    return n.request.identifier !== current?.notificationId;
  });
  await Promise.all(
    stale.map((n) =>
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {
        // yoksay — zaten kullanıcı tarafından temizlenmiş olabilir
      }),
    ),
  );
}

/**
 * Kök layout'ta BİR KEZ mount edilir (`_layout.tsx`, `usePushNotificationResponder` ile aynı yer).
 * Reddet/Aramaya Katıl eylemleri ve gövde dokunuşu burada çözülür.
 *
 * 🔴 M4a-3 §9.2.3 — soğuk açılış zinciri artık `useGatedNotificationResponder` ile: uygulama ölüyken
 * "Aramaya Katıl"a basılırsa `getLastNotificationResponse()` navigasyon HAZIR ve auth 'booting'
 * DEĞİLKEN işlenir (`push.ts`teki KUSUR 1/2 düzeltmesiyle aynı desen, kopya değil — bkz.
 * `notifications/responseGate.ts`). Oturum kapalıysa (`unauthenticated`) sürpriz atlama yok, gate
 * kendisi düşürür. Katılmadan önce soket hazır olması `callAccept`/`emitCallSignal`'in zaten
 * `ensureSocket()` kullanmasıyla garanti (2cdd1d3 dersi, `realtime/socket.ts`).
 */
/**
 * Reddetme kuralı — İKİ sunum yolunun ortak uygulaması (bildirim düğmesi · uygulama-içi şerit).
 * §14.1: grupta reddet YALNIZ YEREL, sunucuya hiçbir şey gitmez (`voice:call_reject` grupta
 * rastgele bir üyeye giderdi). 1-1'de sinyal gönderilir.
 */
export function rejectIncomingCall(channelId: string, isGroup: boolean): Promise<void> {
  void resolveNativeCall(channelId); // C73: yanıt verildi, cevapsız düşmez
  void dismissIncomingCall(channelId);
  if (isGroup) return Promise.resolve();
  // C53: arka plan görevi ve bildirim yanıtı dinleyicisi AYNI JS ortamında aynı reddi iki kez
  // getirebilir; kısa pencerede ikinci sinyal atlanır.
  const now = Date.now();
  if (lastReject?.channelId === channelId && now - lastReject.at < REJECT_DEDUPE_MS) {
    return Promise.resolve();
  }
  lastReject = { channelId, at: now };
  // Tek fonksiyon, iki yol: soket bağlıysa soketle, değilse (uygulama kapalı/arka plan) HTTP ile.
  if (isSocketConnected()) {
    callReject(channelId);
    return Promise.resolve();
  }
  // C72: headless Reddet görevi HTTP bitene kadar beklesin diye söz döner (diğer çağıranlar yok sayar).
  return rejectOverHttp(channelId);
}

async function rejectOverHttp(channelId: string): Promise<void> {
  try {
    if (!getAccessToken()) await refreshAccessToken();
    await voiceApi.rejectCall(channelId);
  } catch {
    lastReject = null; // sonraki yol (bekleyen yanıt dinleyicisi) yeniden deneyebilsin
    // Kullanıcı reddetmek istedi: zil zaten kapandı; sunucuya ulaşılamadıysa arayan zaman aşımını bekler.
  }
}

/**
 * Kabul kuralı — İKİ sunum yolunun ortak uygulaması. Davet KESİNLİKLE gönderilmez (`invite: false`):
 * arayan zaten odada, biz yalnız katılıyoruz. Grupta kabul de sunucuya gitmez (reddetle aynı
 * `otherDmMember` gerekçesi). Bu gövde bildirim yanıtı işleyicisinden BURAYA taşındı, ikinci kez
 * yazılmadı — aynı kuralın iki tüketicisi var, iki ayrı kopyası değil.
 */
export function acceptIncomingCall(channelId: string, callerName: string, isGroup: boolean): void {
  void resolveNativeCall(channelId); // C73: yanıt verildi, cevapsız düşmez
  void dismissIncomingCall(channelId);
  if (!isGroup) callAccept(channelId);
  // Grupta arama ekranının başlığı grubun adı olmalı; ad DM store'undan gelir (bildirim yükünde yok),
  // store henüz yüklenmemişse başlatanın adına düşer.
  const groupChannel = isGroup ? useDmStore.getState().channels.find((c) => c.id === channelId) : undefined;
  const label = groupChannel ? channelTitle(groupChannel) : callerName;
  void useVoiceStore
    .getState()
    .startOrJoin(channelId, label, { invite: false, kind: isGroup ? 'group' : 'dm' })
    .then((res) => {
      if (res.ok) {
        router.push({ pathname: '/call', params: { channelId } });
        return;
      }
      if (res.reason === 'mic_denied') {
        Alert.alert(res.message ?? t('common.error'), undefined, [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('mobile.call.micPermissionSettings'), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      if (res.message) Alert.alert(res.message);
    });
}

export function useIncomingCallResponder(): void {
  useGatedNotificationResponder((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    if (data?.type !== NOTIFICATION_DATA_TYPE) return;
    const channelId = typeof data.channelId === 'string' ? data.channelId : null;
    if (!channelId) return;
    const callerName = typeof data.callerName === 'string' ? data.callerName : '';
    const isGroup = data.callKind === 'group';

    if (response.actionIdentifier === 'reject') {
      // §9.2.4 🔴 — reddet uygulama ölüyken sinyal GÖNDEREMEZ (yeni JS başlatılmıyor); bu dal yalnız
      // GEÇ işlenen (soğuk açılış üzerinden gelen) bir reddi görür. Yanıt üzerinden 30 sn'den fazla
      // geçtiyse "alakasız eski arama reddedildi" sınıfı kusuru önlemek için sinyal DENENMEZ, yalnız
      // yerel temizlik yapılır (zaten no-op: `current` soğuk açılışta null).
      const age = Date.now() - response.notification.date;
      // Yanıt 30 sn'den eskiyse (soğuk açılıştan gelen geç yanıt) sinyal DENENMEZ, yalnız yerel
      // temizlik yapılır — "alakasız eski arama reddedildi" kusurunu önleyen kural, yalnız bu
      // yola özgü olduğu için ortak `rejectIncomingCall`ın DIŞINDA duruyor.
      if (age > RING_TIMEOUT_MS) {
        void dismissIncomingCall(channelId);
        return;
      }
      rejectIncomingCall(channelId, isGroup);
      return;
    }

    if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      // §8.2 — gövdeye dokunma yalnız DM'e götürür; arama ekranı AÇILMAZ, zil de durmaz
      // (kullanıcı henüz kabul/reddetmedi).
      router.push(dmTarget(channelId));
      return;
    }

    if (response.actionIdentifier === 'accept') {
      acceptIncomingCall(channelId, callerName, isGroup);
    }
  });

  // §9.2.5 — asılı bildirim temizliği: her ön plana dönüşte VE mount anında (uygulama az önce
  // arka plandan/ölüden açıldıysa da aynı temizlik geçerli olsun diye).
  // C72: native arama bildiriminden Katıl / gövdeye dokunma (soğuk açılışta da buradan, aynı kapı).
  useGatedCallAction((action) => {
    if (action.action === 'accept') {
      acceptIncomingCall(action.channelId, action.callerName, action.isGroup);
      return;
    }
    router.push(dmTarget(action.channelId));
  });

  useEffect(() => {
    void clearStaleIncomingCallNotifications();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void clearStaleIncomingCallNotifications();
    });
    return () => sub.remove();
  }, []);

  /**
   * 🔴 Kusur duzeltmesi (sahip bulgusu 2026-08-12, cihaz turu): zil, aramaya BASKA bir kapidan
   * girildiginde calmaya devam ediyordu. Bugune kadar dort bitis yolu vardi (kabul, reddet, zaman
   * asimi, arayanin iptali) ve dordu de bildirimin KENDI dugmelerinden ya da WS olayindan geciyordu;
   * DM ekranindaki "Katil" dugmesi ise dogrudan odaya baglaniyor, zilin haberi olmuyordu. Sahip bunu
   * bildirim izni kapaliyken buldu: bildirim hic gorunmedigi icin tek sinyal titresimdi ve titresimi
   * durduracak dugme de ekranda yoktu.
   *
   * Duzeltme kapiya degil KURALA baglandi: calan kanala baglandiysak zil susar. Bugunku "Katil"
   * dugmesi de, sonradan eklenecek baska bir giris yolu da kendiliginden kapsanir.
   *
   * Abonelik artik modul seviyesinde DEGIL, bu hook'un (kok layout'ta bir kez mount edilir)
   * kendi `useEffect`i icinde kuruluyor, donuste `unsubscribe` ediliyor (D70, M5g §1 - oncesinde
   * burada, dosya import edilir edilmez, React yasam donguesunden bagimsiz calisiyordu). Davranis
   * BIREBIR ayni kaliyor, yalniz kurulum zamani degisti. Ters yon (voice store'un bu modulu import
   * etmesi) bilincli olarak secilmedi - `incomingCall.ts` zaten voice store'u import ediyor, o yon
   * dongu kurardi (ayni gerekce `stores/dm.ts` friends notunda).
   */
  useEffect(() => {
    const unsubscribe = useVoiceStore.subscribe((state, prev) => {
      const channelId = state.connectedChannelId;
      if (!channelId || channelId === prev.connectedChannelId) return;
      if (!isChannelRinging(channelId)) return;
      void dismissIncomingCall(channelId);
    });
    return unsubscribe;
  }, []);
}
