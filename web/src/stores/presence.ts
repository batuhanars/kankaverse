import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

export type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline'

export const usePresenceStore = defineStore('presence', () => {
  // userId → status haritası (reaktif)
  const statusMap = reactive<Record<string, PresenceStatus>>({})

  function applySnapshot(states: Array<{ userId: string; status: PresenceStatus }>) {
    for (const { userId, status } of states) {
      statusMap[userId] = status
    }
  }

  function applyUpdate(userId: string, status: PresenceStatus) {
    statusMap[userId] = status
  }

  function getStatus(userId: string): PresenceStatus {
    return statusMap[userId] ?? 'offline'
  }

  // Kendi kullanıcımızın durumu (UserCard için)
  const myStatus = computed<PresenceStatus>(() => {
    const authStore = useAuthStore()
    const myId = authStore.user?.id
    if (!myId) return 'offline'
    return statusMap[myId] ?? 'offline'
  })

  return { statusMap, applySnapshot, applyUpdate, getStatus, myStatus }
})
