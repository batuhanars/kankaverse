// Sprint Kapalı-Kayıt — Platform davet yönetimi (yalnız isModerator)
import http from './axios'

export interface PlatformInviteDto {
  id: string
  code: string
  note: string | null
  maxUses: number | null
  uses: number
  expiresAt: string | null
  disabledAt: string | null
  createdAt: string
}

export interface CreatePlatformInvitePayload {
  maxUses?: number     // 1-10000; yoksa sınırsız
  expiresInHours?: number  // 1-8760; yoksa süresiz
  note?: string        // ≤200 karakter; admin notu
}

// Admin kullanıcı genel-bakış satırı (yalnız isModerator). Hassas alanlar backend'de saklı.
export interface AdminUserDto {
  id: string
  username: string
  email: string
  emailVerified: boolean
  isMinor: boolean
  isModerator: boolean
  verificationStatus: string
  invitedViaCode: string | null
  createdAt: string
}

export const adminApi = {
  createPlatformInvite(payload: CreatePlatformInvitePayload) {
    return http.post<PlatformInviteDto>('/admin/platform-invites', payload)
  },
  listPlatformInvites() {
    return http.get<PlatformInviteDto[]>('/admin/platform-invites')
  },
  deletePlatformInvite(id: string) {
    return http.delete<null>(`/admin/platform-invites/${id}`)
  },
  listUsers() {
    return http.get<AdminUserDto[]>('/admin/users')
  },
}
