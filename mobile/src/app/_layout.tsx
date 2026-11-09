import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useAuthStore } from '@/stores/auth';
import { usePushNotificationResponder } from '@/notifications/push';
import { useIncomingCallResponder } from '@/notifications/incomingCall';
import { useShareIntentCapture } from '@/hooks/useShareIntentCapture';
import { theme } from '@/theme';
import { getRuntimeId } from '@/notifications/quickReplySpike';
import { MiniCallWindow } from '@/components/call/MiniCallWindow';
import { IncomingCallBanner } from '@/components/call/IncomingCallBanner';
import { CallPipOverlay } from '@/components/call/CallPipOverlay';

// 🔴 `registerGlobals()` BURADA DEĞİL, `mobile/index.js`'te (uygulama giriş noktası). Burada
// duruyordu ve YETMİYORDU: expo-router rota dosyalarını `require.context` ile topluca yüklediği için
// `stores/voice.ts` → `livekit-client` bu dosyanın gövdesinden ÖNCE değerlendiriliyor, LiveKit'in
// DOMException polyfill'i henüz kurulmamış oluyordu → açılışta kırmızı ekran. Gerekçenin tamamı
// `index.js`'te. Buraya geri taşıma.
export default function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  // Sprint M3 §3 — push bildirimine dokununca yönlendirme. Oturumdan bağımsız: dokunuş uygulama
  // kapalı/arka plandayken de gelebilir, tek mount noktası kök layout (bkz. notifications/push.ts).
  usePushNotificationResponder();
  // M4a-2 sözleşme §8 — gelen arama bildirimi (Reddet/Aramaya Katıl/gövde). Aynı mount noktası,
  // aynı native response akışı (bkz. notifications/incomingCall.ts dosya başı yorumu).
  useIncomingCallResponder();
  // C41 - Android paylaşım menüsünden gelen içerik (soğuk/sıcak) bellek deposuna alınır; yönlendirme
  // `(app)/_layout.tsx`te (oturum + gezinme hazır olunca).
  useShareIntentCapture();

  // 🔴 Sistem gezinme çubuğu ilk açılışta BEYAZ görünüyordu (sahip bulgusu 2026-08-01); login
  // ekranına çıkıp dönünce düzeliyordu. Sebep: SDK 54'te edge-to-edge açık olduğu için gezinme
  // çubuğu ŞEFFAF çizilir ve ARKASINDAKİ pencere zemini görünür. Android pencere zemini varsayılan
  // açık renktir; uygulamanın kendi koyu View'ı üstüne çizilene kadar o beyaz zemin görünüyordu.
  // Yani "gezinme çubuğunun rengi" değil, pencerenin zemini düzeltiliyor.
  //
  // Kök `<View backgroundColor>` bunu çözmez: o React ağacı basıldıktan SONRA vardır, beyaz zemin
  // ise ilk karede görünen şeydir. `expo-system-ui` pencere zeminini native tarafta değiştirir.
  // Yeni bağımlılık DEĞİL — `expo-system-ui` zaten kurulu.
  useEffect(() => {
    // Hata sessiz: zemin rengi kozmetiktir, açılışı hata ekranıyla durdurmaya değmez.
    SystemUI.setBackgroundColorAsync(theme.colors.bgRail).catch(() => {});
  }, []);

  // Contract §4 — açılışta secure store'daki refresh ile sessiz bootstrap (splash boyunca sürer).
  // bootstrap() kendi içinde tek-uçuşa indirgenmiştir (bkz. stores/auth.ts bootstrapPromise) —
  // bu effect dev'de (StrictMode/Fast Refresh) birden çok tetiklense bile gerçek iş bir kez olur.
  useEffect(() => {
    // SPIKE quick-reply: UI runtime kimligi (release'te de gorunur).
    console.log('[spike-reply] ui runtime', getRuntimeId());
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgRail }}>
      <StatusBar style="light" />
      {/* contentStyle — bkz. (app)/_layout.tsx yorumu: react-native-screens'in geçiş sırasında
          kullandığı native yüzey varsayılan beyaz olmasın diye kök stack'te de eşleştirilir
          (ör. login → (app) geçişi). */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bgRail } }} />
      {/* Sözleşme §7 — mini pencere sistem seviyesi bir overlay DEĞİL, kök ağacın en üstünde mutlak
          konumlu bir bileşen (Discord'un yaptığı da bu). Kökte tek yerde mount edilir ki "uygulamanın
          her ekranında görünür" olsun; kendi içinde aramada değilken null döner (boş yüzey açmaz). */}
      <MiniCallWindow />
      {/* Gelen aramanın uygulama-içi şeridi — yalnız bildirim izni kapalıyken çizilir (bileşenin
          kendi dosya başı yorumu). Kökte mount edilme gerekçesi mini pencereyle aynı: çağrı hangi
          ekranda yakalanırsa yakalansın görünmeli. */}
      <IncomingCallBanner />
      {/* M4p sözleşme §2/§3 — sistem PiP penceresinin içeriği. `MiniCallWindow` ile aynı kökte
          mount edilme gerekçesi (bkz. bileşenin kendi dosya başı yorumu): PiP hangi ekran açıksa
          onu küçültür, içerik bu yüzden route'tan bağımsız kökte durmalı. */}
      <CallPipOverlay />
    </View>
  );
}
