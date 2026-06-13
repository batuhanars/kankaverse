import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type NotificationType = 'friend_request' | 'friend_accept' | 'friend_remove' | 'mention'

export interface MentionPayload {
  messageId: string
  channelId: string
  guildId: string | null
  author: { id: string; username: string; avatarUrl: string | null }
  preview: string
}

export interface NotificationItem {
  id: string
  type: NotificationType
  user?: { id: string; username: string; avatarUrl: string | null }
  mention?: MentionPayload
  at: string
  read: boolean
}

export const useNotificationsStore = defineStore('notifications', () => {
  // Oturum-içi liste — kalıcılık YOK (bilinçli, contract §4)
  const items = ref<NotificationItem[]>([])

  const unreadCount = computed(() => items.value.filter((n) => !n.read).length)

  function push(notification: Omit<NotificationItem, 'id' | 'read'>) {
    items.value.unshift({
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      read: false,
    })
  }

  function markAllRead() {
    for (const item of items.value) {
      item.read = true
    }
  }

  function clear() {
    items.value = []
  }

  return { items, unreadCount, push, markAllRead, clear }
})
