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

  /**
   * Kendi efektif durumumuz. Kendi presence'ımız sunucudan GELMEZ (presence yalnız
   * kitleye yayılır, kullanıcının kendisine değil) → statusMap[myId] ilk yüklemede boş
   * kalır. O yüzden kendimiz için ASLA 'offline' dönmeyiz (bağlıyız):
   *  - manuel dnd/away → doğrudan o (bilinçli seçim, idle'ı ezer)
   *  - manuel online → auto-idle güncellemesi (statusMap) varsa o, yoksa 'online'
   */
  function selfStatus(myId: string): PresenceStatus {
    if (manualStatus.value !== 'online') return manualStatus.value
    return statusMap[myId] ?? 'online'
  }

  function getStatus(userId: string): PresenceStatus {
    const myId = useAuthStore().user?.id
    if (myId && userId === myId) return selfStatus(myId)
    return statusMap[userId] ?? 'offline'
  }

  // Kendi kullanıcımızın durumu (UserCard için)
  const myStatus = computed<PresenceStatus>(() => {
    const myId = useAuthStore().user?.id
    if (!myId) return 'offline'
    return selfStatus(myId)
  })

  return { statusMap, applySnapshot, applyUpdate, getStatus, myStatus, manualStatus, setManualStatus }
})
