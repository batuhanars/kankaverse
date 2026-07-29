import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/stores/auth';
import { theme } from '@/theme';

export default function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // Contract §4 — açılışta secure store'daki refresh ile sessiz bootstrap (splash boyunca sürer).
  // bootstrap() kendi içinde tek-uçuşa indirgenmiştir (bkz. stores/auth.ts bootstrapPromise) —
  // bu effect dev'de (StrictMode/Fast Refresh) birden çok tetiklense bile gerçek iş bir kez olur.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgRail }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
