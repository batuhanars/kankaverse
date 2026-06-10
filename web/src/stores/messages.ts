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

  return {
    messagesByChannel,
    hasMoreByChannel,
    messagesForChannel,
    fetchMessages,
    appendMessage,
  }
})
