import http from './axios'
import type { MessageDto } from '@/types'

export const messagesApi = {
  list(channelId: string, before?: string, limit = 50) {
    const params: Record<string, string | number> = { limit }
    if (before) params.before = before
    return http.get<MessageDto[]>(`/channels/${channelId}/messages`, { params })
  },
  // Sprint 5 §4: content opsiyonel (≥1 attachment varsa boş içerik geçerli); attachmentIds opsiyonel
  send(channelId: string, content: string, replyToId?: string, attachmentIds?: string[]) {
    return http.post<MessageDto>(`/channels/${channelId}/messages`, {
      content: content || undefined,
      replyToId,
      attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
    })
  },
}
