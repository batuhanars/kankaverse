import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { useE2eeStore } from '@/stores/e2ee'
import { DeviceRemovedError, GroupNotReadyError } from '@kankaverse/e2ee-client'
import type { MessageDto } from '@/types'

/**
 * C29 — iyimser metin gönderimi (kanal ve DM aynı kuralı paylaşır).
 *
 * Gönder'e basınca geçici mesaj ANINDA listeye girer (`id = 'pending:' + nonce`), HTTP cevabı
 * beklenmez. Gerçek mesaj (HTTP cevabı ya da WS yayını, hangisi önce gelirse) aynı `nonce` ile
 * geçici mesajın yerine store'da geçer (`appendMessage`). Reddedilirse geçici mesaj `failed`
 * olur; "Tekrar dene" AYNI nonce ile yeniden gönderir, "Sil" yalnız yerelden kaldırır.
 *
 * R7-nötr: gönderim kapıları (ban, susturma, yavaş mod, blok, istek, automod) sunucuda kalır;
 * geçici mesaj yalnız gönderenin ekranında durur. Kapsam yalnız metin (+ yanıt); ekli gönderim
 * bu hattan geçmez.
 */

// Aynı kanaldaki gönderimler sırayla sunucuya gider (art arda hızlı yazınca sıra bozulmasın).
// Bir mesajın başarısızlığı sıradakini bloklamaz: her halka kendi hatasını yutar.
const queues = new Map<string, Promise<void>>()

function newNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function useOptimisticSend() {
  const i18n = useI18n()
  const t = i18n.t
  const authStore = useAuthStore()
  const messagesStore = useMessagesStore()
  const e2eeStore = useE2eeStore()

  /** Sunucu/ağ hatasını kullanıcıya gösterilecek Türkçe metne çevirir. */
  function errorText(e: unknown, onSlowMode?: (seconds: number | null) => void): string {
    // E1: yerel şifreleme hataları (ağ hatası değil): kullanıcıya doğru sebep, "tekrar dene" çalışır.
    if (e instanceof GroupNotReadyError) return t('e2ee.errors.notReady')
    if (e instanceof DeviceRemovedError) return t('e2ee.errors.deviceRemoved')
    const data = (
      e as { response?: { data?: { error?: string; message?: string; retryAfter?: number } } }
    ).response?.data
    if (!data) return t('message.local.offline')
    if (data.error === 'SLOW_MODE') {
      const seconds = typeof data.retryAfter === 'number' ? data.retryAfter : null
      onSlowMode?.(seconds)
      return seconds !== null
        ? t('message.errors.SLOW_MODE_RETRY', { seconds })
        : t('message.errors.SLOW_MODE')
    }
    const key = `message.errors.${data.error}`
    if (data.error && i18n.te(key)) return t(key)
    return data.message ?? t('common.error')
  }

  function transmit(
    channelId: string,
    nonce: string,
    text: string,
    replyToId: string | undefined,
    onSlowMode?: (seconds: number | null) => void,
  ) {
    const run = async () => {
      try {
        // E1: şifreli DM'de burada şifrelenir; çözülmüş (düz metinli) mesaj döner.
        const data = await e2eeStore.send(channelId, text, replyToId, undefined, nonce)
        // Eşleştirme store'da (appendMessage): WS yayını önce geldiyse id dedup'a takılır.
        messagesStore.appendMessage(data)
      } catch (e: unknown) {
        messagesStore.patchPending(channelId, nonce, {
          localStatus: 'failed',
          localError: errorText(e, onSlowMode),
        })
      }
    }
    const next = (queues.get(channelId) ?? Promise.resolve()).then(run)
    queues.set(channelId, next)
    return next
  }

  /** `text`: bahsetme token'ları uygulanmış, sunucuya gidecek hali. */
  function sendText(
    channelId: string,
    text: string,
    replyTo: MessageDto | null,
    onSlowMode?: (seconds: number | null) => void,
  ) {
    const me = authStore.user
    if (!me) return
    const nonce = newNonce()
    messagesStore.addPending({
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
      author: {
        id: me.id,
        username: me.username,
        avatarUrl: me.avatarUrl,
        avatarAnimatedUrl: me.avatarAnimatedUrl ?? null,
      },
      createdAt: new Date().toISOString(),
      editedAt: null,
      pinnedAt: null,
      attachments: [],
      reactions: [],
      localStatus: 'sending',
    })
    void transmit(channelId, nonce, text, replyTo?.id, onSlowMode)
  }

  /** Başarısız mesajı AYNI nonce ile yeniden gönderir. */
  function retry(msg: MessageDto, onSlowMode?: (seconds: number | null) => void) {
    if (!msg.nonce) return
    messagesStore.patchPending(msg.channelId, msg.nonce, {
      localStatus: 'sending',
      localError: undefined,
    })
    void transmit(msg.channelId, msg.nonce, msg.content, msg.replyToId ?? undefined, onSlowMode)
  }

  /** Yalnız yerelden kaldırır (sunucuya hiçbir şey gitmez). */
  function discard(msg: MessageDto) {
    if (msg.nonce) messagesStore.removePending(msg.channelId, msg.nonce)
  }

  return { sendText, retry, discard }
}
