import { StyleSheet, Text, View } from 'react-native';
import type { WarningKind } from '@kankaverse/e2ee-client';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Şifreleme uyarı bandı (E1 §3.3): tanınmayan cihaz / cihaz sohbetten çıkarıldı / cihaz anahtarı bozuk.
 * Bu durumlarda mesajlaşma durur; sessizce devam edilmez, kullanıcı nedenini görür.
 */
export function E2eeWarningBanner({ kind }: { kind: WarningKind }) {
  return (
    <View style={styles.bar} accessibilityRole="alert">
      <Text style={styles.text}>{t(`e2ee.warning.${kind}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: theme.colors.warning, paddingHorizontal: 16, paddingVertical: 8 },
  text: { color: theme.colors.bgRail, fontSize: theme.fontSize.sm, textAlign: 'center' },
});
