import http from './axios'
import type { ChannelDto } from '@/types'

export const channelsApi = {
  update(channelId: string, payload: { name?: string; ageGated?: boolean; slowModeSeconds?: number }) {
    return http.patch<ChannelDto>(`/channels/${channelId}`, payload)
  },
  delete(channelId: string) {
    return http.delete<null>(`/channels/${channelId}`)
  },
}
