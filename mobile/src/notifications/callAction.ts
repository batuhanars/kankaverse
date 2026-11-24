/**
 * C72: native arama bildirimindeki Reddet dugmesi. Kotlin `CallActionService` -> `KvCallAction` headless gorevi
 * (index.js). Bildirim native tarafta zaten kapandi; burada yalniz reddetme (ya da eski yanit ise yalniz temizlik).
 */

type CallActionData = {
  action: 'reject';
  channelId: string;
  isGroup: boolean;
  /** Bildirimin cizildigi an (ms); 0 = bilinmiyor. */
  postedAt: number;
};

const RING_TIMEOUT_MS = 30_000; // incomingCall.ts ile ayni: bugunku "eski yanit" kurali

/** Gelen arama modulu gorev ICINDE yuklenir (D70; conversationPush.ts ile ayni neden). */
function incomingCallModule(): typeof import('./incomingCall') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./incomingCall') as typeof import('./incomingCall');
}

export async function runCallAction(data: CallActionData): Promise<void> {
  if (!data.channelId) return;
  const calls = incomingCallModule();
  if (data.postedAt > 0 && Date.now() - data.postedAt > RING_TIMEOUT_MS) {
    await calls.dismissIncomingCall(data.channelId);
    return;
  }
  await calls.rejectIncomingCall(data.channelId, data.isGroup);
}
