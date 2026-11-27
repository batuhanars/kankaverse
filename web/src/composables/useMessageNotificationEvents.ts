import { onUnmounted } from 'vue'
import router from '@/router'
import { useDmStore } from '@/stores/dm'
import { useChannelsStore } from '@/stores/channels'
import { useMessagesStore } from '@/stores/messages'
import { useE2eeStore } from '@/stores/e2ee'
import { closeOsNotificationsForChannel } from '@/utils/activeDevice'
import { redrawShellNotificationFailed } from '@/composables/useMessageToasts'

interface Target {
  channelId: string
  guildId: string | null
}

/** `dm:<channelId>` | `ch:<guildId>:<channelId>` (sabit biçim; main aynı deseni doğrular). */
function parseTag(tag: string): Target | null {
  const parts = tag.split(':')
  if (parts[0] === 'dm' && parts.length === 2) return { channelId: parts[1], guildId: null }
  if (parts[0] === 'ch' && parts.length === 3) return { channelId: parts[2], guildId: parts[1] }
  return null
}

/**
 * C83 Rev.1: kabuk mesaj bildiriminden gelen olaylar (tıkla / cevapla / okundu).
 * AppShell'de bir kez çağrılır. Köprü yoksa (tarayıcı, eski kabuk) no-op.
 * Cevap, mesaj kutusunun gönderim yolunu kullanır (`e2eeStore.send`: şifreli DM'de şifreleme dahil).
 */
export function useMessageNotificationEvents() {
  const bridge = window.kankaverse
  if (!bridge?.onMessageNotificationEvent) return

  const dmStore = useDmStore()
  const channelsStore = useChannelsStore()
  const messagesStore = useMessagesStore()
  const e2eeStore = useE2eeStore()

  function open(target: Target) {
    if (target.guildId) {
      void router.push({
        name: 'channel',
        params: { guildId: target.guildId, channelId: target.channelId },
      })
    } else {
      void router.push({ name: 'dm', params: { channelId: target.channelId } })
    }
  }

  async function markRead(target: Target) {
    try {
      if (target.guildId) await channelsStore.markChannelRead(target.channelId, target.guildId)
      else await dmStore.markRead(target.channelId)
    } catch {
      /* okundu işaretleme kritik değil */
    }
    closeOsNotificationsForChannel(target.channelId)
  }

  async function reply(tag: string, target: Target, text: string) {
    try {
      const sent = await e2eeStore.send(target.channelId, text)
      // Liste hiç yüklenmemişse eklenmez: tek mesajlık kısmi liste "yüklü" sanılıp geçmiş çekilmesin.
      if (messagesStore.messagesByChannel[target.channelId]) messagesStore.appendMessage(sent)
    } catch {
      redrawShellNotificationFailed(tag, text)
      return
    }
    await markRead(target)
  }

  const unsubscribe = bridge.onMessageNotificationEvent((e) => {
    const target = parseTag(e.tag)
    if (!target) return
    if (e.type === 'click') {
      closeOsNotificationsForChannel(target.channelId)
      open(target)
    } else if (e.type === 'read') {
      void markRead(target)
    } else if (e.type === 'reply' && e.text?.trim()) {
      void reply(e.tag, target, e.text)
    }
  })

  onUnmounted(unsubscribe)
}
