import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

/**
 * Tek seçimli çip satırı. Kanal düzenlemede iki kez kullanılıyor (kategori · yavaş mod), o yüzden
 * ortak: aynı deseni iki kez yazmak ekranı 300 satır eşiğinin üstüne çıkarıyordu.
 *
 * Değer `string | number | null` olabildiği için karşılaştırma çağırana bırakılmadı; `value`
 * doğrudan seçenek değerleriyle kıyaslanıyor.
 */
export interface ChipOption<T> {
  value: T;
  label: string;
}

interface Props<T> {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ChipSelect<T extends string | number | null>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.text, active && styles.textActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
  },
  chipActive: {
    borderColor: theme.colors.accent500,
    backgroundColor: theme.colors.accentSubtle,
  },
  text: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  textActive: {
    color: theme.colors.accent500,
    fontWeight: '700',
  },
});
