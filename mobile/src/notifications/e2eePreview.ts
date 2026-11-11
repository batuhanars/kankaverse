import { useE2eeStore } from '@/stores/e2ee';
import { prepareHeadlessEngine } from './headlessEngine';
import type { PushE2ee } from './e2eePayload';

/**
 * E3 §5: şifreli DM push'unun bildirim metni. Çözme motorun `decryptForNotification` ucundadır (kuyruk,
 * depo, iptal kuralı orada); burası yalnız veriyi ayrıştırır, motoru hazırlar ve 8 sn sınırı uygular.
 * Hiçbir istisna bildirimi engellemez: yalnız `hidden` engeller. Çözülen metin ve şifreli yük LOGLANMAZ.
 */
const DECRYPT_TIMEOUT_MS = 8000;

export type PushPreview = { kind: 'text'; body: string } | { kind: 'hidden' } | { kind: 'generic' };
type Outcome = 'text' | 'hidden' | 'unavailable' | 'timeout';

/** Yalnız süre, sonuç ve soğuk/sıcak: içerik yok. */
const metric = (ms: number, outcome: Outcome, cold: boolean) =>
  console.log(`[E2EE] push-decrypt ${ms}ms sonuç=${outcome} ${cold ? 'soğuk' : 'sıcak'}`);

async function decrypt(messageId: string, conversationId: string, e: PushE2ee): Promise<PushPreview> {
  if (!useE2eeStore.getState().engine) await prepareHeadlessEngine();
  const engine = useE2eeStore.getState().engine;
  if (!engine) return { kind: 'generic' }; // motor bu kullanıcı için kapalı (bayrak/izin listesi)
  const r = await engine.decryptForNotification({
    id: messageId,
    channelId: conversationId,
    createdAt: e.createdAt,
    encrypted: true,
    ciphertext: e.ciphertext,
    senderDeviceId: e.senderDeviceId,
  });
  return r.kind === 'text' || r.kind === 'hidden' ? r : { kind: 'generic' };
}

/** Süre aşımı ve istisna `generic` döner (genel metin); arka plandaki çözme sürebilir, depoya yazması zararsız. */
export async function previewForPush(
  messageId: string | null,
  conversationId: string,
  e2ee: PushE2ee,
): Promise<PushPreview> {
  if (!messageId) return { kind: 'generic' };
  const cold = !useE2eeStore.getState().engine;
  const t0 = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), DECRYPT_TIMEOUT_MS);
  });
  try {
    const r = await Promise.race([decrypt(messageId, conversationId, e2ee), timeout]);
    if (r === 'timeout') {
      metric(Date.now() - t0, 'timeout', cold);
      return { kind: 'generic' };
    }
    metric(Date.now() - t0, r.kind === 'generic' ? 'unavailable' : r.kind, cold);
    return r;
  } catch {
    metric(Date.now() - t0, 'unavailable', cold);
    return { kind: 'generic' };
  } finally {
    clearTimeout(timer);
  }
}
