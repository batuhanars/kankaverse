import http from './axios'
import type { GuildDto, ChannelDto } from '@/types'

export const guildsApi = {
  create(name: string) {
    return http.post<GuildDto>('/guilds', { name })
  },
  list() {
    return http.get<GuildDto[]>('/guilds')
  },
  update(id: string, payload: { name?: string; adultsOnly?: boolean }) {
    return http.patch<GuildDto>(`/guilds/${id}`, payload)
  },
  getChannels(guildId: string) {
    return http.get<ChannelDto[]>(`/guilds/${guildId}/channels`)
  },
  createChannel(guildId: string, name: string) {
    return http.post<ChannelDto>(`/guilds/${guildId}/channels`, { name })
  },
}
