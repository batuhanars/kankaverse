import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { EmojiPickButton } from '@/components/EmojiPickButton';
import { theme } from '@/theme';

/**
 * C21: ad girdisi + emoji düğmesi. Seçilen emoji SONA eklenir (RN'de imleç konumu Android IME'de
 * güvenilir değil); kural dönüşümü (kanal adı) çağıranın `onChangeText`inde uygulanır.
 */
interface Props
  extends Pick<
    TextInputProps,
    'placeholder' | 'returnKeyType' | 'onSubmitEditing' | 'autoCapitalize' | 'autoFocus'
  > {
  value: string;
  onChangeText: (value: string) => void;
}

export function EmojiNameInput({ value, onChangeText, ...inputProps }: Props) {
  return (
    <View style={styles.row}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        autoCorrect={false}
        {...inputProps}
      />
      <EmojiPickButton onPick={(emoji) => onChangeText(value + emoji)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    paddingLeft: 12,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
  },
});
