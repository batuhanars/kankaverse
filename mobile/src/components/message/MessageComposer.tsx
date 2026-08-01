import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Mesaj giriş şeridi — "yazıyor" etiketi + giriş kutusu + Gönder, ya da engelli/izinsiz durumda
 * sebep şeridi.
 *
 * `MessageScreen`den ayrıldı (M1d-C §2.1): o dosya 561 satıra çıkmıştı ve sprintte üzerine mesaj
 * paneli + tepki + yanıt gelecek. **Saf taşıma, davranış değişmedi** — yeni özellik eklenmeden önce
 * bölmek, sonra bölmeye çalışmaktan ucuz.
 *
 * 🔴 `bottomInset` (sistem gezinme çubuğu payı) burada UYGULANIR ama HESAPLANMAZ: hesabı ekranın
 * kendisi yapar (klavye açıkken pay verilmez, bkz. `MessageScreen`). Bileşen "ne kadar" sorusunun
 * cevabını dışarıdan alır, yoksa aynı hesap iki yerde ayrışırdı.
 */
interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  sendError: string;
  placeholder: string;
  /** Doluysa giriş kutusu yerine sebep şeridi gösterilir (T&S: sessizce gizleme yok, sebep yazılır). */
  disabledNotice?: string | null;
  /** "X yazıyor…" — null ise şerit hiç render edilmez. */
  typingLabel: string | null;
  bottomInset: number;
}

export function MessageComposer({
  value,
  onChangeText,
  onSend,
  sending,
  sendError,
  placeholder,
  disabledNotice,
  typingLabel,
  bottomInset,
}: Props) {
  const canSend = !!value.trim() && !sending;

  return (
    <>
      {typingLabel && (
        <View style={styles.typingRow}>
          <Text style={styles.typingText}>{typingLabel}</Text>
        </View>
      )}

      {disabledNotice ? (
        <View style={[styles.disabledBar, { paddingBottom: theme.layout.panelGap + bottomInset }]}>
          <Text style={styles.disabledText}>{disabledNotice}</Text>
        </View>
      ) : (
        <View style={[styles.inputBar, { paddingBottom: theme.layout.panelGap + bottomInset }]}>
          {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
          <View style={styles.inputRow}>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              multiline
            />
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            >
              <Text style={styles.sendButtonText}>{t('message.send')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  typingRow: {
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 4,
  },
  typingText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontStyle: 'italic',
  },
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    padding: theme.layout.panelGap,
  },
  sendError: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: theme.layout.inputMinHeight,
    maxHeight: 120,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: theme.fontSize.base,
  },
  sendButton: {
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  disabledBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    padding: theme.layout.panelGap,
  },
  disabledText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
});
