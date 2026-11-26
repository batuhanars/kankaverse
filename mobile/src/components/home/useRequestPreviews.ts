import { useCallback, useEffect, useRef, useState } from 'react';
import { isBeforeDevice } from '@kankaverse/e2ee-client';
import { prefetchDmPreview, useE2eeStore } from '@/stores/e2ee';
import { t } from '@/i18n';
import type { MessageRequestDto } from '@/api/dm';

/** Arka planda çözülecek en çok istek (liste kısa kalır; ağ yükü sınırlı). */
const PREFETCH_LIMIT = 10;

/**
 * C75 §3.3: Mesaj İstekleri ekranında şifreli ilk mesajı çözer. DM listesi önizlemesiyle
 * (`useEncryptedPreviews`) aynı yol: `prefetchDmPreview` (Welcome, son sayfa, MLS çözme). İstek DTO'su
 * mesaj kimliği taşımadığı için kanal kimliğiyle çalışır; çözülen sonuç kanal başına bir kez saklanır.
 * Çözme yereldir: okundu bilgisi gitmez, kabul sayılmaz. Motor hazır olunca (`engine`) yeniden denenir.
 *
 * `textOf(req)`: şifresizse sunucunun önizlemesi; şifreliyse çözülen düz metin, gövde boşsa (yalnız ek)
 * sunucunun tür etiketi, çözülemediyse genel "Şifreli mesaj". Boş balon çıkmaz.
 */
export function useRequestPreviews(requests: MessageRequestDto[]) {
  const engine = useE2eeStore((s) => s.engine);
  const [plain, setPlain] = useState<Record<string, string>>({});
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!engine) return; // motor hazır olunca bu efekt yeniden koşar
    const todo = requests.filter((r) => r.encrypted && !tried.current.has(r.channelId)).slice(0, PREFETCH_LIMIT);
    if (todo.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const r of todo) {
        const out = (await prefetchDmPreview(r.channelId).catch(() => [])) ?? [];
        const first = out.find((m) => m.e2eeStatus === 'ok' && !isBeforeDevice(m));
        if (first) {
          tried.current.add(r.channelId); // çözülemeyen (Welcome henüz gelmedi) bir sonraki tetiklemede yeniden denenir
          if (!cancelled) setPlain((prev) => ({ ...prev, [r.channelId]: first.content ?? '' }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, requests]);

  return useCallback(
    (r: MessageRequestDto): string => {
      if (!r.encrypted) return r.preview;
      const text = plain[r.channelId];
      if (text === undefined) return t('e2ee.preview');
      return text.trim() ? text : r.preview || t('e2ee.preview');
    },
    [plain],
  );
}
