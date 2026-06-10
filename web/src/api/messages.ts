import http from './axios'
import type { MessageDto } from '@/types'

export const messagesApi = {
  list(channelId: string, before?: string, limit = 50) {
    const params: Record<string, string | number> = { limit }
    if (before) params.before = before
    return http.get<MessageDto[]>(`/channels/${channelId}/messages`, { params })
  },
  send(channelId: string, content: string, replyToId?: string) {
    return http.post<MessageDto>(`/channels/${channelId}/messages`, { content, replyToId })
  },
}
