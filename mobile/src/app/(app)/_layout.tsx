import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import { theme } from '@/theme';
import { useAuthStore } from '@/stores/auth';
import { useDmStore } from '@/stores/dm';
import { useFriendsStore } from '@/stores/friends';
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
  const userId = useAuthStore((s) => s.user?.id);
  useBackgroundSocket();

  // Sözleşme §8.3 — DM store'u oturum kapsamlıdır: `useBackgroundSocket` ile aynı gerekçeyle burada
  // bağlanır. Mount = oturum başı (id yazılır, `applyActivity` "bu mesaj benim mi"yi bilir),
  // unmount = oturum sonu (TÜM DM durumu silinir; liste store'da yaşadığı için temizlenmezse
  // çıkıştan sonra sıradaki kullanıcı öncekinin DM listesini görürdü).
  // Sprint M1b — kanka store'u da aynı gerekçeyle oturum kapsamlı (dm store ile birebir aynı
  // sızıntı riski: temizlenmezse çıkıştan sonra sıradaki kullanıcı öncekinin kanka listesini görür).
  useEffect(() => {
    if (!userId) return;
    useDmStore.getState().setSessionUser(userId);
    // Kanka isteklerini oturum başında BİR KEZ çek — sidebar'daki "kanka isteği" satırı (sahip
    // bulgusu 2026-07-30) aksi halde "Kanka Ekle" ekranına girilmeden 0 kalırdı. Sonraki
    // güncellemeler `friend.*` WS olaylarından geliyor, tekrar çekim gerekmiyor.
    useFriendsStore.getState().fetchAll();
    return () => {
      useDmStore.getState().setSessionUser(null);
      useFriendsStore.getState().reset();
    };
  }, [userId]);

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
