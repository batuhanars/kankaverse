import http from './axios'
import type { GuildDto, ChannelDto, GuildMemberDto, CategoryDto } from '@/types'

export interface IconPresignResult {
  uploadUrl: string
  storageKey: string
}

export const guildsApi = {
  create(name: string) {
    return http.post<GuildDto>('/guilds', { name })
  },
  list() {
    return http.get<GuildDto[]>('/guilds')
  },
  update(
    id: string,
    payload: {
      name?: string
      adultsOnly?: boolean
      description?: string
      // Sprint C6 — Keşfet alanları (MANAGE_GUILD)
      discoverable?: boolean
      tags?: string[]
      bannerColor?: string | null
    },
  ) {
    return http.patch<GuildDto>(`/guilds/${id}`, payload)
  },
  getChannels(guildId: string) {
    return http.get<ChannelDto[]>(`/guilds/${guildId}/channels`)
  },
  createChannel(guildId: string, payload: { name: string; type?: 'GUILD_TEXT' | 'GUILD_VOICE'; ageGated?: boolean; isPrivate?: boolean; categoryId?: string | null }) {
    return http.post<ChannelDto>(`/guilds/${guildId}/channels`, payload)
  },
  getMembers(guildId: string) {
    return http.get<GuildMemberDto[]>(`/guilds/${guildId}/members`)
  },
  iconPresign(guildId: string, contentType: string) {
    return http.post<IconPresignResult>(`/guilds/${guildId}/icon/presign`, { contentType })
  },
  setIcon(guildId: string, storageKey: string | null) {
    return http.patch<GuildDto>(`/guilds/${guildId}/icon`, { storageKey })
  },
  // Sprint V2 — Kategori endpoint'leri (§4)
  getCategories(guildId: string) {
    return http.get<CategoryDto[]>(`/guilds/${guildId}/categories`)
  },
  createCategory(guildId: string, name: string) {
    return http.post<CategoryDto>(`/guilds/${guildId}/categories`, { name })
  },
  // Sprint V2 Guild Admin — Ortam sil (OWNER)
  deleteGuild(guildId: string) {
    return http.delete<null>(`/guilds/${guildId}`)
  },
  // Sprint V2 Guild Admin — Üye rol değiştir (OWNER)
  updateMemberRole(guildId: string, userId: string, role: 'ADMIN' | 'MEMBER') {
    return http.patch<GuildMemberDto>(`/guilds/${guildId}/members/${userId}/role`, { role })
  },
  // Sprint V2 Guild Admin — Üye at / kick (OWNER veya ADMIN)
  kickMember(guildId: string, userId: string) {
    return http.delete<null>(`/guilds/${guildId}/members/${userId}`)
  },
  // Ortam yönetimi — ayrıl / sahiplik devri / ban
  leaveGuild(guildId: string) {
    return http.post<null>(`/guilds/${guildId}/leave`)
  },
  transferOwnership(guildId: string, userId: string) {
    return http.post<null>(`/guilds/${guildId}/members/${userId}/transfer`)
  },
  banMember(guildId: string, userId: string, reason?: string) {
    return http.post<null>(`/guilds/${guildId}/members/${userId}/ban`, { reason })
  },
  getBans(guildId: string) {
    return http.get<GuildBanDto[]>(`/guilds/${guildId}/bans`)
  },
  unbanMember(guildId: string, userId: string) {
    return http.delete<null>(`/guilds/${guildId}/bans/${userId}`)
  },
  // Drag-reorder: kanal/kategori toplu sıralama
  reorderChannels(guildId: string, items: { id: string; position: number; categoryId?: string | null }[]) {
    return http.patch<null>(`/guilds/${guildId}/channels/reorder`, { items })
  },
  reorderCategories(guildId: string, items: { id: string; position: number }[]) {
    return http.patch<null>(`/guilds/${guildId}/categories/reorder`, { items })
  },
}

export interface GuildBanDto {
  userId: string
  username: string
  avatarUrl: string | null
  reason: string | null
  bannedAt: string
}
