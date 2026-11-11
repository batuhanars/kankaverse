import api from './axios'
import type { ApiResponse } from '@/types'
import type { ReportReason, ReportTargetType } from './reports'

export const ReportStatus = {
  OPEN: 'OPEN',
  TRIAGED: 'TRIAGED',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
  ESCALATED: 'ESCALATED',
} as const
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus]

export const ModActionType = {
  WARN: 'WARN',
  MUTE: 'MUTE',
  KICK: 'KICK',
  BAN: 'BAN',
} as const
export type ModActionType = (typeof ModActionType)[keyof typeof ModActionType]

/**
 * A4 — Acil rapor bağlam snapshot'ı (metadata-only). Yalnız EMERGENCY raporlarında zengin gelir;
 * normal raporlarda minimal referans. İçerik/AV YOK.
 */
export interface EmergencySnapshot {
  presserId?: string
  isMinor?: boolean
  triggeredAt?: string
  channelId?: string
  channelName?: string | null
  guildId?: string | null
  participants?: string[]
  broadcasters?: { userId: string; sources: string[] }[]
}

export interface ReportDto {
  id: string
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  description?: string
  status: ReportStatus
  priority: number
  createdAt: string
  contextSnapshot?: EmergencySnapshot
  // E4 Rev.1: kuyruk kanıt içeriği DÖNMEZ, yalnız sayı ve doğrulanmamış var mı.
  evidenceCount?: number
  hasUnverified?: boolean
}

/** E4: ek yalnız referanstır (kopya yok); önizleme/indirme yok. */
export interface EvidenceAttachmentRef {
  id: string
  contentType: string
  size: number
  storageKey?: string
}

/** E4 §3.4: şikâyet kanıt satırı. `source`: server = sunucunun okuduğu, reporter = şikâyetçinin cihazından. */
export interface ReportEvidenceDto {
  id: string
  messageId: string
  authorId: string | null
  authorUsername: string | null // yoksa (silinmiş hesap) kimlik gösterilir
  channelId: string
  content: string
  attachments: EvidenceAttachmentRef[]
  messageAt: string
  source: 'server' | 'reporter'
  verified: boolean
  isTarget: boolean
}

/** GET /moderation/reports/:id — her görüntüleme denetim kaydına yazılır. */
export interface ReportDetailDto extends ReportDto {
  evidence: ReportEvidenceDto[]
}

export interface CreateActionPayload {
  targetUserId: string
  type: ModActionType
  reason: string
  relatedReportId?: string
  expiresInHours?: number
}

export interface AuditLogDto {
  id: string
  actorId: string
  action: string
  entityType: string
  entityId: string
  metadata?: unknown
  createdAt: string
}

export const moderationApi = {
  getQueue(): Promise<ApiResponse<ReportDto[]>> {
    return api.get('/moderation/queue')
  },
  getReport(id: string): Promise<ApiResponse<ReportDetailDto>> {
    return api.get(`/moderation/reports/${id}`)
  },
  createAction(payload: CreateActionPayload): Promise<ApiResponse<null>> {
    return api.post('/moderation/actions', payload)
  },
  getAudit(): Promise<ApiResponse<AuditLogDto[]>> {
    return api.get('/audit')
  },
}
