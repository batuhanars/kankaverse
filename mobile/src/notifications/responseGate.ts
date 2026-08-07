import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigationContainerRef } from 'expo-router';
import { useAuthStore } from '@/stores/auth';

/**
 * Sprint M3 §3 (`notifications/push.ts` KUSUR 1/KUSUR 2 düzeltmesi) ile aynı problemin ortak
 * çekirdeği, M4a-3 sözleşme §9.2.3'e göre buraya çıkarıldı.
 *
 * Soğuk açılışta `getLastNotificationResponse()` kök layout'un İLK render'ında, native navigasyon
 * container'ı henüz mount OLMADAN ve/veya oturum bootstrap'i (`stores/auth.ts`) henüz sonuçlanmadan
 * döner:
 *  - Navigasyon hazır değilken `router.push` çağırmak expo-router'ın kendi hata ekranını tetikler
 *    (`assertIsReady()` / `navigationRef.isReady()`).
 *  - Navigasyon hazır ama oturum hâlâ 'booting' iken flush edilirse, bir sonraki render'da
 *    `(app)/_layout.tsx`'teki auth guard (`status !== 'authenticated'` → `/login`) bizim
 *    yönlendirmemizi EZER — bootstrap sonradan 'authenticated'e dönse bile geri dönüş yok.
 *
 * Çözüm: yanıt, navigasyon HAZIR ve auth 'booting' DEĞİLKEN teslim edilir; 'unauthenticated'sa
 * (geçerli oturum yok) yanıt sessizce DÜŞÜRÜLÜR — kullanıcı elle giriş yaptığında beklenmedik
 * biçimde eski bir hedefe atlamasın diye.
 *
 * `usePushNotificationResponder` (mesaj/etkinlik push'ları) ve `useIncomingCallResponder` (M4a-3,
 * gelen arama bildirimi) AYNI problemi paylaşıyor — Rule of Three'ye bakılmadan buraya çıkarıldı
 * (sözleşme §9.2.3: "iki yer aynı deseni gerektiriyorsa ortak bir yardımcıya çıkar, bu ikinci değil
 * AYNI problem").
 */
export function useGatedNotificationResponder(
  onResponse: (response: Notifications.NotificationResponse) => void,
): void {
  const navigationRef = useNavigationContainerRef();
  // Çağıranın her render'da yeni bir fonksiyon geçirmesi effect'i yeniden kurmasın diye ref'te
  // tutulur; abonelik yalnız `navigationRef` değişince yeniden kurulur (aşağıdaki push.ts/
  // incomingCall.ts'teki gibi genelde hiç değişmez).
  const onResponseRef = useRef(onResponse);
  onResponseRef.current = onResponse;

  useEffect(() => {
    let pending: Notifications.NotificationResponse | null = null;

    const tryFlush = () => {
      if (!pending) return;
      if (!navigationRef.isReady()) return;

      const status = useAuthStore.getState().status;
      if (status === 'booting') return; // oturum kararı henüz yok — auth guard bizi ezer, bekle

      if (status === 'unauthenticated') {
        // Oturum yok — kullanıcı elle giriş yapacak, eski hedefe sürpriz atlama YOK.
        pending = null;
        return;
      }

      const response = pending;
      pending = null;
      onResponseRef.current(response);
    };

    const respond = (response: Notifications.NotificationResponse) => {
      pending = response;
      tryFlush();
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(respond);
    // 'ready' — react-navigation'ın NavigationContainer gerçekten mount olduğunda ATEŞLEDİĞİ event;
    // `assertIsReady()`'nin baktığı `isReady()` ile aynı andan hemen sonra gelir.
    const unsubscribeReady = navigationRef.addListener('ready', tryFlush);
    // `useAuthStore`'un vanilla `subscribe`'ı: 'booting' → 'authenticated'/'unauthenticated' geçişini
    // React render döngüsüne bağlı olmadan yakalar (bu bir hook değil, effect içinde plain subscribe).
    const unsubscribeAuth = useAuthStore.subscribe(tryFlush);

    // expo-notifications birden çok `addNotificationResponseReceivedListener` abonesini destekler
    // (her ikisi de aynı native event'i alır); `getLastNotificationResponse()` bir GETTER'dır,
    // tüketmez — push.ts ve incomingCall.ts kendi filtrelerine göre aynı soğuk-açılış yanıtını
    // BAĞIMSIZ olarak burada işleyebilir, çakışma olmaz (her biri kendi `data.type`'ını süzer).
    const last = Notifications.getLastNotificationResponse();
    if (last) respond(last);

    return () => {
      responseSubscription.remove();
      unsubscribeReady();
      unsubscribeAuth();
    };
  }, [navigationRef]);
}
