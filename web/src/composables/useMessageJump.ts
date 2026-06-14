import { ref, nextTick, watch, type Ref } from 'vue'
import { useMessagesStore } from '@/stores/messages'

/**
 * Mesaja zıpla (scroll-to-message) — pins/arama popover'larından mesaj listesine.
 *
 * İki parça:
 *  - `useMessageJump()`  → singleton istek yolu. Popover bir mesaja zıplama ister.
 *  - `useJumpToMessage()` → mesaj listesi component'ı (MessageArea / DmConversation) kurar;
 *    isteği dinler, gerekiyorsa hedef yüklenene dek geriye sayfalar, kaydırır + vurgular.
 *
 * Pins/arama yalnız aktif kanalı hedefler (popover'ın channelId'si = açık kanal),
 * bu yüzden kanal-içi kalır; cross-kanal navigasyon gerekmez.
 */

// ── Singleton istek yolu ──────────────────────────────────────────────
const targetMessageId = ref<string | null>(null)
const targetChannelId = ref<string | null>(null)
// nonce: aynı mesaja arka arkaya zıplamayı yeniden tetiklemek için (id değişmese de)
const jumpNonce = ref(0)

// Hedef yüklü değilse en fazla bu kadar sayfa (50'lik) geriye yükle (~1000 mesaj).
const MAX_JUMP_PAGES = 20

export function useMessageJump() {
  function requestJump(channelId: string, messageId: string) {
    targetChannelId.value = channelId
    targetMessageId.value = messageId
    jumpNonce.value++
  }
  return { requestJump }
}

/**
 * Mesaj listesi tarafı. `listEl` scroll konteyneri, `channelId` bu listenin kanalı.
 * Dönen `isJumping`, listenin otomatik "en alta kaydır" watcher'ı tarafından okunur
 * (zıplama sırasında alta kaymayı bastırmak için).
 */
export function useJumpToMessage(
  listEl: Ref<HTMLElement | null>,
  channelId: () => string | null,
) {
  const store = useMessagesStore()
  const isJumping = ref(false)

  async function performJump(messageId: string) {
    const cid = channelId()
    if (!cid) return
    isJumping.value = true
    try {
      // Hedef yüklü değilse bulunana dek geriye sayfala (sınırlı).
      let pages = 0
      while (!store.messagesForChannel(cid).some((m) => m.id === messageId)) {
        if (!store.hasMoreByChannel[cid]) break
        const list = store.messagesForChannel(cid)
        if (!list.length) break
        await store.fetchMessages(cid, list[0].id)
        if (++pages >= MAX_JUMP_PAGES) break
      }

      await nextTick()
      const el = listEl.value?.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      )
      if (!el) return

      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      // reflow → vurgu animasyonunu garantili yeniden tetikle
      el.classList.remove('kv-jump-highlight')
      void el.offsetWidth
      el.classList.add('kv-jump-highlight')
      window.setTimeout(() => el.classList.remove('kv-jump-highlight'), 1800)
    } finally {
      // Son fetch'in flush:'post' watcher'ı bu tick'te koşar; guard'ı sonra bırak.
      await nextTick()
      isJumping.value = false
    }
  }

  watch(jumpNonce, () => {
    if (!targetMessageId.value) return
    if (targetChannelId.value !== channelId()) return
    performJump(targetMessageId.value)
  })

  return { isJumping }
}
