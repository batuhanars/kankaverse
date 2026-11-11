import { useEffect, useState } from 'react';
import { useE2eeStore } from '@/stores/e2ee';
import type { DmChannelDto } from '@/api/dm';

/**
 * E3 §4.1: DM listesinde şifreli son mesajın önizlemesi. Çözme YAPILMAZ, yalnız yerel depodan okunur
 * (`engine.quoteText`). İlk boyama beklemez: önce genel "Şifreli mesaj", okununca metin gelir.
 * Anahtar mesaj kimliği; depoda olmayan (null) kimlik tekrar denenir (sohbet/bildirim sonradan çözmüş olabilir).
 */
export function useEncryptedPreviews(channels: DmChannelDto[]): Record<string, string> {
  const engine = useE2eeStore((s) => s.engine);
  const [byMessageId, setById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!engine) return;
    const ids = channels.flatMap((c) =>
      c.lastMessage?.encrypted && c.lastMessage.id && !byMessageId[c.lastMessage.id] ? [c.lastMessage.id] : [],
    );
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      const found: Record<string, string> = {};
      for (const id of ids) {
        const text = await engine.quoteText(id).catch(() => null);
        if (text) found[id] = text;
      }
      if (!cancelled && Object.keys(found).length > 0) setById((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, channels, byMessageId]);

  return byMessageId;
}
