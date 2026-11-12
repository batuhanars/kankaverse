import { defineStore } from 'pinia'
import { ref } from 'vue'
import { messagesApi } from '@/api/messages'
import { reachedDeviceBoundary, visibleMessages } from '@kankaverse/e2ee-client'
import { useE2eeStore } from '@/stores/e2ee'
import type { MessageDto } from '@/types'

export const useMessagesStore = defineStore('messages', () => {
  const messagesByChannel = ref<Record<string, MessageDto[]>>({})
  const hasMoreByChannel = ref<Record<string, boolean>>({})
  /** E5b Parça C: bu sohbette cihaz öncesi (gizlenen) şifreli mesaj var; listenin başında tek satır bilgi. */
  const hiddenBeforeDevice = ref<Record<string, boolean>>({})

  const messagesForChannel = (channelId: string) => messagesByChannel.value[channelId] ?? []

  async function fetchMessages(channelId: string, before?: string) {
    const res = await messagesApi.list(channelId, before)
    // E1: şifreli mesajlar çözülür (düz metin `content`'e yazılır); şifresiz liste aynen geçer.
    const fetched = await useE2eeStore().hydrateHistory(
      channelId,
      res.data, // desc sırada gelir, UI için ters çevir
      async (olderThan) => (await messagesApi.list(channelId, olderThan)).data,
    )
    // E5b Parça C: cihaz öncesi, yerelde çözümü olmayan şifreli mesaj HİÇ çizilmez (kural e2ee-client'ta).
    const visible = visibleMessages(fetched)
    if (visible.length !== fetched.length) hiddenBeforeDevice.value[channelId] = true
    const reversed = [...visible].reverse()

    if (!before) {
      // C29: yerel geçici/başarısız mesajlar sunucu listesinde yok; yenilemede kaybolmasın.
      const local = (messagesByChannel.value[channelId] ?? []).filter((m) => m.localStatus)
      messagesByChannel.value[channelId] = [...reversed, ...local]
    } else {
      // Daha eski mesajları başa ekle
      messagesByChannel.value[channelId] = [
        ...reversed,
        ...(messagesByChannel.value[channelId] ?? []),
      ]
    }
    // Sayfanın tamamı cihaz öncesiyse daha eskisi istenmez (sonsuz "daha fazla yükle" olmasın).
    hasMoreByChannel.value[channelId] = res.data.length === 50 && !reachedDeviceBoundary(fetched)
  }

  function appendMessage(message: MessageDto) {
    const list = messagesByChannel.value[message.channelId]
    if (!list) {
      messagesByChannel.value[message.channelId] = [message]
      return
    }
    // C29: aynı nonce'lu geçici mesaj varsa YERİNDE gerçeğiyle değiştir (sıra kaymaz).
    // HTTP cevabı ve WS yayını hangisi önce gelirse gelsin tek mesaj kalır: ikincisi id dedup'a takılır.
    if (message.nonce) {
      const pendingIdx = list.findIndex((m) => m.localStatus && m.nonce === message.nonce)
      if (pendingIdx !== -1) {
        if (list.some((m) => m.id === message.id)) list.splice(pendingIdx, 1)
        else list[pendingIdx] = message
        return
      }
    }
    // Mükerrer önleme
    if (!list.find((m) => m.id === message.id)) {
      list.push(message)
    }
  }

  // C29 — geçici (iyimser) mesaj yaşam döngüsü; yalnız bellekte.
  function addPending(message: MessageDto) {
    const list = messagesByChannel.value[message.channelId]
    if (list) list.push(message)
    else messagesByChannel.value[message.channelId] = [message]
  }

  function patchPending(channelId: string, nonce: string, patch: Partial<MessageDto>) {
    const list = messagesByChannel.value[channelId]
    const idx = list?.findIndex((m) => m.localStatus && m.nonce === nonce) ?? -1
    if (list && idx !== -1) list[idx] = { ...list[idx], ...patch }
  }

  function removePending(channelId: string, nonce: string) {
    const list = messagesByChannel.value[channelId]
    const idx = list?.findIndex((m) => m.localStatus && m.nonce === nonce) ?? -1
    if (list && idx !== -1) list.splice(idx, 1)
  }

  // Sprint 6.2: mesaj düzenleme WS / HTTP yanıtı
  function updateMessage(dto: MessageDto) {
    const list = messagesByChannel.value[dto.channelId]
    if (!list) return
    const idx = list.findIndex((m) => m.id === dto.id)
    if (idx !== -1) {
      // Sprint V2: mentions + mentionsEveryone da güncellenir (edit → backend yeniden hesaplar)
      list[idx] = {
        ...list[idx],
        content: dto.content,
        e2eeStatus: dto.e2eeStatus, // E1: düzenlenen şifreli mesajın çözme durumu
        editedAt: dto.editedAt,
        mentions: dto.mentions,
        mentionsEveryone: dto.mentionsEveryone,
      }
    }
  }

  // Sprint 6.2: mesaj silme WS / HTTP yanıtı
  function removeMessage(channelId: string, messageId: string) {
    const list = messagesByChannel.value[channelId]
    if (!list) return
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx !== -1) list.splice(idx, 1)
  }

  // Sprint V2: reaksiyon güncelle (WS veya optimistik)
  function applyReaction(
    messageId: string,
    emoji: string,
    userId: string,
    meId: string,
    added: boolean,
  ) {
    for (const list of Object.values(messagesByChannel.value)) {
      const msg = list.find((m) => m.id === messageId)
      if (!msg) continue
      if (!msg.reactions) msg.reactions = []
      const existing = msg.reactions.find((r) => r.emoji === emoji)
      if (added) {
        if (existing) {
          existing.count++
          if (userId === meId) existing.reactedByMe = true
        } else {
          msg.reactions.push({ emoji, count: 1, reactedByMe: userId === meId })
        }
      } else {
        if (existing) {
          existing.count--
          if (userId === meId) existing.reactedByMe = false
          if (existing.count <= 0) {
            msg.reactions = msg.reactions.filter((r) => r.emoji !== emoji)
          }
        }
      }
      break
    }
  }

  // Sprint V2 Pins: pinnedAt güncelle (WS message.pinned / message.unpinned)
  function setPinned(channelId: string, messageId: string, pinnedAt: string | null) {
    const list = messagesByChannel.value[channelId]
    if (!list) return
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx !== -1) {
      list[idx] = { ...list[idx], pinnedAt }
    }
  }

  return {
    messagesByChannel,
    hasMoreByChannel,
    hiddenBeforeDevice,
    messagesForChannel,
    fetchMessages,
    appendMessage,
    addPending,
    patchPending,
    removePending,
    updateMessage,
    removeMessage,
    applyReaction,
    setPinned,
  }
})
