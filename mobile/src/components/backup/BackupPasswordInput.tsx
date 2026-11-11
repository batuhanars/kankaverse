import { StyleSheet, Text, TextInput } from 'react-native';
import { theme } from '@/theme';

interface Props {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Canlı kural geri bildirimi (Türkçe metin); boşsa gösterilmez. */
  hint?: string;
}

/** Yedek şifresi alanı: gizli giriş, otomatik düzeltme/büyük harf yok. Değer yalnız ekranın state'inde yaşar. */
export function BackupPasswordInput({ label, value, onChange, disabled, hint }: Props) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={[styles.input, !!hint && styles.inputError]}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        textContentType="newPassword"
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 6,
  },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    paddingHorizontal: 12,
  },
  inputError: { borderColor: theme.colors.danger },
  hint: { color: theme.colors.danger, fontSize: theme.fontSize.sm, lineHeight: 19 },
});
