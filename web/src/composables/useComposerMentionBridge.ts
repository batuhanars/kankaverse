/**
 * useComposerMentionBridge — D95 "Bahset" kısayolu köprüsü.
 *
 * Kullanıcı kartı / üye listesi menüsü, aktif sohbetin yazma kutusuna erişemez (farklı ağaç).
 * Aktif yazma kutusunu sahibi (MessageArea, DmConversation) buraya kaydeder; menüler
 * `canMentionUser` ile düğmeyi gösterip göstermeyeceğine, `mentionUser` ile eklemeye karar verir.
 *
 * Ekleme, @ otomatik tamamlamanın kullandığı `useMentionAutocomplete.insertMention` ile yapılır
 * → iç gösterim (`@ad ` + pendingMentions → `<@userId>`) aynıdır.
 */
import { shallowRef, nextTick, onMounted, onBeforeUnmount, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import type { useMentionAutocomplete } from '@/composables/useMentionAutocomplete'

interface ComposerHandle {
  /** Bu sohbette yazılabiliyor mu (salt okunur / 1-1 DM / yazma yok → false). */
  canMention: () => boolean
  insert: (userId: string, username: string) => void
}

// Modül seviyesi tek kayıt: aynı anda tek sohbet yazma kutusu görünür.
const active = shallowRef<ComposerHandle | null>(null)

/** Düğme görünürlüğü: aktif yazma kutusu var + kendim değilim + engellemediğim biri. */
export function canMentionUser(userId: string): boolean {
  const handle = active.value
  if (!handle || !handle.canMention()) return false
  if (userId === useAuthStore().user?.id) return false
  return !useFriendsStore().blocked.some((b) => b.user.id === userId)
}

export function mentionUser(userId: string, username: string): void {
  if (!canMentionUser(userId)) return
  active.value?.insert(userId, username)
}

/** Yazma kutusu sahibi çağırır (MessageArea / DmConversation). */
export function useComposerMentionBridge(opts: {
  mention: ReturnType<typeof useMentionAutocomplete>
  textareaEl: Ref<HTMLTextAreaElement | null>
  canMention: () => boolean
}) {
  const handle: ComposerHandle = {
    canMention: opts.canMention,
    insert(userId, username) {
      const pos = opts.mention.insertMention({ id: userId, username })
      void nextTick(() => {
        const el = opts.textareaEl.value
        if (!el) return
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    },
  }
  onMounted(() => {
    active.value = handle
  })
  onBeforeUnmount(() => {
    if (active.value === handle) active.value = null
  })
}
