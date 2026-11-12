import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { prefetchDmPreview, useE2eeStore } from '@/stores/e2ee';
import type { DmChannelDto } from '@/api/dm';

/** Arka planda çözülecek en çok sohbet (listenin en üstündekiler; ağ ve pil yükü sınırlı kalsın). */
const PREFETCH_LIMIT = 10;

/**
 * E3 §4.1: DM listesinde şifreli son mesajın önizlemesi. Önce yerel depodan okunur (`engine.quoteText`).
 * İlk boyama beklemez: önce genel "Şifreli mesaj", okununca metin gelir.
 * Anahtar mesaj kimliği; depoda olmayan (null) kimlik tekrar denenir (sohbet/bildirim sonradan çözmüş olabilir).
 * Bildirim görevi mesajı liste baktıktan SONRA çözebilir (E3 Rev.2 cihaz turu): uygulama ön plana her
 * geldiğinde eksikler yeniden okunur. Ön planda soket/push çözmesi `plainTick`'i artırır (E3 Rev.5), eksikler
 * o anda yeniden okunur.
 * 2026-11-12: depoda hâlâ yoksa (uygulama kapalıyken gelen mesaj) o sohbet arka planda bir kez çözülür
 * (`prefetchDmPreview`, sohbet açılışıyla aynı yol). Her son mesaj kimliği için en çok bir deneme.
 */
export function useEncryptedPreviews(channels: DmChannelDto[]): Record<string, string> {
  const engine = useE2eeStore((s) => s.engine);
  const plainTick = useE2eeStore((s) => s.plainTick);
  const [byMessageId, setById] = useState<Record<string, string>>({});
  const [activeTick, setActiveTick] = useState(0);
  const prefetched = useRef(new Set<string>());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setActiveTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!engine) return;
    const pending = channels.filter(
      (c) => c.lastMessage?.encrypted && c.lastMessage.id && !byMessageId[c.lastMessage.id],
    );
    if (pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      const found: Record<string, string> = {};
      const missing: DmChannelDto[] = [];
      for (const c of pending) {
        const id = c.lastMessage!.id;
        const text = await engine.quoteText(id).catch(() => null);
        if (text) found[id] = text;
        else missing.push(c);
      }
      if (!cancelled && Object.keys(found).length > 0) setById((prev) => ({ ...prev, ...found }));
      // Depoda olmayanlar: sohbeti arka planda çöz (sırayla). Başarılı çözme `plainTick`'i artırır,
      // bu efekt yeniden koşar ve metni depodan okur.
      const toFetch = missing.filter((c) => !prefetched.current.has(c.lastMessage!.id)).slice(0, PREFETCH_LIMIT);
      for (const c of toFetch) {
        prefetched.current.add(c.lastMessage!.id);
        await prefetchDmPreview(c.id).catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, channels, byMessageId, activeTick, plainTick]);

  return byMessageId;
}
