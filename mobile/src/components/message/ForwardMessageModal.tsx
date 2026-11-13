import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import type { MessageDto } from '@/api/messages';
import { sendMessage } from '@/stores/e2ee';
import { attachmentsApi } from '@/api/attachments';
import { extractErrorMessage } from '@/api/errors';
import { useAttachmentThumb } from './replyPreview';
import { useDmStore } from '@/stores/dm';
import { showToast } from '@/stores/toast';
import { channelTitle } from '@/utils/channelTitle';
import { dmRouteParams } from '@/utils/dmRoute';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Mesajı ilet — web `ForwardMessageModal.vue`nin mobil karşılığı.
 *
 * İletme yeni bir mesaj olarak gider (alıcı normal bir mesaj görür, "iletildi" etiketi yok).
 *
 * C30: ekler sunucuda KOPYALANIR (`attachmentsApi.forward` -> yeni ek kimligi), sonra normal gonderimle
 * (`attachmentIds`) hedefe baglanir; istemci dosyayi indirip yeniden yuklemez. Eskiden metin bos ise
 * DOSYA ADI metin olarak gidiyordu (gorsel yazi oluyordu); bu davranis KALDIRILDI.
 *
 * Hedef listesi **mevcut DM kanalları** (web ile aynı): yeni sohbet başlatma yolu buraya konmadı,
 * o "Yeni Mesaj" ekranının işi.
 *
 * T&S: engelli/izinsiz DM'e iletmeyi sunucu reddeder (`canDm`); istemci kapıyı taklit etmez,
 * sunucunun Türkçe mesajını satırın altında gösterir.
 */
/** C68 §1: tek seferde en fazla bu kadar hedef (toplu yayma sinirı). */
const MAX_TARGETS = 5;

interface Props {
  message: MessageDto;
  onClose: () => void;
}

export function ForwardMessageModal({ message, onClose }: Props) {
  const bottomInset = useSheetInsets();
  const channels = useDmStore((s) => s.channels);

  const [query, setQuery] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const forwardText = message.content.trim();
  const attachments = message.attachments ?? [];
  const first = attachments[0] ?? null;
  // Metin de ek de yoksa iletilecek bir sey yok (bugunku bos durum).
  const hasContent = !!forwardText || attachments.length > 0;

  // Onizleme kucuk resmi: video icin mesajdaki kare, gorsel icin sunucudan kisa omurlu adres.
  const previewUri = useAttachmentThumb(first);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return channels;
    return channels.filter((c) => channelTitle(c).toLocaleLowerCase('tr').includes(q));
  }, [channels, query]);

  function toggle(channelId: string) {
    if (sending || sentIds.includes(channelId)) return;
    if (selectedIds.includes(channelId)) {
      setSelectedIds((prev) => prev.filter((id) => id !== channelId));
      setErrorMessage('');
      return;
    }
    if (selectedIds.length >= MAX_TARGETS) {
      // Uygulama toast'i Modal'in altinda kalir; sinir uyarisi mevcut hata alanindan gosterilir.
      setErrorMessage(t('message.forwardLimit'));
      return;
    }
    setSelectedIds((prev) => [...prev, channelId]);
    setErrorMessage('');
  }

  // Bir hedefe gonderim: bugunku mantik (her ek icin sunucuda kopya, sonra normal/E2EE gonderim).
  // Biri reddedilirse hedef "gonderildi" isaretlenmez.
  async function forwardTo(channelId: string) {
    const copies = await Promise.all(attachments.map((a) => attachmentsApi.forward(a.id)));
    await sendMessage(
      channelId,
      forwardText,
      undefined,
      copies.map((c) => c.attachmentId),
    );
  }

  // C68 §3: kaynak ekran bir DM sohbetiyse (`/dm/<id>`) replace, degilse push; hedef = kaynak ise yalniz kapat.
  function openTarget(channelId: string) {
    const sourceMatch = /^\/dm\/([^/]+)/.exec(pathname);
    const sourceChannelId = sourceMatch ? decodeURIComponent(sourceMatch[1]) : null;
    onClose();
    if (sourceChannelId === channelId) return;
    const channel = channels.find((c) => c.id === channelId);
    if (!channel) return;
    if (sourceChannelId) router.replace(dmRouteParams(channel));
    else router.push(dmRouteParams(channel));
  }

  async function send() {
    if (sending || !hasContent || selectedIds.length === 0) return;
    const targets = selectedIds;
    setSending(true);
    setErrorMessage('');
    const results = await Promise.allSettled(targets.map((id) => forwardTo(id)));
    const okIds = targets.filter((_, i) => results[i].status === 'fulfilled');
    const firstFail = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    setSending(false);

    if (!firstFail) {
      if (targets.length === 1) openTarget(targets[0]);
      else {
        onClose();
        showToast(t('message.forwardedMany', { n: targets.length }));
      }
      return;
    }
    // Kismi/tam basarisizlik: pencere acik kalir, basarililar "Iletildi" olur ve secimden duser.
    setSentIds((prev) => [...prev, ...okIds]);
    setSelectedIds(targets.filter((id) => !okIds.includes(id)));
    setErrorMessage(extractErrorMessage(firstFail.reason));
  }

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />

          <View style={styles.content}>
            <Text style={styles.title}>{t('message.forwardTitle')}</Text>

            {forwardText ? (
              <Text style={styles.preview} numberOfLines={2}>
                {forwardText}
              </Text>
            ) : null}
            {first ? (
              <View style={styles.attachmentPreview}>
                {previewUri ? (
                  <Image source={{ uri: previewUri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbIcon]}>
                    <Ionicons name="document-outline" size={20} color={theme.colors.textMuted} />
                  </View>
                )}
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {first.filename}
                </Text>
                {attachments.length > 1 ? (
                  <Text style={styles.preview}>
                    {t('message.forwardMoreFiles', { n: attachments.length - 1 })}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {!hasContent ? <Text style={styles.preview}>{t('message.forwardEmpty')}</Text> : null}

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('message.forwardSearch')}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              autoCorrect={false}
            />

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            {channels.length === 0 ? (
              <Text style={styles.empty}>{t('message.forwardNoChannels')}</Text>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                extraData={selectedIds}
                renderItem={({ item }) => {
                  const sent = sentIds.includes(item.id);
                  const selected = selectedIds.includes(item.id);
                  return (
                    <Pressable
                      onPress={() => toggle(item.id)}
                      disabled={sent || sending || !hasContent}
                      style={styles.row}
                    >
                      <Text style={styles.rowName} numberOfLines={1}>
                        {channelTitle(item)}
                      </Text>
                      {sent ? (
                        <View style={styles.sentRow}>
                          <Ionicons name="checkmark" size={16} color={theme.colors.accent500} />
                          <Text style={styles.sentText}>{t('message.forwardedShort')}</Text>
                        </View>
                      ) : (
                        <View style={[styles.check, selected && styles.checkOn]}>
                          {selected ? (
                            <Ionicons name="checkmark" size={14} color={theme.colors.textPrimary} />
                          ) : null}
                        </View>
                      )}
                    </Pressable>
                  );
                }}
              />
            )}

            <Pressable
              onPress={send}
              disabled={sending || !hasContent || selectedIds.length === 0}
              style={[
                styles.sendButton,
                (sending || !hasContent || selectedIds.length === 0) && styles.sendButtonDisabled,
              ]}
            >
              {sending ? (
                <ActivityIndicator color={theme.colors.textPrimary} />
              ) : (
                <Text style={styles.sendButtonText}>
                  {selectedIds.length > 1
                    ? t('message.forwardSendCount', { n: selectedIds.length })
                    : t('message.forwardSend')}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    maxHeight: '80%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
    gap: 10,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  preview: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgElevated,
  },
  thumbIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentName: {
    flexShrink: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
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
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingVertical: 20,
  },
  list: {
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    marginBottom: 6,
  },
  rowName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: theme.colors.accent500,
    borderColor: theme.colors.accent500,
  },
  sendButton: {
    minHeight: theme.layout.inputMinHeight,
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
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  sentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sentText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
});
