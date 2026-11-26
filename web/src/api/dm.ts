import http from './axios'
import type { DmChannelDto, GroupDmEventDto, MessageRequestDto } from '@/types'

export const dmApi = {
  // 1-1 DM
  getChannels: () => http.get<DmChannelDto[]>('/dm/channels'),
  openChannel: (userId: string) => http.post<DmChannelDto>('/dm/channels', { userId }),
  markRead: (channelId: string) => http.post<null>(`/dm/channels/${channelId}/read`),
  clearChannel: (channelId: string) => http.delete<null>(`/dm/channels/${channelId}`),

  // C9 — Mesaj İstekleri (arkadaş-olmayan DM onay süzgeci)
  getRequests: () => http.get<MessageRequestDto[]>('/dm/requests'),
  markRequestsSeen: () => http.post<null>('/dm/requests/seen'),
  acceptRequest: (channelId: string) => http.post<DmChannelDto>(`/dm/requests/${channelId}/accept`),
  rejectRequest: (channelId: string, block: boolean) =>
    http.post<null>(`/dm/requests/${channelId}/reject`, { block }),

  // Sprint 12 — GROUP_DM
  createGroup: (memberIds: string[], name?: string) =>
    http.post<DmChannelDto>('/dm/groups', { memberIds, ...(name ? { name } : {}) }),
  addGroupMember: (groupId: string, userId: string) =>
    http.post<null>(`/dm/groups/${groupId}/members`, { userId }),
  // C64 — üyelik olay satırları (eskiden yeniye, son 200); eski üyede de çalışır (pencere sunucuda)
  getGroupEvents: (groupId: string) => http.get<GroupDmEventDto[]>(`/dm/groups/${groupId}/events`),
  leaveGroup: (groupId: string) => http.delete<null>(`/dm/groups/${groupId}/members/me`),
  // C62 — ayrıldığım/çıkarıldığım grubun sohbetini listemden sil (yalnız kendi kaydım)
  deleteDeparture: (groupId: string) => http.delete<null>(`/dm/groups/${groupId}/departure`),
  deleteGroup: (groupId: string) => http.delete<null>(`/dm/groups/${groupId}`),
  renameGroup: (groupId: string, name: string) =>
    http.patch<{ id: string; name: string | null }>(`/dm/groups/${groupId}`, { name }),
  removeGroupMember: (groupId: string, userId: string) =>
    http.delete<null>(`/dm/groups/${groupId}/members/${userId}`),
  // Grup yöneticisi ver/al — yalnız kurucu (sunucu kapısı)
  setGroupAdmin: (groupId: string, userId: string, isAdmin: boolean) =>
    isAdmin
      ? http.put<{ userId: string; isAdmin: boolean }>(`/dm/groups/${groupId}/admins/${userId}`)
      : http.delete<{ userId: string; isAdmin: boolean }>(`/dm/groups/${groupId}/admins/${userId}`),
}
