import { theme } from '@/theme';

/**
 * `rn-emoji-keyboard`in tema nesnesi — **iki kullanım tek kaynaktan** okur: tepki seçici
 * (`MessageActionHost`) ve mesaj kutusundaki emoji düğmesi (`ComposerHost`).
 *
 * Sprint M3c §4 "ikinci bir seçici yazma" kuralının doğal sonucu: paket paylaşılıyorsa görünüş de
 * paylaşılmalı. Renkler `src/theme` token'larından; kütüphanenin varsayılan teması bizim koyu
 * paletimizle uyuşmuyor. Gölge yok (tasarım sistemi kuralı).
 */
export const emojiPickerTheme = {
  backdrop: 'rgba(0, 0, 0, 0.55)',
  knob: theme.colors.borderStrong,
  container: theme.colors.bgSidebar,
  header: theme.colors.textPrimary,
  skinTonesContainer: theme.colors.bgElevated,
  category: {
    icon: theme.colors.textMuted,
    iconActive: theme.colors.accent500,
    container: theme.colors.bgElevated,
    containerActive: theme.colors.accentSubtle,
  },
  search: {
    background: theme.colors.bgElevated,
    text: theme.colors.textPrimary,
    placeholder: theme.colors.textMuted,
    icon: theme.colors.textMuted,
  },
};
