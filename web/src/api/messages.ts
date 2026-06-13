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
  // Sprint 6.2: mesaj düzenleme (kendi mesajı)
  editMessage(channelId: string, messageId: string, content: string) {
    return http.patch<MessageDto>(`/channels/${channelId}/messages/${messageId}`, { content })
  },
  // Sprint 6.2: mesaj silme (kendi mesajı)
  deleteMessage(channelId: string, messageId: string) {
    return http.delete<null>(`/channels/${channelId}/messages/${messageId}`)
  },
  // Sprint V2: reaksiyon ekle
  addReaction(channelId: string, messageId: string, emoji: string) {
    return http.post<null>(`/channels/${channelId}/messages/${messageId}/reactions`, { emoji })
  },
  // Sprint V2: reaksiyon kaldır
  removeReaction(channelId: string, messageId: string, emoji: string) {
    return http.delete<null>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`)
  },
}
