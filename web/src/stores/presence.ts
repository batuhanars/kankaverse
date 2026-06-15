import { defineStore } from 'pinia'
import { reactive, ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

export type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline'
/** Kullanıcının elle seçebildiği durumlar (offline = yalnız disconnect). */
export type SelectableStatus = 'online' | 'away' | 'dnd'

export const usePresenceStore = defineStore('presence', () => {
  // userId → status haritası (reaktif)
  const statusMap = reactive<Record<string, PresenceStatus>>({})

  // Kullanıcının BİLEREK seçtiği durum (UserCard). Auto-boşta yalnız 'online' iken
  // devreye girer; 'dnd'/'away' seçimi otomatik değiştirilmez. Reconnect sonrası
  // sunucuya geri uygulanır (bellek-içi presence sıfırlanınca durum korunur).
  const manualStatus = ref<SelectableStatus>('online')
  function setManualStatus(status: SelectableStatus) {
    manualStatus.value = status
  }

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

  return { statusMap, applySnapshot, applyUpdate, getStatus, myStatus, manualStatus, setManualStatus }
})
