import type { MessageDto } from '@/api/messages';
import { DeviceRemovedError, GroupNotReadyError } from '@kankaverse/e2ee-client';
import { sendMessage } from '@/stores/e2ee';
import { useAuthStore } from '@/stores/auth';
import { useMessagesStore } from '@/stores/messages';
import { t } from '@/i18n';

/**
 * C29 - iyimser metin gonderimi (web `useOptimisticSend.ts` ile ayni kural).
 *
 * Gonder'e basinca gecici mesaj ANINDA listeye girer (`id = 'pending:' + nonce`), HTTP cevabi
 * beklenmez. Gercek mesaj (HTTP cevabi ya da WS yayini, hangisi once gelirse) ayni `nonce` ile
 * gecici mesajin yerine store'da gecer (`appendMessage`). Reddedilirse gecici mesaj `failed`
 * olur; "Tekrar dene" AYNI nonce ile yeniden gonderir, "Sil" yalniz yerelden kaldirir.
 *
 * R7-notr: gonderim kapilari sunucuda kalir; gecici mesaj yalniz gonderenin ekraninda durur.
 * Kapsam yalniz metin (+ yanit); ekli gonderim bu hattan gecmez.
 */

// Ayni kanaldaki gonderimler sirayla sunucuya gider (art arda hizli yazinca sira bozulmasin).
// Bir mesajin basarisizligi siradakini bloklamaz: her halka kendi hatasini yutar.
const queues = new Map<string, Promise<void>>();

// Yeni bagimlilik eklenmez (expo-crypto kurulu degil): zaman + rastgelelik yeterli, nonce yalniz
// bu oturumda gecici mesaji eslemek icin var, guvenlik anahtari degil.
function newNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Sunucu `message`'i (Turkce) varsa o; cevap hic gelmediyse (ag) "Baglanti yok" metni. */
function errorText(e: unknown): string {
  // E1: yerel şifreleme hataları (ağ hatası değil): kullanıcıya doğru sebep, "Tekrar dene" çalışır.
  if (e instanceof GroupNotReadyError) return t('e2ee.errors.notReady');
  if (e instanceof DeviceRemovedError) return t('e2ee.errors.deviceRemoved');
  const response = (e as { response?: { data?: { message?: string } } }).response;
  if (!response) return t('message.local.offline');
  return response.data?.message ?? t('common.error');
}

function transmit(channelId: string, nonce: string, text: string, replyToId: string | undefined) {
  const run = async () => {
    const store = useMessagesStore.getState();
    try {
      const message = await sendMessage(channelId, text, replyToId, undefined, nonce);
      // Eslestirme store'da (appendMessage): WS yayini once geldiyse id dedup'a takilir.
      store.appendMessage(message);
    } catch (e) {
      store.patchPending(channelId, nonce, { localStatus: 'failed', localError: errorText(e) });
    }
  };
  const next = (queues.get(channelId) ?? Promise.resolve()).then(run);
  queues.set(channelId, next);
  return next;
}

/** `text`: bahsetme token'lari uygulanmis, sunucuya gidecek hali. */
export function sendOptimisticText(channelId: string, text: string, replyTo: MessageDto | null) {
  const me = useAuthStore.getState().user;
  if (!me) return;
  const nonce = newNonce();
  useMessagesStore.getState().addPending({
    id: `pending:${nonce}`,
    nonce,
    channelId,
    content: text,
    replyToId: replyTo?.id ?? null,
    replyTo: replyTo
      ? {
          id: replyTo.id,
          content: replyTo.content.trim() ? replyTo.content.slice(0, 300) : '[dosya]',
          authorUsername: replyTo.author.username,
          attachment: replyTo.attachments?.[0] ?? null,
        }
      : null,
    author: { id: me.id, username: me.username, avatarUrl: me.avatarUrl },
    createdAt: new Date().toISOString(),
    editedAt: null,
    pinnedAt: null,
    attachments: [],
    reactions: [],
    localStatus: 'sending',
  });
  void transmit(channelId, nonce, text, replyTo?.id);
}

/** Basarisiz mesaji AYNI nonce ile yeniden gonderir. */
export function retryOptimistic(message: MessageDto) {
  if (!message.nonce) return;
  useMessagesStore
    .getState()
    .patchPending(message.channelId, message.nonce, { localStatus: 'sending', localError: undefined });
  void transmit(message.channelId, message.nonce, message.content, message.replyToId ?? undefined);
}

/** Yalniz yerelden kaldirir (sunucuya hicbir sey gitmez). */
export function discardOptimistic(message: MessageDto) {
  if (message.nonce) useMessagesStore.getState().removePending(message.channelId, message.nonce);
}
