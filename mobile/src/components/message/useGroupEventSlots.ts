import { useEffect, useMemo } from 'react';
import type { GroupDmEventDto } from '@/api/dm';
import { useDmStore } from '@/stores/dm';
import { useGroupEventsStore } from '@/stores/groupEvents';

const NONE: GroupDmEventDto[] = [];

/**
 * C64: grup DM olay satirlarinin mesaj listesindeki yeri (`noticeSlots` ile ayni kural): `index` = o mesajdan ONCE,
 * `messages.length` = son mesajdan sonra. Daha eski sayfa varken en eski yuklu mesajdan eski olay cizilmez.
 * Yalniz grup DM'de calisir (baska kanalda istek atilmaz).
 */
export function useGroupEventSlots(channelId: string, messages: { createdAt: string }[], hasMore: boolean) {
  const isGroup = useDmStore((s) => s.channels.find((c) => c.id === channelId)?.type === 'GROUP_DM');
  const events = useGroupEventsStore((s) => s.byChannel[channelId]) ?? NONE;

  useEffect(() => {
    if (isGroup) void useGroupEventsStore.getState().load(channelId);
  }, [channelId, isGroup]);

  return useMemo(() => {
    const slots = new Map<number, GroupDmEventDto[]>();
    if (!isGroup) return slots;
    for (const e of events) {
      const at = Date.parse(e.createdAt);
      let i = messages.findIndex((m) => Date.parse(m.createdAt) > at);
      if (i === -1) i = messages.length;
      if (i === 0 && hasMore) continue;
      slots.set(i, [...(slots.get(i) ?? []), e]);
    }
    return slots;
  }, [isGroup, events, messages, hasMore]);
}
