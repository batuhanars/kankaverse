import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReorderableDrag } from 'react-native-reorderable-list';
import { theme } from '@/theme';

export interface ReorderRowData {
  id: string;
  label: string;
  /** Rol rengi — yalnız rol listesinde dolu. */
  color?: string;
}

/**
 * Sürüklenebilir satır.
 *
 * `useReorderableDrag` **liste öğesinin içinden** çağrılmak zorunda, bu yüzden ayrı bileşen;
 * ekranın gövdesinde çağrılamaz.
 *
 * Satırın TAMAMI tutamaç (uzun basış): ayrı bir tutamaç ikonuna basmak dokunma hedefini
 * küçültürdü. İkon duruyor ama yalnız "bu satır taşınabilir" ipucu olarak.
 */
export function ReorderRow({ row }: { row: ReorderRowData }) {
  const drag = useReorderableDrag();
  return (
    <Pressable onLongPress={drag} delayLongPress={200} style={styles.row}>
      <Ionicons name="reorder-three" size={20} color={theme.colors.textMuted} />
      {row.color ? <View style={[styles.dot, { backgroundColor: row.color }]} /> : null}
      <Text style={styles.label} numberOfLines={1}>
        {row.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  label: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
});
