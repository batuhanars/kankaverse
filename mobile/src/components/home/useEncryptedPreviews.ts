import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useE2eeStore } from '@/stores/e2ee';
import type { DmChannelDto } from '@/api/dm';

/**
 * E3 §4.1: DM listesinde şifreli son mesajın önizlemesi. Çözme YAPILMAZ, yalnız yerel depodan okunur
 * (`engine.quoteText`). İlk boyama beklemez: önce genel "Şifreli mesaj", okununca metin gelir.
 * Anahtar mesaj kimliği; depoda olmayan (null) kimlik tekrar denenir (sohbet/bildirim sonradan çözmüş olabilir).
 * Bildirim görevi mesajı liste baktıktan SONRA çözebilir (E3 Rev.2 cihaz turu): uygulama ön plana her
 * geldiğinde eksikler yeniden okunur. Ön planda soket/push çözmesi `plainTick`'i artırır (E3 Rev.5), eksikler
 * o anda yeniden okunur.
 */
export function useEncryptedPreviews(channels: DmChannelDto[]): Record<string, string> {
  const engine = useE2eeStore((s) => s.engine);
  const plainTick = useE2eeStore((s) => s.plainTick);
  const [byMessageId, setById] = useState<Record<string, string>>({});
  const [activeTick, setActiveTick] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setActiveTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

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
  }, [engine, channels, byMessageId, activeTick, plainTick]);

  return byMessageId;
}
