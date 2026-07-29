import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Ekran 1/3 (contract §8) — Açılış: logo + bootstrap sonucu. Kullanıcı etkileşimi yok, yalnız
// yönlendirme. bootstrap() kök layout'ta tetiklenir; burada yalnız status okunur.
export default function Index() {
  const status = useAuthStore((s) => s.status);

  if (status === 'authenticated') {
    return <Redirect href="/guilds" />;
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/login" />;
  }

  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/brand/kankaverse-hexagon.png')}
        style={styles.brand}
        resizeMode="contain"
        accessibilityLabel={t('brand.name')}
      />
      <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgRail,
  },
  // Yazısız altıgen (marka imzası). Kaynak: web/src/assets/brand — mobil kopyası assets/brand altında.
  brand: {
    width: 96,
    height: 96,
  },
  spinner: {
    marginTop: theme.layout.panelGap,
  },
});
