import { useMemo } from 'react';
import { noticeSlots } from '@kankaverse/e2ee-client';
import { useE2eeStore } from '@/stores/e2ee';
import { useE2eeNoticesStore } from '@/stores/e2eeNotices';
import { useDmStore } from '@/stores/dm';
import { useMessagesStore } from '@/stores/messages';
import type { MessageDto } from '@/api/messages';

/**
 * E1 §4/§5 — bir DM'in şifreleme görünümü: kilit, uyarı bandı ve "bu noktadan sonra şifreli" ayracının yeri.
 * Ayraç ilk şifreli mesajın önüne konur; ama liste başında (daha eski sayfa yüklenmemişken) konursa yanlış
 * yeri gösterirdi, bu yüzden o durumda çizilmez. Henüz şifreli mesaj yoksa ayraç listenin sonunda.
 * `dividerBeforeId`: ayracın üstüne gireceği mesaj; `dividerAtEnd`: ayraç tüm mesajlardan sonra.
 */
export function useE2eeChannelView(channelId: string, messages: MessageDto[], hasMore: boolean) {
  const encrypted = useE2eeStore((s) => s.channels[channelId]?.encrypted === true);
  // Kanala özel uyarı, yoksa cihaz geneli ('' anahtarı: örn. cihaz anahtarı bozuk).
  const rawWarning = useE2eeStore((s) => s.warnings[channelId] ?? s.warnings[''] ?? null);
  // C62: eski grupta "çıkarıldı" bandı çıkmaz; tek band var (üyelik bandı, MessageScreen `disabledNotice`).
  const departed = useDmStore((s) => {
    const c = s.channels.find((x) => x.id === channelId);
    return c?.type === 'GROUP_DM' && !!c.departed;
  });
  const warning = departed ? null : rawWarning;

  const { dividerBeforeId, dividerAtEnd } = useMemo(() => {
    const first = messages.findIndex((m) => m.encrypted);
    if (first === -1) return { dividerBeforeId: null, dividerAtEnd: encrypted && messages.length > 0 };
    if (first === 0 && hasMore) return { dividerBeforeId: null, dividerAtEnd: false };
    return { dividerBeforeId: messages[first].id, dividerAtEnd: false };
  }, [messages, hasMore, encrypted]);

  // E2 §3.3: "yeni cihaz eklendi" satırları. `messages` eskiden yeniye; yuva i = i. mesajdan ÖNCE, length = son mesajdan sonra.
  const notices = useE2eeNoticesStore((s) => s.byChannel[channelId]);
  const deviceNotices = useMemo(() => noticeSlots(notices ?? [], messages, hasMore), [notices, messages, hasMore]);
  const dmChannel = useDmStore((s) => s.channels.find((c) => c.id === channelId));
  const known = useMessagesStore((s) => s.knownUsers[channelId]);
  /** Satırdaki ad: grup üyesi ya da 1-1'de karşı taraf, yoksa mesajlardan öğrenilen ad; bilinmiyorsa null. */
  const noticeName = (userId: string): string | null => {
    if (dmChannel?.type === 'GROUP_DM') return dmChannel.members.find((m) => m.id === userId)?.username ?? known?.[userId] ?? null;
    if (dmChannel?.type === 'DM' && dmChannel.otherUser.id === userId) return dmChannel.otherUser.username;
    return known?.[userId] ?? null;
  };

  return { encrypted, warning, dividerBeforeId, dividerAtEnd, deviceNotices, noticeName };
}
