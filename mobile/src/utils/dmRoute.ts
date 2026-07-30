import type { DmChannelDto } from '@/api/dm';
import { t } from '@/i18n';

/**
 * Sözleşme §3.2/§3.3/§3.4 — bir `DmChannelDto`'dan `/dm/[id]` route param'larını üretir. 3 ekran
 * (home.tsx, new-chat.tsx, search.tsx) aynı şekli kurmak zorunda kalıyordu → Rule of Three,
 * inline'a dağılmadan tek yerde toplandı.
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
  const name = channel.name || channel.members.map((m) => m.username).slice(0, 3).join(', ') || t('group.noName');
  return {
    pathname: '/dm/[id]' as const,
    params: { id: channel.id, title: name, kind: 'group' },
  };
}
