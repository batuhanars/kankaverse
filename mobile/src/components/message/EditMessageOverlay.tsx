import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MessageBubble } from '../MessageBubble';
import { MentionSuggestionList } from './MentionSuggestionList';
import { EmojiGifSheet } from './EmojiGifSheet';
import { useEmojiInsert } from './useEmojiInsert';
import { useMentionCompose, type MentionCandidate } from './useMentionCompose';
import { expandMentionsForEdit } from '@/utils/mentions';
import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { useMessagesStore } from '@/stores/messages';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  message: MessageDto;
  channelId: string;
  /** Sohbetteki baloncukla birebir görünüm için ekranın çözümleyicileri. */
  showIdentity: boolean;
  resolveMention: (userId: string) => string | undefined;
  resolveRole?: (roleId: string) => string | undefined;
  /** Bahsetme önerisi kaynağı (ekranın kutusuyla aynı) — düzenlemede de çalışıyordu, korunur. */
  mentionSource: MentionCandidate[];
  everyoneRoleId?: string | null;
  /**
   * Klavye ve gezinme çubuğu payları `MessageScreen`in ÖLÇÜLMÜŞ hesabından gelir (bkz. oradaki
   * "Deneme 5" notu): `keyboardPad` klavye açıkken alt boşluk, `bottomInset` klavye kapalıyken
   * gezinme çubuğu payı. Burada sabit dolgu YOK.
   */
  keyboardPad: number;
  bottomInset: number;
  onClose: () => void;
}

/**
 * C27 — mesaj düzenleme ekranı (WhatsApp deseni). Mesaj kutusunun düzenleme modunun yerini alır:
 * kendi durumunu tutar, kutudaki taslak/yanıt/ekler hiç değişmez.
 *
 * `Modal` DEĞİL, ekranın kendi penceresinde mutlak konumlu bir katman: klavye payı bu ekranda
 * ölçülerek doğrulanmış (3 tuşlu gezinme dahil); `Modal` ayrı pencerede inset'leri güvenilmez döndürüyor.
 * Katman `bottom: keyboardPad` ile klavyenin tepesinde biter, alan alta yapışır.
 */
export function EditMessageOverlay({
  message,
  channelId,
  showIdentity,
  resolveMention,
  resolveRole,
  mentionSource,
  everyoneRoleId,
  keyboardPad,
  bottomInset,
  onClose,
}: Props) {
  const updateMessage = useMessagesStore((s) => s.updateMessage);
  // C54 — token'lar görüntülemedeki çözücülerle `@ad`a çevrilir; yalnız ilk açılışta hesaplanır.
  const [initial] = useState(() => expandMentionsForEdit(message.content, resolveMention, resolveRole));
  const [value, setValue] = useState(initial.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // İlk açılışta imleç sonda; kullanıcı dokununca kontrol bırakılır (Android IME ile kavga etmesin).
  const [initialSel, setInitialSel] = useState<{ start: number; end: number } | null>({
    start: initial.text.length,
    end: initial.text.length,
  });
  const mention = useMentionCompose(mentionSource, everyoneRoleId);
  useEffect(() => {
    mention.seedPicked(initial.users, initial.roles);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız açılışta tohumla
  }, []);
  const emoji = useEmojiInsert(value, handleChange);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Android geri tuşu/hareketi = iptal (onay sorulmaz).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  function handleChange(text: string) {
    emoji.clearSelection();
    setValue(text);
    mention.onChangeText(text);
  }

  const trimmed = value.trim();
  // Sunucu kuralıyla aynı: ek varsa boş metin geçerli. Değişmediyse kaydedilecek bir şey yok.
  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  const canSave = !saving && trimmed !== initial.text.trim() && (!!trimmed || hasAttachments);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      // Sunucu düzenlemeyi yalnız YAZARA açıyor; yetkisizde bu ekran zaten açılmıyor.
      const updated = await messagesApi.edit(channelId, message.id, mention.applyMentionTokens(trimmed));
      // WS `message.updated` de gelir; store aynı id'yi yerine koyduğu için mükerrer olmaz.
      updateMessage(updated);
      onClose();
    } catch (e) {
      setError(extractErrorMessage(e));
      setSaving(false);
    }
  }

  return (
    <View style={[styles.layer, { bottom: keyboardPad }]}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {t('mobile.editMessage.title')}
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.previewContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Boşluğa dokunmak iptal eder; balon salt okunur (dokunuş/uzun basış kapalı). */}
        <Pressable style={styles.previewTap} onPress={onClose} accessibilityLabel={t('common.close')}>
          <View pointerEvents="none">
            <MessageBubble
              message={message}
              showAuthor
              isMine
              showIdentity={showIdentity}
              resolveMention={resolveMention}
              resolveRole={resolveRole}
            />
          </View>
        </Pressable>
      </ScrollView>

      {mention.visible && mention.suggestions.length > 0 && (
        <MentionSuggestionList
          suggestions={mention.suggestions}
          onSelect={(candidate) => {
            const next = mention.select(candidate, value);
            if (next) setValue(next.text);
          }}
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: theme.layout.panelGap + bottomInset }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <TextInput
              value={value}
              onChangeText={handleChange}
              autoFocus
              multiline
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              selection={initialSel ?? emoji.selection ?? undefined}
              onSelectionChange={(e) => {
                const { start, end } = e.nativeEvent.selection;
                if (initialSel) setInitialSel(null);
                mention.onSelectionChange(start);
                emoji.onSelectionChange(start, end);
              }}
            />
            <Pressable
              onPress={() => emoji.setOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.emoji.open')}
              style={styles.emojiButton}
            >
              <Ionicons name="happy-outline" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => void save()}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            accessibilityLabel={t('mobile.editMessage.save')}
            style={[styles.saveButton, !canSave && styles.saveDisabled]}
          >
            <Ionicons name="checkmark" size={22} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <EmojiGifSheet
        visible={emoji.open}
        onClose={() => emoji.setOpen(false)}
        onEmojiSelected={emoji.insert}
        showGif={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 12,
  },
  title: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.lg, fontWeight: '700' },
  previewContent: { flexGrow: 1, justifyContent: 'flex-end' },
  previewTap: { flexGrow: 1, justifyContent: 'flex-end', paddingVertical: 12 },
  inputBar: {
    paddingTop: theme.layout.panelGap,
    paddingHorizontal: theme.layout.panelGap,
    backgroundColor: theme.colors.bgSidebar,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.xs, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  inputWrap: { flex: 1, justifyContent: 'center' },
  input: {
    maxHeight: 160,
    minHeight: theme.layout.inputMinHeight,
    paddingLeft: 14,
    paddingRight: 44,
    paddingVertical: 10,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
  },
  emojiButton: { position: 'absolute', right: 10, bottom: 11 },
  saveButton: {
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    borderRadius: theme.layout.inputMinHeight / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent500,
  },
  saveDisabled: { opacity: 0.4 },
});
