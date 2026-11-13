import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * "{ad} yeni bir cihaz ekledi" bilgi satırı (E2 §3.3). Mesaj değildir: dokunulamaz, menüsü yok; E2eeDivider ile
 * aynı gri dil. Tanımadığın bir cihaz eklendiyse o kişiye başka yoldan sorabilirsin.
 */
export function E2eeDeviceNotice({ name }: { name: string | null }) {
  const label = name ? t('e2ee.deviceAdded', { name }) : t('e2ee.deviceAddedUnknown');
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
