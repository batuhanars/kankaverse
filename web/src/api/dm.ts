import http from './axios'
import type { DmChannelDto } from '@/types'

export const dmApi = {
  // 1-1 DM
  getChannels: () => http.get<DmChannelDto[]>('/dm/channels'),
  openChannel: (userId: string) => http.post<DmChannelDto>('/dm/channels', { userId }),
  markRead: (channelId: string) => http.post<null>(`/dm/channels/${channelId}/read`),
  clearChannel: (channelId: string) => http.delete<null>(`/dm/channels/${channelId}`),

  // Sprint 12 — GROUP_DM
  createGroup: (memberIds: string[], name?: string) =>
    http.post<DmChannelDto>('/dm/groups', { memberIds, ...(name ? { name } : {}) }),
  addGroupMember: (groupId: string, userId: string) =>
    http.post<null>(`/dm/groups/${groupId}/members`, { userId }),
  leaveGroup: (groupId: string) =>
    http.delete<null>(`/dm/groups/${groupId}/members/me`),
  deleteGroup: (groupId: string) =>
    http.delete<null>(`/dm/groups/${groupId}`),
  renameGroup: (groupId: string, name: string) =>
    http.patch<DmChannelDto>(`/dm/groups/${groupId}`, { name }),
}
