import { Redirect, Stack } from 'expo-router';
import { theme } from '@/theme';
import { useAuthStore } from '@/stores/auth';

// Auth guard — oturum sunucu tarafında düşerse (401 → refresh de başarısız, bkz. stores/auth.ts
// setSessionExpiredHandler) status 'unauthenticated'a döner; bu grup bunu görüp girişe gönderir.
// Uygulamayı kapatıp açmadan kullanıcı burada "kilitli" kalmasın (contract §4).
export default function AppLayout() {
  const status = useAuthStore((s) => s.status);

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bgSidebar },
        headerTintColor: theme.colors.textPrimary,
        headerShadowVisible: false,
      }}
    />
  );
}
