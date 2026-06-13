import http from './axios'
import type { GuildDto, ChannelDto, GuildMemberDto } from '@/types'

export const guildsApi = {
  create(name: string) {
    return http.post<GuildDto>('/guilds', { name })
  },
  list() {
    return http.get<GuildDto[]>('/guilds')
  },
  update(id: string, payload: { name?: string; adultsOnly?: boolean; rules?: string }) {
    return http.patch<GuildDto>(`/guilds/${id}`, payload)
  },
  getChannels(guildId: string) {
    return http.get<ChannelDto[]>(`/guilds/${guildId}/channels`)
  },
  createChannel(guildId: string, payload: { name: string; ageGated?: boolean }) {
    return http.post<ChannelDto>(`/guilds/${guildId}/channels`, payload)
  },
  getMembers(guildId: string) {
    return http.get<GuildMemberDto[]>(`/guilds/${guildId}/members`)
  },
}
