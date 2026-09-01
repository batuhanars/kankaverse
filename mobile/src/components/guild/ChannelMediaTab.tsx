import { useMemo } from 'react';
import { FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import type { AttachmentDto } from '@/api/messages';
import { AttachmentView } from '../AttachmentView';
import { useChannelSearchTab } from '@/hooks/useChannelSearchTab';
import { MessageEmpty, MessageError, MessageLoading } from '../message/MessageStates';
import { t } from '@/i18n';
import { theme } from '@/theme';

const COLUMNS = 3;
const GRID_GAP = 4;

interface Cell {
  attachment: AttachmentDto;
  messageId: string;
}

interface Props {
  channelId: string;
  onOpenMessage: (messageId: string) => void;
}

/**
 * Sprint M2c contract §4.3 — "Medya" sekmesi: `has=image` (§2 — YENİ değer, `image/*` VEYA
 * `video/*` ekli mesajlar). 3 sütunlu ızgara; her hücre `AttachmentView` (T&S scanStatus mantığı
 * ikinci kez yazılmadı, bileşen `size` prop'uyla kare hücreye sığdırıldı — bkz. AttachmentView.tsx).
 *
 * Video ekleri bugün `AttachmentView`de küçük resim ÜRETMİYOR (yalnız görsel önizleniyor, video
 * dosya-rozeti olarak düşüyor) — bu **mevcut** bir sınır, bu sprintte genişletilmedi.
 *
 * Sprint M3b §5.1 — `guildId` prop'u DÜŞTÜ: kanca artık kanal kapsamlı uca gidiyor, böylece aynı
 * sekme hem ortam kanalında hem DM'de çalışıyor (fork edilmedi, tek kaynak).
 *
 * 🔴 Dokunma davranışı değişti (sahip kararı 2026-09-01): hücreye dokunmak artık sohbet ekranına
 * ATLAMIYOR, görseli TAM EKRAN açıyor (sohbetteki davranışın aynısı; WhatsApp'ın medya ızgarası da
 * böyle). Bunun için dış `Pressable` kaldırıldı ve `AttachmentView` `interactive` geçiyor — iç içe
 * iki dokunma hedefi bırakmamak şart, yoksa içteki kazanır ve dıştaki sessizce ölürdü (bileşenin
 * kendi prop notu). Mesaja gitme yolu kaybolmadı, tam ekrandaki "Mesajda göster" düğmesine taşındı.
 *
 * Görsel olmayan hücreler (video) bu değişiklikle sohbetteki kuralı izler: dokununca sistemde/
 * uygulama-içi sekmede açılır. Ayrı bir kural yazılmadı — tek davranış, iki yüzey.
 */
export function ChannelMediaTab({ channelId, onOpenMessage }: Props) {
  const { state, messages, errorMessage, retry } = useChannelSearchTab(channelId, 'image');
  const { width } = useWindowDimensions();

  const cells = useMemo<Cell[]>(
    () =>
      messages.flatMap((m) =>
        (m.attachments ?? [])
          .filter((a) => a.contentType.startsWith('image/') || a.contentType.startsWith('video/'))
          .map((a) => ({ attachment: a, messageId: m.id })),
      ),
    [messages],
  );

  if (state === 'loading') return <MessageLoading />;
  if (state === 'error') return <MessageError message={errorMessage} onRetry={retry} />;
  if (cells.length === 0) return <MessageEmpty message={t('mobile.channelDetails.mediaEmpty')} />;

  const cellSize = (width - theme.layout.panelGap * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <FlatList
      data={cells}
      numColumns={COLUMNS}
      keyExtractor={(c) => c.attachment.id}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <AttachmentView
          attachment={item.attachment}
          size={cellSize}
          interactive
          onShowInChat={() => onOpenMessage(item.messageId)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.layout.panelGap, gap: GRID_GAP },
  row: { gap: GRID_GAP },
});
