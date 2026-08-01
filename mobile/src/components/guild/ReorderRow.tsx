import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReorderableDrag } from 'react-native-reorderable-list';
import { theme } from '@/theme';

export interface ReorderRowData {
  id: string;
  label: string;
  /** Rol rengi — yalnız rol listesinde dolu. */
  color?: string;
  /** Satırın altındaki bağlam (kanal listesinde: kanalın kategorisi). */
  sublabel?: string;
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
      <View style={styles.texts}>
        <Text style={styles.label} numberOfLines={1}>
          {row.label}
        </Text>
        {/* Kanalın kategorisi: tek düz listede "bu kanal nerede" sorusunu satırın kendisi
            yanıtlar; liste kategorilere bölünmek zorunda kalmaz. */}
        {row.sublabel ? (
          <Text style={styles.sublabel} numberOfLines={1}>
            {row.sublabel}
          </Text>
        ) : null}
      </View>
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
  texts: { flex: 1 },
  label: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  sublabel: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 1 },
});
