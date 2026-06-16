import { defineStore } from 'pinia'
import { ref } from 'vue'
import { notificationsApi } from '@/api/notifications'
import type { NotificationDto } from '@/types'

/**
 * Sprint C1 — Kalıcı bildirim store'u (SPRINT_C1_NOTIFICATIONS_CONTRACT.md §6).
 *
 * Eski oturum-içi (volatile) friend/mention biriktirme KALDIRILDI. Bell artık
 * backend `notification` WS event'i + handshake `notification:snapshot` + REST'ten beslenir.
 *
 * NOT: friends store + kanal/guild `unreadMentionCount` rozetleri AYRI sistemlerdir
 * (kendi `friend.*` / `mention` WS dinlemelerini korurlar) — bu store onlara dokunmaz.
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<NotificationDto[]>([])
  const unreadCount = ref(0)
  // REST cursor sayfalama durumu (panel scroll sonu → loadMore)
  const nextCursor = ref<string | null>(null)
  const loadingMore = ref(false)
  // İlk loadMore'a kadar REST'ten cursor alınmadı → snapshot sonrası daha eski sayfa var olabilir
  const initialFetched = ref(false)

  // handshake `notification:snapshot` → okunmamışlar (take 50) + toplam okunmamış sayısı
  function applySnapshot(payload: { notifications: NotificationDto[]; unreadCount: number }) {
    items.value = payload.notifications
    unreadCount.value = payload.unreadCount
    nextCursor.value = null
    initialFetched.value = false
  }

  // `notification` WS event'i → başa ekle + okunmamış artır
  function handleIncoming(dto: NotificationDto) {
    items.value.unshift(dto)
    if (!dto.readAt) unreadCount.value++
  }

  // REST cursor sayfalama (panel scroll sonu). İlk çağrıda snapshot yerine tam listeyi
  // (okunmuş dahil) baştan getirir; sonraki çağrılarda nextCursor ile devam eder.
  async function loadMore() {
    if (loadingMore.value) return
    if (initialFetched.value && !nextCursor.value) return
    loadingMore.value = true
    try {
      const res = await notificationsApi.list(initialFetched.value ? nextCursor.value ?? undefined : undefined)
      const { items: page, nextCursor: cursor } = res.data
      if (!initialFetched.value) {
        // İlk REST çağrısı: snapshot (yalnız okunmamış) yerine tam ilk sayfayı koy
        items.value = page
        initialFetched.value = true
      } else {
        // Devam sayfası: id bazlı tekilleştirerek ekle
        const seen = new Set(items.value.map((n) => n.id))
        items.value.push(...page.filter((n) => !seen.has(n.id)))
      }
      nextCursor.value = cursor
    } finally {
      loadingMore.value = false
    }
  }

  // Tümünü okundu işaretle → POST /notifications/read; tüm items.readAt set, badge sıfır
  async function markAllRead() {
    if (unreadCount.value === 0 && items.value.every((n) => n.readAt)) return
    await notificationsApi.markAllRead()
    const now = new Date().toISOString()
    for (const item of items.value) {
      if (!item.readAt) item.readAt = now
    }
    unreadCount.value = 0
  }

  // Tek bildirimi okundu → POST /notifications/:id/read; o item.readAt set, badge azalt
  async function markRead(id: string) {
    const item = items.value.find((n) => n.id === id)
    if (item && item.readAt) return // zaten okunmuş
    const res = await notificationsApi.markRead(id)
    const updated = res.data
    const idx = items.value.findIndex((n) => n.id === id)
    if (idx !== -1) items.value[idx] = updated
    if (unreadCount.value > 0) unreadCount.value--
  }

  return {
    items,
    unreadCount,
    nextCursor,
    loadingMore,
    applySnapshot,
    handleIncoming,
    loadMore,
    markAllRead,
    markRead,
  }
})
