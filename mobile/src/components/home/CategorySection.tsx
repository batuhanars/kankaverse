import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

interface Props {
  name: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Yalnız yetkiliye geçilir; yoksa uzun basış hiçbir şey yapmaz (yetkisize ipucu verilmez). */
  onLongPress?: () => void;
}

// Sprint M1d-B contract §11 — kategori başlığı. `ChannelSidebar`'dan ayrı dosyaya çıkarıldı:
// sidebar zaten 250 satırdaydı, gruplu render + collapse ile 300 eşiğini aşacaktı (D29 sınıfı yeni
// borç üretme kuralı). Bileşen SAF: kendi state'i yok, tıklama sahibine bildirilir.
export function CategorySection({ name, collapsed, onToggle, onLongPress }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onLongPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
    >
      <Ionicons
        name={collapsed ? 'chevron-forward' : 'chevron-down'}
        size={14}
        color={theme.colors.textMuted}
      />
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <View />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
    paddingBottom: 6,
  },
  name: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
