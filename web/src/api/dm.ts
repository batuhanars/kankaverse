import http from './axios'
import type { DmChannelDto } from '@/types'

export const dmApi = {
  getChannels: () => http.get<DmChannelDto[]>('/dm/channels'),
  openChannel: (userId: string) => http.post<DmChannelDto>('/dm/channels', { userId }),
  markRead: (channelId: string) => http.post<null>(`/dm/channels/${channelId}/read`),
}
