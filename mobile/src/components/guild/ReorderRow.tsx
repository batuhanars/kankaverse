import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReorderableDrag } from 'react-native-reorderable-list';
import { theme } from '@/theme';

export interface ReorderRowData {
  id: string;
  label: string;
  /** Rol rengi — rozet noktası olarak çizilir. */
  color?: string;
}

/**
 * Sürüklenebilir satır (rol sıralaması).
 *
 * `useReorderableDrag` **liste öğesinin içinden** çağrılmak zorunda, bu yüzden ayrı bileşen;
 * ekranın gövdesinde çağrılamaz.
 *
 * Satırın TAMAMI tutamaç (uzun basış): ayrı bir tutamaç ikonuna basmak dokunma hedefini
 * küçültürdü. İkon duruyor ama yalnız "bu satır taşınabilir" ipucu olarak.
 *
 * 🔴 Kütüphane seçimi bilinçli: `react-native-draggable-flatlist` DEĞİL. Onun peer bildirimi
 * `reanimated >=2.8.0` diyor — uygulamayı çökerten `reanimated-color-picker`ın (`>=2.0.0`) aynı
 * deseni ve son sürümü eski. `react-native-reorderable-list` `>=3.12.0` istiyor, yani modern
 * Reanimated'a karşı bakım görüyor; kaldırılan `addWhitelistedNativeProps` API'sini çağırmadığı
 * kaynak taranarak **doğrulandı** — peer aralığına güvenilmedi.
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
