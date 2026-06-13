import http from './axios'
import type { InviteDto, GuildDto, InvitePreviewDto } from '@/types'

export const invitesApi = {
  create(guildId: string, payload?: { maxUses?: number; expiresInHours?: number }) {
    return http.post<InviteDto>(`/guilds/${guildId}/invites`, payload ?? {})
  },
  list(guildId: string) {
    return http.get<InviteDto[]>(`/guilds/${guildId}/invites`)
  },
  revoke(code: string) {
    return http.delete<null>(`/invites/${code}`)
  },
  preview(code: string) {
    return http.get<InvitePreviewDto>(`/invites/${code}`)
  },
  join(code: string) {
    return http.post<GuildDto>(`/invites/${code}/join`)
  },
}
