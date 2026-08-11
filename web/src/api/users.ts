import http from './axios'
import type { UserProfileCardDto, UserDto, DmPolicy } from '@/types'

// Sprint C5 §2 — PATCH /users/me body (yalnız verilen alanlar güncellenir)
export interface UpdateProfilePayload {
  bio?: string
  dmPolicy?: DmPolicy
  bannerColor?: string | null // profil afiş rengi preset anahtarı (veya null=varsayılan)
  readReceipts?: boolean // C12 — okundu bilgisi paylaşımı (karşılıklı)
}

// Sprint C8 §5 — avatar/profil-afişi presign sonucu (ikon deseniyle aynı şekil)
export interface MediaPresignResult {
  uploadUrl: string
  storageKey: string
}

export const usersApi = {
  getCard: (userId: string, guildId?: string) =>
    http.get<UserProfileCardDto>(
      `/users/${userId}/card`,
      guildId ? { params: { guildId } } : undefined,
    ),
  // Sprint C5 §2 — kendi profil/gizlilik güncelle → güncel UserDto
  updateProfile: (payload: UpdateProfilePayload) => http.patch<UserDto>('/users/me', payload),
  // Sprint C8 §5 — avatar (self, VerifiedEmail)
  avatarPresign: (contentType: string) =>
    http.post<MediaPresignResult>('/users/me/avatar/presign', { contentType }),
  setAvatar: (storageKey: string | null) => http.patch<UserDto>('/users/me/avatar', { storageKey }),
  // Sprint C8 §5 — profil afişi (self, VerifiedEmail)
  bannerPresign: (contentType: string) =>
    http.post<MediaPresignResult>('/users/me/banner/presign', { contentType }),
  setBanner: (storageKey: string | null) => http.patch<UserDto>('/users/me/banner', { storageKey }),
}
