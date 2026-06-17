import http from './axios'
import type { NotificationDto, NotificationPrefDto } from '@/types'

// Sprint C1 Bildirim Sözleşmesi §4 — REST endpoint'leri (envelope-aware http instance;
// response.data = unwrap edilmiş payload).
export interface NotificationListResult {
  items: NotificationDto[]
  nextCursor: string | null
}

export const notificationsApi = {
  list(cursor?: string, limit = 50) {
    const params: Record<string, string | number> = { limit }
    if (cursor) params.cursor = cursor
    return http.get<NotificationListResult>('/notifications', { params })
  },
  unreadCount() {
    return http.get<{ count: number }>('/notifications/unread-count')
  },
  markAllRead() {
    return http.post<{ count: number }>('/notifications/read')
  },
  markRead(id: string) {
    return http.post<NotificationDto>(`/notifications/${id}/read`)
  },
  // Bildirim tercihleri (guild/kanal sustur + seviye)
  getPrefs() {
    return http.get<NotificationPrefDto[]>('/notifications/prefs')
  },
  setPref(body: {
    targetType: NotificationPrefDto['targetType']
    targetId: string
    muted?: boolean
    mutedUntil?: string | null
    level?: NotificationPrefDto['level']
  }) {
    return http.put<NotificationPrefDto>('/notifications/prefs', body)
  },
}
