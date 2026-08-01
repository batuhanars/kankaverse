import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

/**
 * Ayar listesi satırı: ikon + etiket + sağ ok. M1e boyunca ortam ayarlarının bütün gruplarında
 * tekrar ediyor (üyeler · yasaklar · roller · davetler · denetim · ayrıl), o yüzden tek yerde.
 *
 * `danger` yıkıcı satırlar için (ayrıl, ortamı sil): metin ve ikon Kor değil tehlike renginde.
 */
interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Alt çizgi çizilmesin (grubun son satırı). */
  last?: boolean;
  danger?: boolean;
  /** Sağ okun solunda gösterilen ikincil bilgi (ör. üye sayısı). */
  value?: string;
}

export function SettingsRow({ icon, label, onPress, last, danger, value }: Props) {
  const tint = danger ? theme.colors.danger : theme.colors.textSecondary;
  return (
    <Pressable onPress={onPress} style={[styles.row, !last && styles.divider]}>
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  label: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  labelDanger: {
    color: theme.colors.danger,
  },
  value: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
});
