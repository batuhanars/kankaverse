import api from './axios'
import type { ApiResponse } from '@/types'

export const ReportTargetType = {
  MESSAGE: 'MESSAGE',
  USER: 'USER',
  CHANNEL: 'CHANNEL',
  GUILD: 'GUILD',
} as const
export type ReportTargetType = (typeof ReportTargetType)[keyof typeof ReportTargetType]

export const ReportReason = {
  SPAM: 'SPAM',
  HARASSMENT: 'HARASSMENT',
  MINOR_SAFETY: 'MINOR_SAFETY',
  VIOLENCE: 'VIOLENCE',
  CSAM: 'CSAM',
  SELF_HARM: 'SELF_HARM',
  OTHER: 'OTHER',
} as const
export type ReportReason = (typeof ReportReason)[keyof typeof ReportReason]

export interface CreateReportPayload {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  description?: string
}

export const reportsApi = {
  createReport(payload: CreateReportPayload): Promise<ApiResponse<null>> {
    return api.post('/reports', payload)
  },
}
