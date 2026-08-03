import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { notificationsApi } from '@/api/notifications';
import { resolvePushTarget } from '@/utils/pushNavigation';

/**
 * Sprint M3 §3 — mobil push istemci ayağı.
 *
 * Ön plan bildirimi bastırılır (contract §3 "uygulama ön plandayken push banner'ı gösterilmez —
 * kullanıcı zaten içeride, rozetler var"). `shouldShowList: true` bırakıldı: bildirim sistem
 * geçmişinde/merkezinde kalabilir, yalnız anlık drop-down/ses ASILMAZ. Modül yüklenir yüklenmez
 * BİR KEZ ayarlanır — React yaşam döngüsüne bağlı değil (Expo'nun kendi önerdiği kalıp).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
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
 */
export function usePushNotificationResponder(): void {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    const last = Notifications.getLastNotificationResponse();
    if (last) handleNotificationResponse(last);
    return () => subscription.remove();
  }, []);
}
