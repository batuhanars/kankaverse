import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AttachmentDto } from '@/api/messages';
import { AttachmentView } from '../AttachmentView';
import { useChannelSearchTab } from '@/hooks/useChannelSearchTab';
import { MessageEmpty, MessageError, MessageLoading } from '../message/MessageStates';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Row {
  attachment: AttachmentDto;
  messageId: string;
}

/**
 * Ek dosya türüne göre kaba ikon eşlemesi — sunucu tür-özel bir ikon döndürmüyor, `contentType`
 * ön ekinden çıkarılıyor. Kapsam bilinçli dar: her MIME için ayrı ikon değil, birkaç geniş kategori.
 */
function iconFor(contentType: string): keyof typeof Ionicons.glyphMap {
  if (contentType.startsWith('audio/')) return 'musical-notes-outline';
  if (contentType === 'application/pdf') return 'document-text-outline';
  if (contentType.includes('zip') || contentType.includes('compressed')) return 'archive-outline';
  return 'document-outline';
}

interface Props {
  guildId: string;
  channelId: string;
  onOpenMessage: (messageId: string) => void;
}

/**
 * Sprint M2c contract §4.3 — "Dosyalar" sekmesi: `has=file` (§2'de daraltıldı — artık yalnız
 * medya-DIŞI ekler). Ek listesi: tür ikonu + `AttachmentView` (dosya adı + boyut + scanStatus,
 * ikinci kez yazılmadı — T&S kapısı tek yerde).
 *
 * Client-side ek filtresi (image/video hariç tutma) sunucunun `has=file` tanımıyla BİREBİR aynı
 * kural (contract §2 tablosu) — burada TEKRARLANIYOR çünkü bir mesajın birden fazla eki olabilir
 * ve bunlardan biri görsel biri değilse (karma ek), yalnız medya-dışı olanı bu sekmede gösterilir.
 */
export function ChannelFilesTab({ guildId, channelId, onOpenMessage }: Props) {
  const { state, messages, errorMessage, retry } = useChannelSearchTab(guildId, channelId, 'file');

  const rows: Row[] = messages.flatMap((m) =>
    (m.attachments ?? [])
      .filter((a) => !a.contentType.startsWith('image/') && !a.contentType.startsWith('video/'))
      .map((a) => ({ attachment: a, messageId: m.id })),
  );

  if (state === 'loading') return <MessageLoading />;
  if (state === 'error') return <MessageError message={errorMessage} onRetry={retry} />;
  if (rows.length === 0) return <MessageEmpty message={t('mobile.channelDetails.filesEmpty')} />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.attachment.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable onPress={() => onOpenMessage(item.messageId)} style={styles.row}>
          <Ionicons name={iconFor(item.attachment.contentType)} size={20} color={theme.colors.textMuted} />
          <View style={styles.attachmentWrap}>
            <AttachmentView attachment={item.attachment} />
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.layout.panelGap, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attachmentWrap: { flex: 1 },
});
