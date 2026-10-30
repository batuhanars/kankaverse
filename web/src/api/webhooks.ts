import http from './axios'
import type { WebhookDto } from '@/types'

// C35 §4: yonetim uclari (MANAGE_WEBHOOKS). Gelen yurutme ucu (POST /webhooks/:id/:token) istemciden cagrilmaz.
export const webhooksApi = {
  list(guildId: string) {
    return http.get<WebhookDto[]>(`/guilds/${guildId}/webhooks`)
  },
  create(guildId: string, payload: { channelId: string; name: string }) {
    return http.post<WebhookDto>(`/guilds/${guildId}/webhooks`, payload)
  },
  update(guildId: string, id: string, payload: { name?: string; channelId?: string }) {
    return http.patch<WebhookDto>(`/guilds/${guildId}/webhooks/${id}`, payload)
  },
  resetToken(guildId: string, id: string) {
    return http.post<WebhookDto>(`/guilds/${guildId}/webhooks/${id}/token`)
  },
  remove(guildId: string, id: string) {
    return http.delete<null>(`/guilds/${guildId}/webhooks/${id}`)
  },
}
