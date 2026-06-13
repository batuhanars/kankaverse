import http from './axios'
import type { ChannelDto, CategoryDto } from '@/types'

export const channelsApi = {
  update(channelId: string, payload: { name?: string; ageGated?: boolean; slowModeSeconds?: number; categoryId?: string | null }) {
    return http.patch<ChannelDto>(`/channels/${channelId}`, payload)
  },
  delete(channelId: string) {
    return http.delete<null>(`/channels/${channelId}`)
  },
  markRead(channelId: string) {
    return http.post<null>(`/channels/${channelId}/read`)
  },
}

// Sprint V2 — Kategori mutasyon endpoint'leri (§4)
export const categoriesApi = {
  rename(categoryId: string, name: string) {
    return http.patch<CategoryDto>(`/categories/${categoryId}`, { name })
  },
  delete(categoryId: string) {
    return http.delete<null>(`/categories/${categoryId}`)
  },
}
