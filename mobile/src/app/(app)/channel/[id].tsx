import { useEffect } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { channelsApi } from '@/api/channels';
import { MessageScreen } from '@/components/MessageScreen';
import { ChatBackButton } from '@/components/ChatBackButton';
import { useGuildPermission } from '@/hooks/useGuildPermission';
import { useUnreadStore } from '@/stores/unread';
import { t } from '@/i18n';

// Sprint M1a contract §5 ekran 2 — Kanal mesaj ekranı, AYRI TAM EKRAN (üstte geri oku — Stack
// varsayılanı). `name` sidebar'dan router param olarak taşınır (ayrı bir GET gerekmez).
export default function ChannelScreen() {
  // `jumpTo` — ortam içi aramadan gelen mesaj id'si (Sprint M1g R1). Yoksa davranış eskisi gibi.
  const { id, name, jumpTo, guildId } = useLocalSearchParams<{
    id: string;
    name?: string;
    jumpTo?: string;
    guildId?: string;
  }>();
  const router = useRouter();
  /**
   * Sprint M1h — sabitleme yetkisi. `guildId` yolla taşınıyor (kanal listesi zaten biliyor, ek
   * istek gerekmiyor); gelmezse yetki hesaplanamaz ve satır çizilmez — yanlış göstermektense
   * göstermemek.
   */
  const canPin = useGuildPermission(guildId, 'MANAGE_MESSAGES');

  // Sprint M2a §4.5/DoD — kanalı açınca ilgili rozet ANINDA düşer. Sunucuya `markRead` zaten
  // `MessageScreen` mount'unda gidiyor (contract §5); bu yalnız yerel `unread` store'un aynı anda
  // temizlenmesi — aksi halde rail/kanal listesi bir sonraki REST tazelemesine kadar bayat kalırdı.
  useEffect(() => {
    if (id && guildId) useUnreadStore.getState().clearChannel(id, guildId);
  }, [id, guildId]);

  if (!id) return null;
  const channelName = name ?? '';

  return (
    <>
      <Stack.Screen
        options={{
          title: channelName ? `#${channelName}` : '',
          // Sprint M2a §4.4 — native geri ok gizlenir, yerine toplam ping rozeti taşıyan
          // `ChatBackButton` konur. Dokunuş davranışı değişmez.
          headerBackVisible: false,
          headerLeft: () => <ChatBackButton />,
        }}
      />
      <MessageScreen
        channelId={id}
        placeholder={t('message.inputPlaceholder', { channel: channelName })}
        markRead={channelsApi.markRead}
        typingMode="named"
        jumpToMessageId={jumpTo}
        canPin={canPin}
        onOpenPins={() =>
          router.push({ pathname: '/pins', params: { channelId: id, name: name ?? '' } })
        }
      />
    </>
  );
}
