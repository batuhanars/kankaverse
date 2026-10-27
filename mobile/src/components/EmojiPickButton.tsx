import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import EmojiPicker, { tr as emojiTr } from 'rn-emoji-keyboard';
import { emojiPickerTheme } from '@/components/message/emojiPickerTheme';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * C21: ad alanlarına emoji ekleme düğmesi. Mevcut `rn-emoji-keyboard` + `emojiPickerTheme`
 * (tepki seçici ve mesaj kutusuyla aynı görünüş). Seçileni `onPick` ile bildirir.
 * Simge mesaj kutusundaki gibi soluk çizgi `happy-outline` (sahip turu 2026-10-27; renkli 😊 göze batıyordu).
 */
interface Props {
  onPick: (emoji: string) => void;
  accessibilityLabel?: string;
}

export function EmojiPickButton({ onPick, accessibilityLabel }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? t('message.emojiButton')}
      >
        <Ionicons name="happy-outline" size={22} color={theme.colors.textMuted} />
      </Pressable>
      <EmojiPicker
        open={open}
        onClose={() => setOpen(false)}
        onEmojiSelected={(e) => {
          setOpen(false);
          onPick(e.emoji);
        }}
        translation={emojiTr}
        enableSearchBar
        categoryPosition="top"
        theme={emojiPickerTheme}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: theme.layout.controlSm,
    minHeight: theme.layout.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
