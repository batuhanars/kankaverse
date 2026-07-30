import type { DmChannelDto } from '@/api/dm';
import { channelTitle } from './channelTitle';

/**
 * Sözleşme §3.2/§3.3/§3.4 — bir `DmChannelDto`'dan `/dm/[id]` route param'larını üretir. Aynı şekli
 * kuran ekranlar: home.tsx, search.tsx, new-message.tsx, new-group.tsx (R2'de new-chat.tsx'in
 * yerini aldı) → Rule of Three, inline'a dağılmadan tek yerde toplandı.
 */
export function dmRouteParams(channel: DmChannelDto) {
  if (channel.type === 'DM') {
    return {
      pathname: '/dm/[id]' as const,
      params: {
        id: channel.id,
        title: channel.otherUser.username,
        avatarUrl: channel.otherUser.avatarUrl ?? '',
        otherUserId: channel.otherUser.id,
        kind: 'dm',
        canMessage: String(channel.canMessage),
        selfBlocked: String(channel.selfBlocked),
      },
    };
  }
  const name = channelTitle(channel);
  return {
    pathname: '/dm/[id]' as const,
    params: { id: channel.id, title: name, kind: 'group' },
  };
}
