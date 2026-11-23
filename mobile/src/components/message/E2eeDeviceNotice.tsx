import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DeviceNotice } from '@kankaverse/e2ee-client';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Türe göre [adlı, adsız] metin anahtarı. E7 öncesi kayıtta tür yok: `new` sayılır. */
const KEYS = {
  new: ['e2ee.deviceAdded', 'e2ee.deviceAddedUnknown'],
  unverified: ['e2ee.deviceUnverified', 'e2ee.deviceUnverifiedUnknown'],
  identity: ['e2ee.identityChanged', 'e2ee.identityChangedUnknown'],
} as const;

/**
 * Cihaz/kimlik bilgi satırı (E2 §3.3, E7 §4.2-4.3; web `E2eeDeviceNotice` ile aynı metinler). Mesaj değildir:
 * dokunulamaz, menüsü yok; E2eeDivider ile aynı gri dil. Türler: `new` (kimliği olmayan kişinin yeni cihazı),
 * `unverified` (kimlikle imzalanmamış cihaz), `identity` (güvenlik kodu değişti).
 */
export function E2eeDeviceNotice({ name, kind }: { name: string | null; kind?: DeviceNotice['kind'] }) {
  const [named, unknown] = KEYS[kind ?? 'new'];
  const label = name ? t(named, { name }) : t(unknown);
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={label}>
      <View style={styles.chip}>
        <Ionicons name="lock-closed" size={11} color={theme.colors.textMuted} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', marginTop: 14, paddingHorizontal: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
  },
  label: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, fontWeight: '600', flexShrink: 1 },
});
