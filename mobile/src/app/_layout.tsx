import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useAuthStore } from '@/stores/auth';
import { theme } from '@/theme';

export default function RootLayout() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

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
    bootstrap();
  }, [bootstrap]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgRail }}>
      <StatusBar style="light" />
      {/* contentStyle — bkz. (app)/_layout.tsx yorumu: react-native-screens'in geçiş sırasında
          kullandığı native yüzey varsayılan beyaz olmasın diye kök stack'te de eşleştirilir
          (ör. login → (app) geçişi). */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bgRail } }} />
    </View>
  );
}
