import http from './axios'
import type { DmChannelDto, MessageRequestDto } from '@/types'

export const dmApi = {
  // 1-1 DM
  getChannels: () => http.get<DmChannelDto[]>('/dm/channels'),
  openChannel: (userId: string) => http.post<DmChannelDto>('/dm/channels', { userId }),
  markRead: (channelId: string) => http.post<null>(`/dm/channels/${channelId}/read`),
  clearChannel: (channelId: string) => http.delete<null>(`/dm/channels/${channelId}`),

  // C9 — Mesaj İstekleri (arkadaş-olmayan DM onay süzgeci)
  getRequests: () => http.get<MessageRequestDto[]>('/dm/requests'),
  acceptRequest: (channelId: string) => http.post<DmChannelDto>(`/dm/requests/${channelId}/accept`),
  rejectRequest: (channelId: string, block: boolean) =>
    http.post<null>(`/dm/requests/${channelId}/reject`, { block }),

  // Sprint 12 — GROUP_DM
  createGroup: (memberIds: string[], name?: string) =>
    http.post<DmChannelDto>('/dm/groups', { memberIds, ...(name ? { name } : {}) }),
  addGroupMember: (groupId: string, userId: string) =>
    http.post<null>(`/dm/groups/${groupId}/members`, { userId }),
  leaveGroup: (groupId: string) => http.delete<null>(`/dm/groups/${groupId}/members/me`),
  deleteGroup: (groupId: string) => http.delete<null>(`/dm/groups/${groupId}`),
  renameGroup: (groupId: string, name: string) =>
    http.patch<{ id: string; name: string | null }>(`/dm/groups/${groupId}`, { name }),
  removeGroupMember: (groupId: string, userId: string) =>
    http.delete<null>(`/dm/groups/${groupId}/members/${userId}`),
}
