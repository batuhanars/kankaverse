import http from './axios'
import type { DiscoveryListDto, DiscoveryTagDto, GuildDto } from '@/types'

// Sprint C6 §2 — Keşfet (Sunucu Keşfi) endpoint'leri.
// adultsOnly süzme + join gate'leri backend'de; frontend ekstra süzme yapmaz.
export const discoveryApi = {
  listGuilds(params: { search?: string; tag?: string; cursor?: string } = {}) {
    return http.get<DiscoveryListDto>('/discovery/guilds', { params })
  },
  popularTags() {
    return http.get<DiscoveryTagDto[]>('/discovery/tags')
  },
  joinDiscovery(guildId: string) {
    return http.post<GuildDto>(`/guilds/${guildId}/join-discovery`)
  },
}
