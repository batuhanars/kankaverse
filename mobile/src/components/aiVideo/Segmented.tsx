import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

interface Props<T extends string | number> {
  label: string;
  options: { value: T; text: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Parçalı seçici (web `AiVideoOptions` çözünürlük/süre grupları). Dar ekranda satır sarar. */
export function Segmented<T extends string | number>({ label, options, value, onChange }: Props<T>) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[styles.item, on && styles.itemOn]}
            >
              <Text style={[styles.text, on && styles.textOn]}>{o.text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: {
    minHeight: theme.layout.inputMinHeight,
    minWidth: 64,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
  },
  itemOn: { backgroundColor: theme.colors.accent500, borderColor: theme.colors.accent500 },
  text: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },
  textOn: { color: theme.colors.textPrimary },
});
