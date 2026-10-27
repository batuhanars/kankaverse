import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EmojiPickButton } from '@/components/EmojiPickButton';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * C21: rol emojisi satırı. Seçili emoji + seçici + "Kaldır". Boş string = emoji yok.
 * Rol adı yanında görünür (mesaj yazarı, üye listesi, profil rozeti); yalnız görünümdür.
 */
interface Props {
  value: string;
  onChange: (emoji: string) => void;
}

export function RoleEmojiRow({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('guildSettings.roles.emojiLabel')}</Text>
      <View style={styles.row}>
        <View style={styles.preview}>
          <Text style={styles.previewGlyph}>{value}</Text>
        </View>
        <EmojiPickButton
          onPick={onChange}
          accessibilityLabel={t('guildSettings.roles.emojiPick')}
        />
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityRole="button">
            <Text style={styles.remove}>{t('guildSettings.roles.emojiRemove')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.hint}>{t('guildSettings.roles.emojiHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preview: {
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewGlyph: { fontSize: 22 },
  remove: { color: theme.colors.accent500, fontSize: theme.fontSize.sm, fontWeight: '600' },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 17 },
});
