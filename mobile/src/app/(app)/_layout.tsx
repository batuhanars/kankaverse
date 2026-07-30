import { Redirect, Stack } from 'expo-router';
import { theme } from '@/theme';
import { useAuthStore } from '@/stores/auth';
import { useBackgroundSocket } from '@/realtime/useBackgroundSocket';

// Auth guard — oturum sunucu tarafında düşerse (401 → refresh de başarısız, bkz. stores/auth.ts
// setSessionExpiredHandler) status 'unauthenticated'a döner; bu grup bunu görüp girişe gönderir.
//
// Sprint M1a — M0'ın "Ortamların" tam-ekranı kaldırıldı (contract §0); yerini (tabs) grubu (rail +
// sidebar ana sayfa · bildirimler · sen) + içerik ayrı tam ekranları (kanal/dm/dm-requests) aldı.
// `useBackgroundSocket` BURADA (oturum-genelinde, bir kez) mount edilir — contract §4.3 arka
// plan/ön plan politikası tüm authenticated alan için geçerli, tek bir ekrana bağlı değil.
export default function AppLayout() {
  const status = useAuthStore((s) => s.status);
  useBackgroundSocket();

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  return (
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
    </Stack>
  );
}
