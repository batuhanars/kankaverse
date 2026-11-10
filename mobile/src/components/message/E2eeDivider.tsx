import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Şifreli bölümün başındaki ayraç (E1 §4/§5): "Bu noktadan sonra mesajlar uçtan uca şifreli".
 * DateSeparator ile aynı dil (ortalanmış küçük rozet); görseldir, dokunulamaz, mesaj değildir.
 */
export function E2eeDivider() {
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={t('e2ee.divider')}>
      <View style={styles.chip}>
        <Ionicons name="lock-closed" size={11} color={theme.colors.textMuted} />
        <Text style={styles.label}>{t('e2ee.divider')}</Text>
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
