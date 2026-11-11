import type { NotificationPreview } from '@kankaverse/e2ee-client';
import { flushPushCryptoMetrics, openLocalMobileEngine } from '@/e2ee/startEngine';
import { markDecrypted, useE2eeStore } from '@/stores/e2ee';
import { loadCachedUserId } from './headlessEngine';
import type { PushE2ee } from './e2eePayload';

/**
 * E3 Rev.2 §9.3: şifreli DM push'unun metnini YEREL depodan çözer. Bu yolda HTTP, oturum yenileme, `me`
 * ve ağlı motor kurulumu YOKTUR; bildirim zaten genel metinle çıkmıştır, burası yalnız onu iyileştirir.
 * Hata fırlatmaz (`unavailable`). Çözülen metin ve şifreli yük LOGLANMAZ, yalnız süre ve sonuç türü.
 */
type Outcome = NotificationPreview['kind'];

const metric = (ms: number, outcome: Outcome, cold: boolean) =>
  console.log(`[E2EE] push-decrypt-offline ${ms}ms sonuç=${outcome} ${cold ? 'soğuk' : 'sıcak'}`);

/**
 * UI'da motor açıksa o kullanılır; yoksa yerel motor ağsız açılır (kullanıcı kimliği önbellekten). Bildirim
 * çözmesi ve hızlı cevap (`quickReply.ts`) ortak kullanır; yalnız `decryptOffline`/`encryptOffline`/`rememberSent`
 * gibi ağsız uçlar çağrılmalıdır. Motor yoksa (E2EE kapalı, cihaz yok, kimlik yok) null.
 */
export async function pickLocalEngine() {
  const running = useE2eeStore.getState().engine;
  if (running) return running;
  const userId = await loadCachedUserId();
  return userId ? openLocalMobileEngine(userId) : null;
}

export async function decryptOfflineForPush(
  messageId: string,
  conversationId: string,
  e: PushE2ee,
): Promise<NotificationPreview> {
  const cold = !useE2eeStore.getState().engine;
  const t0 = Date.now();
  let result: NotificationPreview = { kind: 'unavailable' };
  try {
    const engine = await pickLocalEngine();
    if (engine) {
      result = await engine.decryptOffline({
        id: messageId,
        channelId: conversationId,
        createdAt: e.createdAt,
        encrypted: true,
        ciphertext: e.ciphertext,
        senderDeviceId: e.senderDeviceId,
        frankingTag: e.frankingTag,
      });
    }
  } catch {
    // hata türü bile loglanmaz: sonuç unavailable, bildirim genel metinle kalır
  }
  // Liste ön plandaysa önizleme bu çözmeyi de görsün (tek setState, zamanlayıcı yok).
  if (result.kind === 'text') markDecrypted();
  metric(Date.now() - t0, result.kind, cold);
  flushPushCryptoMetrics();
  return result;
}
