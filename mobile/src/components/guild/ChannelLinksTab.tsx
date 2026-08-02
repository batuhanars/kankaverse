import { FlatList, StyleSheet } from 'react-native';
import { useChannelSearchTab } from '@/hooks/useChannelSearchTab';
import { MessagePreviewRow } from './MessagePreviewRow';
import { MessageEmpty, MessageError, MessageLoading } from '../message/MessageStates';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  guildId: string;
  channelId: string;
  onOpenMessage: (messageId: string) => void;
}

/** Sprint M2c contract §4.3 — "Bağlantılar" sekmesi: `has=link`, mesaj listesi. */
export function ChannelLinksTab({ guildId, channelId, onOpenMessage }: Props) {
  const { state, messages, errorMessage, retry } = useChannelSearchTab(guildId, channelId, 'link');

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
