import { Stack, useLocalSearchParams } from 'expo-router';
import { channelsApi } from '@/api/channels';
import { MessageScreen } from '@/components/MessageScreen';
import { t } from '@/i18n';

// Sprint M1a contract §5 ekran 2 — Kanal mesaj ekranı, AYRI TAM EKRAN (üstte geri oku — Stack
// varsayılanı). `name` sidebar'dan router param olarak taşınır (ayrı bir GET gerekmez).
export default function ChannelScreen() {
  // `jumpTo` — ortam içi aramadan gelen mesaj id'si (Sprint M1g R1). Yoksa davranış eskisi gibi.
  const { id, name, jumpTo } = useLocalSearchParams<{ id: string; name?: string; jumpTo?: string }>();

  if (!id) return null;
  const channelName = name ?? '';

  return (
    <>
      <Stack.Screen options={{ title: channelName ? `#${channelName}` : '' }} />
      <MessageScreen
        channelId={id}
        placeholder={t('message.inputPlaceholder', { channel: channelName })}
        markRead={channelsApi.markRead}
        typingMode="named"
        jumpToMessageId={jumpTo}
      />
    </>
  );
}
