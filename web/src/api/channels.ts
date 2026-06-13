import http from './axios'
import type { ChannelDto, CategoryDto, ChannelMemberDto } from '@/types'

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
  // Sprint V2 — Özel kanal üye yönetimi (§1)
  getMembers(channelId: string) {
    return http.get<ChannelMemberDto[]>(`/channels/${channelId}/members`)
  },
  addMember(channelId: string, userId: string) {
    return http.post<ChannelMemberDto>(`/channels/${channelId}/members`, { userId })
  },
  removeMember(channelId: string, userId: string) {
    return http.delete<null>(`/channels/${channelId}/members/${userId}`)
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
