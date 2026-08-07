import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { notificationsApi } from '@/api/notifications';
import { resolvePushTarget } from '@/utils/pushNavigation';
import { isChannelRinging } from '@/notifications/incomingCall';
import { useGatedNotificationResponder } from '@/notifications/responseGate';

/**
 * Sprint M3 §3 — mobil push istemci ayağı.
 *
 * Ön plan bildirimi bastırılır (contract §3 "uygulama ön plandayken push banner'ı gösterilmez —
 * kullanıcı zaten içeride, rozetler var"). `shouldShowList: true` bırakıldı: bildirim sistem
 * geçmişinde/merkezinde kalabilir, yalnız anlık drop-down/ses ASILMAZ. Modül yüklenir yüklenmez
 * BİR KEZ ayarlanır — React yaşam döngüsüne bağlı değil (Expo'nun kendi önerdiği kalıp).
 *
 * 🔴 M4a-2 istisnası (sözleşme §8.2) — `expo-notifications` global TEK bir handler kabul ediyor,
 * push ile gelen arama bildirimi aynı fonksiyondan geçiyor. Gelen arama bildirimi (`notifications/
 * incomingCall.ts`, `data.type === 'incoming_call'`) uygulama ön plandayken de ÜSTTE (heads-up)
 * görünmeli — sözleşme bunu açıkça istiyor ("Discord'un yaptığı gibi").
 *
 * 🔴 M4a-3 (sözleşme §9.2.1 + §9.2.5) — zil artık kanal sesi (bkz. `incomingCall.ts` CHANNEL_ID),
 * `shouldPlaySound: true` gelen arama için: hem WS'in yerel bildirimi hem foreground'da gelen push
 * bu yolu paylaşıyor, ikisi de kanalın gömülü sesini çalsın. `data.channelId` için ZATEN bir bildirim
 * çalıyorsa (`isChannelRinging`, `incomingCall.ts`) bu ikinci kopya TAMAMEN bastırılır (banner/liste/
 * ses hiçbiri çıkmaz) — sahip cihaz turunda (2026-08-07) görülen "iki 'Gelen Arama' kartı yan yana"
 * kusuru budur (WS yolu + push aynı anda, `api/` M4a-3 ile push ayağı bugün canlıya girdi).
 *
 * 🔴 REGRESYON DÜZELTMESİ (PM bulgusu, 2026-08-07 ikinci tur) — bastırma koşulu YALNIZ
 * `isChannelRinging` iken KENDİ ürettiğimiz bildirimi de bastırıyordu: `incomingCall.ts`
 * `presentIncomingCall`'da `current` state'i `scheduleNotificationAsync` çözüldükten hemen sonra
 * SENKRON yazılıyor, ama BU handler native köprüden bir SONRAKİ tick'te çağrılıyor — yani kendi
 * bildirimimiz değerlendirildiğinde `current` çoktan doluydu, `isChannelRinging(channelId)` `true`
 * dönüyordu ve WS'in TEK bildirimi de sessizce yutuluyordu (titreşim vardı çünkü o ayrı bir yoldan,
 * `Vibration.vibrate` ile geliyor — semptom birebir buydu: "titriyor ama bildirim yok"). `api/`nin
 * push payload'ı ve bu yerel bildirim AYNI `data.type`/`data.channelId` taşıdığı için ikisini ayırt
 * etmenin başka yolu yoktu. Çözüm: `incomingCall.ts` kendi ürettiği bildirime `data.source: 'ws'`
 * damgası basıyor, `api/` payload'ında bu alan YOK (ve eklenmeyecek). Bastırma artık YALNIZ
 * `source !== 'ws'` (yani "bu push, bizim yerel bildirimimiz değil") VE `isChannelRinging` ikisi
 * birden doğruyken tetikleniyor — kendi bildirimimiz zamanlamadan bağımsız her zaman geçer.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const isIncomingCall = data?.type === 'incoming_call';
    if (isIncomingCall) {
      const channelId = typeof data?.channelId === 'string' ? data.channelId : null;
      const isOwnLocalNotification = data?.source === 'ws';
      if (channelId && !isOwnLocalNotification && isChannelRinging(channelId)) {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
    }
    return {
      shouldShowBanner: isIncomingCall,
      shouldShowList: true,
      shouldPlaySound: isIncomingCall,
      shouldSetBadge: false,
    };
  },
});

// Son başarıyla alınan/kaydedilen token — çıkışta DELETE'e taşınır (§3: "Çıkışta DELETE çağrılır").
// Modül seviyesinde tutulur (auth store deseniyle aynı gerekçe: `stores/auth.ts` `bootstrapPromise`
// yorumuna bkz. — render'a bağlı olmaması gerekiyor, store state'i olmasına gerek yok).
let registeredToken: string | null = null;

async function readExpoPushToken(): Promise<string | null> {
  // Emülatörde/simülatörde push token alınamaz — contract §3 "sessizce geç, uygulama çalışsın".
  if (!Device.isDevice) return null;

  // İzin akışı: oturum açıldıktan sonra (çağıran taraf — `(app)/_layout.tsx` — bunu garanti eder),
  // açılışta DEĞİL. Zaten reddedilmişse (`canAskAgain === false`) yeniden SORULMAZ — contract'ın
  // "ısrarlı ikinci sorma yok" kuralı: OS'un kendi "bir daha sorma" bayrağına saygı duyulur.
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted' && current.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    // Android 8+'ta kanal olmadan bildirim sessizce (heads-up olmadan) düşebilir. Sistem
    // varsayılanı (§1 OUT — özel ses/titreşim YOK), tek bir "default" kanal yeterli.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // app.json'daki `extra.eas.projectId` — hardcode YOK (contract §3).
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string' || projectId.length === 0) return null;

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

/** Token al + sunucuya kaydet. Her adım sessiz hata yutar (§2.3 ilkesiyle aynı ruh: bildirim
 *  altyapısı ana akışı ASLA bloke etmez) — izin yoksa/ağ hatasıysa uygulama normal çalışmaya devam eder. */
export async function syncPushToken(): Promise<void> {
  try {
    const token = await readExpoPushToken();
    if (!token) return;
    registeredToken = token;
    await notificationsApi.registerPushToken({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      deviceName: Device.deviceName ?? undefined,
    });
  } catch {
    // sessiz — bkz. yukarıdaki not
  }
}

/** Çıkışta çağrılır (contract §3 "Çıkışta DELETE çağrılır — yoksa cihazı bırakan kullanıcının
 *  bildirimleri gelmeye devam eder"). Token hiç alınmadıysa no-op. */
export async function clearPushToken(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await notificationsApi.deletePushToken(token);
  } catch {
    // sessiz — `stores/auth.ts` logout() ile aynı desen: sunucu hatası yerel akışı durdurmaz
  }
}

function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as Record<string, unknown>;
  const target = resolvePushTarget(data);
  // Hedef çözülemiyorsa yalnız uygulamayı aç (§3) — router.push ÇAĞRILMAZ, zaten açık olan
  // ekranda kalınır (kırık navigasyon vaat etme).
  if (target) router.push(target);
}

/**
 * Bildirime dokunma → yönlendirme. Kök layout'ta BİR KEZ mount edilir (oturumdan bağımsız —
 * dokunuş uygulama kapalıyken/arka plandayken de gelebilir). Soğuk açılış (`getLastNotificationResponse`)
 * DE kontrol edilir: DoD'daki "uygulama kapalıyken bahsedilince bildirim geliyor, dokununca doğru
 * kanala gidiyor" tam olarak bu senaryo.
 *
 * KUSUR 1/KUSUR 2 düzeltmesi (M3 sonrası, sahip bulgusu — cihazda dev build testi): navigasyon
 * container mount olmadan / auth bootstrap bitmeden gelen soğuk-açılış yanıtını bekletme deseni artık
 * `notifications/responseGate.ts`'te (`useGatedNotificationResponder`) — M4a-3 sözleşme §9.2.3 ile
 * `useIncomingCallResponder` (`incomingCall.ts`) AYNI problemi paylaştığı için oraya çıkarıldı.
 * Ayrıntılı iki kusurun tam anlatımı o dosyanın başındaki yorumda.
 */
export function usePushNotificationResponder(): void {
  useGatedNotificationResponder(handleNotificationResponse);
}
