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

export interface ReportDto {
  id: string
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  description?: string
  status: ReportStatus
  priority: number
  createdAt: string
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
  createAction(payload: CreateActionPayload): Promise<ApiResponse<null>> {
    return api.post('/moderation/actions', payload)
  },
  getAudit(): Promise<ApiResponse<AuditLogDto[]>> {
    return api.get('/audit')
  },
}
