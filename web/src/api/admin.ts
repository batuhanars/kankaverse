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
  maxUses?: number // 1-10000; yoksa sınırsız
  expiresInHours?: number // 1-8760; yoksa süresiz
  note?: string // ≤200 karakter; admin notu
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
  presence: 'online' | 'away' | 'dnd' | 'offline'
  ownedGuildCount: number
  membershipCount: number
  messageCount: number
  lastActiveAt: string | null
  deletionRequestedAt: string | null
  createdAt: string
}

// Huni paneli (Sprint C17): yalnız toplam sayılar
export interface FunnelDto {
  cohortDays: number
  generatedAt: string
  steps: {
    registered: number
    joinedGuild: number
    sentMessage: number
    returnedNextDay: number
    returnedAfter7Days: number
    activeOn3Days: number
  }
  activity: {
    activeLast7Days: number
    activeLast30Days: number
    registeredLast7Days: number
  }
}

// C40: yapay zeka video erişim hakkı (yalnız isModerator). `note` yalnız admin içindir, kullanıcıya dönmez.
export type AiGrantStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED'

export interface AiVideoGrantRowDto {
  user: { id: string; username: string }
  budgetCredits: number
  spentCredits: number
  remainingCredits: number // max(0, bütçe - kullanılan): yenilemede devredilecek
  startsAt: string
  expiresAt: string | null
  revokedAt: string | null
  status: AiGrantStatus
  note: string | null
  grantedBy: { id: string; username: string }
}

// C45: Pika bakiyesi (yalnız admin). 60 sn sunucu önbelleği; fetchedAt önbellekteki an.
export interface AiVideoBalanceDto {
  balanceUsd: number
  balanceCredits: number
  outstandingCredits: number // etkin hakların kalan kredi toplamı
  fetchedAt: string
}

export interface UpsertAiVideoGrantPayload {
  budgetCredits: number // 1-100000
  expiresAt?: string | null // ISO; yok/null = süresiz
  note?: string // ≤200
}

// C47: etkin hakta bütçeyi göreli değiştirir (dönem açmaz). Artı = ekle, eksi = düş.
export interface AdjustAiVideoGrantPayload {
  deltaCredits: number // -100000..100000, 0 geçersiz
  note?: string // ≤200
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
  getAiVideoBalance() {
    return http.get<AiVideoBalanceDto>('/admin/ai-video/balance')
  },
  listAiVideoGrants() {
    return http.get<AiVideoGrantRowDto[]>('/admin/ai-video/grants')
  },
  upsertAiVideoGrant(userId: string, payload: UpsertAiVideoGrantPayload) {
    return http.put<AiVideoGrantRowDto>(`/admin/ai-video/grants/${userId}`, payload)
  },
  adjustAiVideoGrant(userId: string, payload: AdjustAiVideoGrantPayload) {
    return http.post<AiVideoGrantRowDto>(`/admin/ai-video/grants/${userId}/adjust`, payload)
  },
  revokeAiVideoGrant(userId: string) {
    return http.delete<null>(`/admin/ai-video/grants/${userId}`)
  },
  getFunnel(cohortDays: number) {
    return http.get<FunnelDto>('/admin/funnel', { params: { cohortDays } })
  },
}
