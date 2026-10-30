import { useEffect } from 'react';
import { useShareIntent, type ShareIntent } from 'expo-share-intent';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@/utils/attachmentUpload';
import { useShareIntentStore } from '@/stores/shareIntent';

// resetOnBackground KAPALI: paylaşım ekranındayken kullanıcı başka uygulamaya geçip dönebilir,
// içerik kaybolmasın. Tüketim aşağıda elle yapılır (bellek deposuna alınır + native taraf sıfırlanır).
const OPTIONS = { resetOnBackground: false } as const;

function toPayload(intent: ShareIntent) {
  const all = intent.files ?? [];
  const files = all.slice(0, MAX_ATTACHMENTS_PER_MESSAGE).map((f) => ({
    uri: f.path,
    fileName: f.fileName ?? null,
    mimeType: f.mimeType ?? null,
    size: f.size ?? null,
    width: f.width ?? null,
    height: f.height ?? null,
    durationMs: f.duration ?? null,
  }));
  const text = (intent.text ?? intent.webUrl ?? '').trim() || null;
  if (files.length === 0 && !text) return null;
  return { files, text: files.length ? null : text, truncated: all.length > files.length };
}

/**
 * C41 - Kök layout'ta bir kez çağrılır. Native paylaşım olayını (soğuk ya da sıcak açılış) alır,
 * bellek deposuna koyar ve native tarafı HEMEN sıfırlar: böylece sonraki normal açılış / ön plana
 * dönüş aynı paylaşımı tekrar üretmez. Yönlendirme burada DEĞİL, `(app)/_layout.tsx`te (oturum
 * ve gezinme hazır olduktan sonra).
 */
export function useShareIntentCapture(): void {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent(OPTIONS);

  useEffect(() => {
    if (!hasShareIntent) return;
    const payload = toPayload(shareIntent);
    resetShareIntent();
    if (payload) useShareIntentStore.getState().setPayload(payload);
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    // Hata metni dosya yolu taşıyabilir: yalnız sabit bir not düşülür.
    if (error) console.log('[share] native paylasim okunamadi');
  }, [error]);
}
