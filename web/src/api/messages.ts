import http from './axios'
import type { MessageDto, ReactionGroupDto } from '@/types'

export const messagesApi = {
  list(channelId: string, before?: string, limit = 50) {
    const params: Record<string, string | number> = { limit }
    if (before) params.before = before
    return http.get<MessageDto[]>(`/channels/${channelId}/messages`, { params })
  },
  // Sprint 5 §4: content opsiyonel (≥1 attachment varsa boş içerik geçerli); attachmentIds opsiyonel
  // C29: nonce yalnız iyimser (metin) gönderimde verilir; sunucu aynen yankılar.
  send(
    channelId: string,
    content: string,
    replyToId?: string,
    attachmentIds?: string[],
    nonce?: string,
  ) {
    return http.post<MessageDto>(`/channels/${channelId}/messages`, {
      content: content || undefined,
      replyToId,
      attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
      nonce,
    })
  },
  // E1: şifreli DM mesajı. content GÖNDERİLMEZ (sunucu 409 E2EE_REQUIRED); ciphertext base64.
  sendEncrypted(
    channelId: string,
    cipher: { ciphertext: string; epoch: number; frankingTag?: string }, // E4: frankingTag yalnız v2'de
    replyToId?: string,
    nonce?: string,
    attachmentIds?: string[],
  ) {
    return http.post<MessageDto>(`/channels/${channelId}/messages`, {
      ...cipher,
      replyToId,
      nonce,
      attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
    })
  },
  editEncrypted(
    channelId: string,
    messageId: string,
    cipher: { ciphertext: string; epoch: number; frankingTag?: string },
  ) {
    return http.patch<MessageDto>(`/channels/${channelId}/messages/${messageId}`, cipher)
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
  // C46 §3: kimler tepki verdi (emoji grupları, ilk tepki zamanına göre)
  listReactions(channelId: string, messageId: string) {
    return http.get<ReactionGroupDto[]>(`/channels/${channelId}/messages/${messageId}/reactions`)
  },
  // Sprint V2: reaksiyon kaldır
  removeReaction(channelId: string, messageId: string, emoji: string) {
    return http.delete<null>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    )
  },
  // Sprint V2 Pins: mesajı sabitle (§4 POST)
  pinMessage(channelId: string, messageId: string) {
    return http.post<null>(`/channels/${channelId}/messages/${messageId}/pin`)
  },
  // Sprint V2 Pins: sabitlemeyi kaldır (§4 DELETE)
  unpinMessage(channelId: string, messageId: string) {
    return http.delete<null>(`/channels/${channelId}/messages/${messageId}/pin`)
  },
  // Sprint V2 Pins: kanal sabit mesajları (§4 GET)
  fetchPins(channelId: string) {
    return http.get<MessageDto[]>(`/channels/${channelId}/pins`)
  },
  // Sprint V2 Search: kanal mesaj araması (§3 contract)
  searchMessages(channelId: string, q: string, before?: string) {
    const params: Record<string, string> = { q }
    if (before) params.before = before
    return http.get<MessageDto[]>(`/channels/${channelId}/messages/search`, { params })
  },
  // Sunucu-geneli arama: erişilebilir kanallarda, kanal-gruplu sonuç.
  // R13 + item 2: q/from/mentions/in/has opsiyonel — en az biri dolu olmalı.
  // from=authorId · mentions=userId · in=channelId · has='link'|'file'
  searchGuildMessages(
    guildId: string,
    opts: { q?: string; from?: string; mentions?: string; in?: string; has?: string },
  ) {
    const params: Record<string, string> = {}
    if (opts.q) params.q = opts.q
    if (opts.from) params.from = opts.from
    if (opts.mentions) params.mentions = opts.mentions
    if (opts.in) params.in = opts.in
    if (opts.has) params.has = opts.has
    return http.get<GuildSearchGroup[]>(`/guilds/${guildId}/messages/search`, { params })
  },
}

export interface GuildSearchGroup {
  channelId: string
  channelName: string
  messages: MessageDto[]
}
