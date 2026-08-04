import { FlatList, StyleSheet } from 'react-native';
import { useChannelSearchTab } from '@/hooks/useChannelSearchTab';
import { MessagePreviewRow } from './MessagePreviewRow';
import { MessageEmpty, MessageError, MessageLoading } from '../message/MessageStates';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  channelId: string;
  onOpenMessage: (messageId: string) => void;
}

/** Sprint M2c contract §4.3 — "Bağlantılar" sekmesi: `has=link`, mesaj listesi.
 *  M3b §5.1 — `guildId` düştü (kanal kapsamlı uç); ortam kanalı ve DM aynı bileşeni kullanır. */
export function ChannelLinksTab({ channelId, onOpenMessage }: Props) {
  const { state, messages, errorMessage, retry } = useChannelSearchTab(channelId, 'link');

  if (state === 'loading') return <MessageLoading />;
  if (state === 'error') return <MessageError message={errorMessage} onRetry={retry} />;
  if (messages.length === 0) return <MessageEmpty message={t('mobile.channelDetails.linksEmpty')} />;

  return (
    <FlatList
      data={messages}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <MessagePreviewRow message={item} onPress={() => onOpenMessage(item.id)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.layout.panelGap, gap: 10 },
});
