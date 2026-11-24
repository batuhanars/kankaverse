import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNavigationContainerRef } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import {
  addCallActionListener,
  addConversationTapListener,
  getInitialCallAction,
  getInitialConversationTap,
  type CallAction,
  type ConversationTap,
} from '../../modules/conversation-notification';

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
  useGatedDelivery<Notifications.NotificationResponse>((deliver) => {
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(deliver);
    // expo-notifications birden çok `addNotificationResponseReceivedListener` abonesini destekler;
    // `getLastNotificationResponse()` bir GETTER'dır, tüketmez — push.ts ve incomingCall.ts kendi
    // filtrelerine göre aynı soğuk-açılış yanıtını BAĞIMSIZ işler, çakışma olmaz.
    const last = Notifications.getLastNotificationResponse();
    if (last) deliver(last);
    return () => responseSubscription.remove();
  }, onResponse);
}

/**
 * C50: yerel sohbet bildirimine (native modül) dokunma, aynı kapıdan geçer. Soğuk açılış
 * `getInitialConversationTap`, sıcak dokunma modül olayı; uygulama öne gelince de bir kez daha
 * bakılır (activity yeniden oluşmuşsa olay kaçmış olabilir). Native taraf intent ekstralarını
 * tükettiği için aynı dokunuş iki kez gelmez.
 */
/**
 * C52 cihaz turu kök nedeni: yerel (Kotlin) sohbet bildirimi expo bildirimi değildir;
 * `getLastNotificationResponse()` boş döner ve açılış ekranı (`app/index.tsx`) "kaldığın yerden aç"
 * kaydını sürdürüp tap'in `router.push`ının ÜSTÜNE `router.replace` yapıyordu. Dokunuş görülünce bu
 * bayrak açılır; açılış ekranı kaydı sürdürmez (bildirimle açılışta v1 ile aynı davranış).
 */
let nativeTapSeen = false;
export function hasNativeConversationTap(): boolean {
  return nativeTapSeen;
}

export function useGatedConversationTap(onTap: (tap: ConversationTap) => void): void {
  useGatedDelivery<ConversationTap>((deliver) => {
    // C52: native ayni dokunusu hem olay hem getInitialTap ile verebilir; tapId ile bir kez islenir.
    let lastTapId: number | undefined;
    const deliverOnce = (source: string) => (tap: ConversationTap) => {
      if (tap.tapId !== undefined && tap.tapId === lastTapId) {
        return;
      }
      lastTapId = tap.tapId;
      nativeTapSeen = true;
      deliver(tap);
    };
    const unsubscribeTap = addConversationTapListener(deliverOnce('event'));
    const deliverInitial = deliverOnce('initial');
    const checkInitial = () => {
      const initial = getInitialConversationTap();
      if (initial) deliverInitial(initial);
    };
    checkInitial();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkInitial();
    });
    return () => {
      unsubscribeTap();
      appState.remove();
    };
  }, onTap);
}

/**
 * C72: native arama bildirimindeki Katıl / gövdeye dokunma, aynı kapıdan geçer (oturum hazır olmadan
 * katılma denenmez). `useGatedConversationTap` ile aynı desen: soğuk açılış `getInitialCallAction`, sıcak
 * olay modül olayı, öne gelince bir kez daha bakılır; `tapId` ile tekilleştirilir.
 */
export function useGatedCallAction(onAction: (action: CallAction) => void): void {
  useGatedDelivery<CallAction>((deliver) => {
    let lastTapId: number | undefined;
    const deliverOnce = (action: CallAction) => {
      if (action.tapId !== undefined && action.tapId === lastTapId) return;
      lastTapId = action.tapId;
      // Açılış ekranı "kaldığın yerden aç" ile bizim yönlendirmemizi ezmesin (bkz. nativeTapSeen).
      nativeTapSeen = true;
      deliver(action);
    };
    const unsubscribe = addCallActionListener(deliverOnce);
    const checkInitial = () => {
      const initial = getInitialCallAction();
      if (initial) deliverOnce(initial);
    };
    checkInitial();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkInitial();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, onAction);
}

type GateSource<T> = (deliver: (item: T) => void) => () => void;

/**
 * Kapının ortak çekirdeği: `source` teslim edilecek öğeleri üretir (abonelik + soğuk açılış) ve
 * temizleme fonksiyonu döner; kapı navigasyon hazır ve auth 'booting' değilken `onItem`i çağırır.
 */
function useGatedDelivery<T>(source: GateSource<T>, onItem: (item: T) => void): void {
  const navigationRef = useNavigationContainerRef();
  // Çağıranın her render'da yeni bir fonksiyon geçirmesi effect'i yeniden kurmasın diye ref'te
  // tutulur; abonelik yalnız `navigationRef` değişince yeniden kurulur.
  const onItemRef = useRef(onItem);
  onItemRef.current = onItem;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    let pending: { item: T } | null = null;

    const tryFlush = () => {
      if (!pending) return;
      if (!navigationRef.isReady()) {
        return;
      }

      const status = useAuthStore.getState().status;
      if (status === 'booting') {
        // oturum kararı henüz yok — auth guard bizi ezer, bekle
        return;
      }

      if (status === 'unauthenticated') {
        // Oturum yok — kullanıcı elle giriş yapacak, eski hedefe sürpriz atlama YOK.
        pending = null;
        return;
      }

      const { item } = pending;
      pending = null;
      onItemRef.current(item);
    };

    const deliver = (item: T) => {
      pending = { item };
      tryFlush();
    };

    const cleanupSource = sourceRef.current(deliver);
    // 'ready' — react-navigation'ın NavigationContainer gerçekten mount olduğunda ATEŞLEDİĞİ event;
    // `assertIsReady()`'nin baktığı `isReady()` ile aynı andan hemen sonra gelir.
    const unsubscribeReady = navigationRef.addListener('ready', tryFlush);
    // `useAuthStore`'un vanilla `subscribe`'ı: 'booting' → 'authenticated'/'unauthenticated' geçişini
    // React render döngüsüne bağlı olmadan yakalar.
    const unsubscribeAuth = useAuthStore.subscribe(tryFlush);

    return () => {
      cleanupSource();
      unsubscribeReady();
      unsubscribeAuth();
    };
  }, [navigationRef]);
}
