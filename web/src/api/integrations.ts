import http from './axios'
import type {
  AnnounceGuildDto,
  ExternalAccountDto,
  StreamAnnounceConfigDto,
  StreamProviderKey,
} from '@/types'

// C36 §2 + §4: hesap bağlama ve yayın duyurusu uçları. Dış platform token'ı istemciye hiç gelmez.
export const integrationsApi = {
  list() {
    return http.get<ExternalAccountDto[]>('/integrations')
  },
  providers() {
    return http.get<Record<StreamProviderKey, boolean>>('/integrations/providers')
  },
  announceGuilds() {
    return http.get<AnnounceGuildDto[]>('/integrations/announce-guilds')
  },
  link(provider: StreamProviderKey) {
    return http.post<{ url: string }>(`/integrations/${provider}/link`)
  },
  setShowOnProfile(provider: StreamProviderKey, showOnProfile: boolean) {
    return http.patch<ExternalAccountDto>(`/integrations/${provider}`, { showOnProfile })
  },
  unlink(provider: StreamProviderKey) {
    return http.delete<null>(`/integrations/${provider}`)
  },
}

export const streamAnnounceApi = {
  get(guildId: string) {
    return http.get<StreamAnnounceConfigDto | null>(`/guilds/${guildId}/stream-announce`)
  },
  put(
    guildId: string,
    payload: { channelId: string; mentionRoleId: string | null; enabled: boolean },
  ) {
    return http.put<StreamAnnounceConfigDto>(`/guilds/${guildId}/stream-announce`, payload)
  },
  remove(guildId: string) {
    return http.delete<null>(`/guilds/${guildId}/stream-announce`)
  },
  optIn(guildId: string) {
    return http.put<null>(`/guilds/${guildId}/stream-announce/opt-in`)
  },
  optOut(guildId: string) {
    return http.delete<null>(`/guilds/${guildId}/stream-announce/opt-in`)
  },
}
