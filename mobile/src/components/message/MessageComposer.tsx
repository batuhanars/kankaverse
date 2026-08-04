import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MentionSuggestionList } from './MentionSuggestionList';
import type { MentionCandidate } from './useMentionCompose';
import type { DraftAttachment } from '@/utils/attachmentUpload';
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
  /** Yanıtlanan mesajın yazarı — doluysa alıntı şeridi görünür. */
  replyToAuthor?: string | null;
  /** Yanıtlanan mesajın metni (kısaltılmış gösterilir). */
  replyToSnippet?: string | null;
  /** Düzenleme modunda mıyız — şerit metni ona göre değişir. */
  editing?: boolean;
  /** Modu iptal et (× düğmesi). */
  onCancelMode?: () => void;
  /**
   * Sprint M2d — bahsetme önerileri. Boş dizi → liste hiç render edilmez (kaynak yoksa,
   * örn. `guildId`siz açılan kanal ekranında, yüzey de olmaz: yarım liste yanlış vaat).
   */
  mentionSuggestions?: MentionCandidate[];
  onMentionSelect?: (candidate: MentionCandidate) => void;
  /**
   * `TextInput` imleç takibi — bahsetme kancası sorguyu `start`'tan, emoji ekleme aralığın
   * ikisinden okur (RN'de selection bedava değil, tek olaydan iki tüketici beslenir).
   */
  onSelectionChange?: (start: number, end: number) => void;
  /**
   * Sprint M3c §4 — emoji eklendikten sonra imleci emojinin ARKASINA taşımak için TEK render
   * boyunca kontrol edilen seçim. Kalıcı kontrol Android IME'siyle kavga ediyor (bkz.
   * `useEmojiInsert`).
   */
  selection?: { start: number; end: number } | null;
  /** Sprint M3c §1 — `+` düğmesi. Verilmezse düğme çizilmez (yüzeyi olmayan ekranlar için). */
  onOpenAttach?: () => void;
  /** Sprint M3c §4 — emoji seçiciyi aç. Verilmezse düğme çizilmez. */
  onOpenEmoji?: () => void;
  /** Gönderilmeyi bekleyen ekler — kutunun üstünde şerit olarak görünür. */
  attachments?: DraftAttachment[];
  onRemoveAttachment?: (key: string) => void;
  /** "Yükleniyor… 2/5" — boşsa şerit çizilmez. */
  uploadLabel?: string;
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
  replyToAuthor,
  replyToSnippet,
  editing,
  onCancelMode,
  mentionSuggestions,
  onMentionSelect,
  onSelectionChange,
  selection,
  onOpenAttach,
  onOpenEmoji,
  attachments,
  onRemoveAttachment,
  uploadLabel,
}: Props) {
  // Sunucu ile aynı kural: en az bir ek varsa boş metinle de gönderilebilir (`EMPTY_MESSAGE`).
  const canSend = (!!value.trim() || !!attachments?.length) && !sending;
  const modeActive = editing || !!replyToAuthor;
  // 🔴 Düzenleme modunda ek düğmesi YOK: `PATCH .../messages/:id` yalnız `content` alıyor, var olan
  // mesaja sonradan ek bağlanamıyor. Düğmeyi göstermek "ekledim ama gitmedi" hâli üretirdi.
  const showAttach = !!onOpenAttach && !editing;

  return (
    <>
      {/* Mod şeridi — kutunun ÜSTÜNDE, çünkü "neye yazıyorum" bilgisi yazmadan önce görülmeli.
          Web'de `message.editHint` "Enter kaydet · Esc iptal" diyor; mobilde Esc yok, o metin
          KULLANILMADI — görünür × düğmesi var (olmayan tuşu tarif etmek yanlış yönlendirir). */}
      {modeActive && (
        <View style={styles.modeRow}>
          <View style={styles.modeTextWrap}>
            <Text style={styles.modeLabel} numberOfLines={1}>
              {editing ? t('message.edit') : t('reply.to', { author: replyToAuthor ?? '' })}
            </Text>
            {!editing && replyToSnippet ? (
              <Text style={styles.modeSnippet} numberOfLines={1}>
                {replyToSnippet}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onCancelMode}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('reply.cancel')}
          >
            <Ionicons name="close" size={20} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      )}

      {/* M2d — öneri listesi giriş şeridinin HEMEN ÜSTÜNDE; "yazıyor" şeridini yerinden
          oynatmaması için onun da üstünde durur (sözleşme §4.2). */}
      {!!mentionSuggestions?.length && onMentionSelect && (
        <MentionSuggestionList suggestions={mentionSuggestions} onSelect={onMentionSelect} />
      )}

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
          {uploadLabel ? <Text style={styles.uploadLabel}>{uploadLabel}</Text> : null}

          {/* Sprint M3c §3 — gönderilmeyi bekleyen ekler. Gönderim hatasında bu şerit AYAKTA KALIR
              (seçim korunur), kullanıcı aynı seçimle tekrar deneyebilir. */}
          {!!attachments?.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.draftRow}>
              {attachments.map((draft) => (
                <View key={draft.key} style={styles.draftChip}>
                  {draft.contentType.startsWith('image/') ? (
                    <Image source={{ uri: draft.uri }} style={styles.draftThumb} resizeMode="cover" />
                  ) : (
                    <View style={styles.draftThumb}>
                      <Ionicons name="document-outline" size={20} color={theme.colors.textSecondary} />
                    </View>
                  )}
                  <Text style={styles.draftName} numberOfLines={1}>
                    {draft.filename}
                  </Text>
                  <Pressable
                    onPress={() => onRemoveAttachment?.(draft.key)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('attachment.remove')}
                  >
                    <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.inputRow}>
            {showAttach && (
              <Pressable
                onPress={onOpenAttach}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.attach.open')}
                style={styles.iconButton}
              >
                <Ionicons name="add" size={24} color={theme.colors.textSecondary} />
              </Pressable>
            )}
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              multiline
              selection={selection ?? undefined}
              onSelectionChange={(e) =>
                onSelectionChange?.(e.nativeEvent.selection.start, e.nativeEvent.selection.end)
              }
            />
            {onOpenEmoji && (
              <Pressable
                onPress={onOpenEmoji}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.emoji.open')}
                style={styles.iconButton}
              >
                <Ionicons name="happy-outline" size={22} color={theme.colors.textMuted} />
              </Pressable>
            )}
            <Pressable
              onPress={() => onSend()}
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
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
  },
  modeTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  modeLabel: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  modeSnippet: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
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
  uploadLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginBottom: 6,
  },
  draftRow: {
    gap: 8,
    paddingBottom: 8,
  },
  draftChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 200,
    paddingRight: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  draftThumb: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSidebar,
  },
  draftName: {
    flexShrink: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  // Dokunma hedefi 44dp (sözleşme §1) — ikon 24px olsa da basılabilir alan küçülmez.
  iconButton: {
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
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
