import { useMemo } from 'react';
import { useE2eeStore } from '@/stores/e2ee';
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
  const warning = useE2eeStore((s) => s.warnings[channelId] ?? s.warnings[''] ?? null);

  const { dividerBeforeId, dividerAtEnd } = useMemo(() => {
    const first = messages.findIndex((m) => m.encrypted);
    if (first === -1) return { dividerBeforeId: null, dividerAtEnd: encrypted && messages.length > 0 };
    if (first === 0 && hasMore) return { dividerBeforeId: null, dividerAtEnd: false };
    return { dividerBeforeId: messages[first].id, dividerAtEnd: false };
  }, [messages, hasMore, encrypted]);

  return { encrypted, warning, dividerBeforeId, dividerAtEnd };
}
