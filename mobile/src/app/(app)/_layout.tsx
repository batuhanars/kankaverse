import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Redirect, Stack, usePathname, useRouter } from 'expo-router';
import { theme } from '@/theme';
import { useAuthStore } from '@/stores/auth';
import { restoreActiveAiVideo, useAiVideoViewerStore } from '@/stores/aiVideoViewer';
import { useShareIntentStore } from '@/stores/shareIntent';
import { useDmStore } from '@/stores/dm';
import { useFriendsStore } from '@/stores/friends';
import { useUnreadStore } from '@/stores/unread';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { AiVideoViewerHost } from '@/components/aiVideo/AiVideoViewerHost';
import { AppToast } from '@/components/AppToast';
import { useBackgroundSocket } from '@/realtime/useBackgroundSocket';
import { syncPushToken, isPushTokenRegistered } from '@/notifications/push';
import { ensureIncomingCallNotificationsSetup } from '@/notifications/incomingCall';

// Auth guard — oturum sunucu tarafında düşerse (401 → refresh de başarısız, bkz. stores/auth.ts
// setSessionExpiredHandler) status 'unauthenticated'a döner; bu grup bunu görüp girişe gönderir.
//
// Sprint M1a — M0'ın "Ortamların" tam-ekranı kaldırıldı (contract §0); yerini (tabs) grubu (rail +
// sidebar ana sayfa · bildirimler · sen) + içerik ayrı tam ekranları (kanal/dm/dm-requests) aldı.
// `useBackgroundSocket` BURADA (oturum-genelinde, bir kez) mount edilir — contract §4.3 arka
// plan/ön plan politikası tüm authenticated alan için geçerli, tek bir ekrana bağlı değil.
export default function AppLayout() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id);
  useBackgroundSocket();

  // C41 - Paylaşım geldiyse (soğuk ya da sıcak) `/share`e git. Bu layout yalnız (app) rotaları
  // mount olunca vardır: gezinme hazır, ve kimliksizse aşağıdaki guard girişe yollar, girişten
  // sonra bu effect yeniden koşar ve paylaşım hâlâ bellekte durur. Zaten /share'deysek tekrar itme.
  const router = useRouter();
  const pathname = usePathname();
  const sharePayloadId = useShareIntentStore((s) => s.payload?.id ?? null);
  useEffect(() => {
    if (status !== 'authenticated' || sharePayloadId === null || pathname === '/share') return;
    const timer = setTimeout(() => router.push('/share'), 0);
    return () => clearTimeout(timer);
  }, [status, sharePayloadId, pathname, router]);

  // Sözleşme §8.3 — DM store'u oturum kapsamlıdır: `useBackgroundSocket` ile aynı gerekçeyle burada
  // bağlanır. Mount = oturum başı (id yazılır, `applyActivity` "bu mesaj benim mi"yi bilir),
  // unmount = oturum sonu (TÜM DM durumu silinir; liste store'da yaşadığı için temizlenmezse
  // çıkıştan sonra sıradaki kullanıcı öncekinin DM listesini görürdü).
  // Sprint M1b — kanka store'u da aynı gerekçeyle oturum kapsamlı (dm store ile birebir aynı
  // sızıntı riski: temizlenmezse çıkıştan sonra sıradaki kullanıcı öncekinin kanka listesini görür).
  // Sprint M2a — `unread` store aynı sınıf: guild/kanal rozetleri de oturum kapsamlı, aynı `reset()`.
  useEffect(() => {
    if (!userId) return;
    useDmStore.getState().setSessionUser(userId);
    // Kanka isteklerini oturum başında BİR KEZ çek — sidebar'daki "kanka isteği" satırı (sahip
    // bulgusu 2026-07-30) aksi halde "Kanka Ekle" ekranına girilmeden 0 kalırdı. Sonraki
    // güncellemeler `friend.*` WS olaylarından geliyor, tekrar çekim gerekmiyor.
    useFriendsStore.getState().fetchAll();
    // Sprint M2b §6 — bildirim tercihleri de oturum başında BİR KEZ çekilir (rail/kanal listesi
    // rozet süzgeci bunu bekliyor). Hata sessiz: yüklenemezse varsayılan (susturulmamış/Tümü) kalır,
    // rozetler süzülmeden gösterilir — yanlış değil, yalnız güncel değil.
    void useNotificationPrefsStore.getState().load().catch(() => {});
    // Sprint M3 §3 — izin akışı oturum açıldıktan SONRA (açılışta değil). Token + kayıt tek
    // seferlik girişim; hata/izin reddi sessiz (syncPushToken içinde yutuluyor), uygulama akışını
    // bloke etmez. Çıkışta silme `stores/auth.ts` `logout()`'ta (tek çıkış noktası).
    void syncPushToken();
    // M4a-3 sözleşme §9.2.2 — kanal/kategori kurulumu burada, aynı yerde: push ile gelen gelen-arama
    // bildirimini SİSTEM gösterir (JS'e uğramaz), kurulum ilk çağrıya kadar ertelenirse (eski
    // davranış) kanal/kategori henüz yokken düşen push'ta ses yanlış olur, düğmeler hiç çıkmaz.
    // `ensureIncomingCallNotificationsSetup` idempotent (`setupDone`), tekrar çağrı zararsız.
    void ensureIncomingCallNotificationsSetup();
    // 🔴 Sahip cihaz turu 2026-08-11 — `syncPushToken` YALNIZ burada, yani uygulama açılışında
    // çalışıyordu. Açılışta bildirim izni yoksa token hiç alınamıyor ve bir daha DENENMİYORDU:
    // kullanıcı sonradan sistem ayarlarından izin verse bile (bildirimler sekmesindeki uyarı
    // şeridi tam oraya yönlendiriyor) push ölü kalıyordu. Kusur çift gizliydi: şerit izin
    // açılınca kaybolduğu için "düzeldi" görünüyor, arama bildirimi de çalışmaya devam ediyor
    // (o uygulama içinde üretiliyor, sunucu push'una ihtiyacı yok) — yalnız MESAJ bildirimi ölü.
    // Uygulama ön plana her döndüğünde, kayıt HENÜZ yapılmadıysa yeniden denenir. Kayıt varsa
    // hiçbir şey yapılmaz, yani her dönüşte gereksiz istek atılmaz.
    // C49 R3: süren yapay zeka video üretimi göstergesi - açılışta ve her ön plana dönüşte tek liste çağrısı.
    void restoreActiveAiVideo();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!isPushTokenRegistered()) void syncPushToken();
      void restoreActiveAiVideo();
    });
    return () => {
      sub.remove();
      useDmStore.getState().setSessionUser(null);
      useFriendsStore.getState().reset();
      useUnreadStore.getState().reset();
      useNotificationPrefsStore.getState().reset();
      useAiVideoViewerStore.getState().setActive(null);
    };
  }, [userId]);

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  return (
    <>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bgSidebar },
        headerTintColor: theme.colors.textPrimary,
        headerShadowVisible: false,
        // Geri navigasyonda bir kez görülen kısa boş beyaz ekran — kök neden: react-native-screens
        // `contentStyle` verilmeyince native ekran yüzeyini VARSAYILAN BEYAZ ile başlatıyor; push/pop
        // geçiş animasyonu sırasında JS içeriği henüz boyanmadan bu beyaz kare bir/iki frame görünüyor
        // (koyu tema + native-stack kombinasyonunda bilinen davranış). `contentStyle` ekranın kendi
        // arkaplanıyla ÖNCEDEN eşleştirilince o ara kare de koyu olur.
        contentStyle: { backgroundColor: theme.colors.bgContent },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="dm-requests" />
      <Stack.Screen name="share" />
      {/* M4a-1 sözleşme §4 — arama ekranı "tam ekran modal". Kendi başlığını çizer (headerShown
          false); Android donanım geri tuşu varsayılan pop davranışıyla küçültme ile AYNI sonucu
          verir (arama bağlı kalır, mini pencere belirir) — ayrı bir BackHandler gerekmiyor. */}
      <Stack.Screen name="call" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
    </Stack>
    <AiVideoViewerHost />
    <AppToast />
    </>
  );
}
