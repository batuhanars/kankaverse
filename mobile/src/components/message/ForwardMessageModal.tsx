import { useEffect, useMemo, useState } from 'react';
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
import { messagesApi, type MessageDto } from '@/api/messages';
import { attachmentsApi } from '@/api/attachments';
import { extractErrorMessage } from '@/api/errors';
import { useDmStore } from '@/stores/dm';
import { channelTitle } from '@/utils/channelTitle';
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
interface Props {
  message: MessageDto;
  onClose: () => void;
}

export function ForwardMessageModal({ message, onClose }: Props) {
  const bottomInset = useSheetInsets();
  const channels = useDmStore((s) => s.channels);

  const [query, setQuery] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const forwardText = message.content.trim();
  const attachments = message.attachments ?? [];
  const first = attachments[0] ?? null;
  // Metin de ek de yoksa iletilecek bir sey yok (bugunku bos durum).
  const hasContent = !!forwardText || attachments.length > 0;

  // Onizleme kucuk resmi: video icin mesajdaki kare, gorsel icin sunucudan kisa omurlu adres.
  const [previewUri, setPreviewUri] = useState<string | null>(
    first?.contentType.startsWith('video/') && first.thumbnail
      ? `data:image/jpeg;base64,${first.thumbnail}`
      : null,
  );
  useEffect(() => {
    if (!first || !first.contentType.startsWith('image/') || first.scanStatus !== 'CLEAN') return;
    let cancelled = false;
    attachmentsApi
      .getUrl(first.id)
      .then((res) => {
        if (!cancelled) setPreviewUri(res.url);
      })
      .catch(() => {}); // onizleme kozmetik; iletme kapisi sunucuda
    return () => {
      cancelled = true;
    };
  }, [first]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return channels;
    return channels.filter((c) => channelTitle(c).toLocaleLowerCase('tr').includes(q));
  }, [channels, query]);

  async function forwardTo(channelId: string) {
    if (sendingId || sentIds.includes(channelId) || !hasContent) return;
    setSendingId(channelId);
    setErrorMessage('');
    try {
      // Her hedef kendi kopyalarini alir (ek tek mesaja baglanir). Paralel kopya; biri reddedilirse
      // hedef "gonderildi" isaretlenmez (kopyalanip baglanmayan ek sahipsiz kalir, presign'daki gibi).
      const copies = await Promise.all(attachments.map((a) => attachmentsApi.forward(a.id)));
      await messagesApi.send(
        channelId,
        forwardText,
        undefined,
        copies.map((c) => c.attachmentId),
      );
      setSentIds((prev) => [...prev, channelId]);
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSendingId(null);
    }
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
                renderItem={({ item }) => {
                  const sent = sentIds.includes(item.id);
                  return (
                    <Pressable
                      onPress={() => forwardTo(item.id)}
                      disabled={sent || !!sendingId || !hasContent}
                      style={styles.row}
                    >
                      <Text style={styles.rowName} numberOfLines={1}>
                        {channelTitle(item)}
                      </Text>
                      {sendingId === item.id ? (
                        <ActivityIndicator color={theme.colors.textMuted} />
                      ) : sent ? (
                        <View style={styles.sentRow}>
                          <Ionicons name="checkmark" size={16} color={theme.colors.accent500} />
                          <Text style={styles.sentText}>{t('message.forwardedShort')}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            )}
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
