import { defineStore } from 'pinia'
import { ref } from 'vue'
import { messagesApi } from '@/api/messages'
import type { MessageDto } from '@/types'

export const useMessagesStore = defineStore('messages', () => {
  const messagesByChannel = ref<Record<string, MessageDto[]>>({})
  const hasMoreByChannel = ref<Record<string, boolean>>({})

  const messagesForChannel = (channelId: string) => messagesByChannel.value[channelId] ?? []

  async function fetchMessages(channelId: string, before?: string) {
    const res = await messagesApi.list(channelId, before)
    const fetched = res.data // desc sırada gelir, UI için ters çevir
    const reversed = [...fetched].reverse()

    if (!before) {
      messagesByChannel.value[channelId] = reversed
    } else {
      // Daha eski mesajları başa ekle
      messagesByChannel.value[channelId] = [
        ...reversed,
        ...(messagesByChannel.value[channelId] ?? []),
      ]
    }
    hasMoreByChannel.value[channelId] = fetched.length === 50
  }

  function appendMessage(message: MessageDto) {
    const list = messagesByChannel.value[message.channelId]
    if (!list) {
      messagesByChannel.value[message.channelId] = [message]
    } else {
      // Mükerrer önleme
      if (!list.find((m) => m.id === message.id)) {
        list.push(message)
      }
    }
  }

  // Sprint 6.2: mesaj düzenleme WS / HTTP yanıtı
  function updateMessage(dto: MessageDto) {
    const list = messagesByChannel.value[dto.channelId]
    if (!list) return
    const idx = list.findIndex((m) => m.id === dto.id)
    if (idx !== -1) {
      // Sprint V2: mentions alanı da güncellenir (edit → backend yeniden hesaplar)
      list[idx] = { ...list[idx], content: dto.content, editedAt: dto.editedAt, mentions: dto.mentions }
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
  function applyReaction(messageId: string, emoji: string, userId: string, meId: string, added: boolean) {
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
    messagesForChannel,
    fetchMessages,
    appendMessage,
    updateMessage,
    removeMessage,
    applyReaction,
    setPinned,
  }
})
