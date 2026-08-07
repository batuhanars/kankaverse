import api from './axios'
import type { ApiResponse } from '@/types'

/**
 * A4 — Acil Yardım / Panik. Sözleşme: contracts/SPRINT_A4_EMERGENCY_CONTRACT.md
 * channelId opsiyonel: aktif ses/video kanalındaysa gönderilir (yoksa backend VoiceSession'dan türetir).
 */
export interface TriggerEmergencyPayload {
  channelId?: string
}

export const emergencyApi = {
  trigger(
    payload: TriggerEmergencyPayload = {},
  ): Promise<ApiResponse<{ acknowledged: boolean; reportId: string }>> {
    return api.post('/emergency', payload)
  },
  // B1b — mağdurun kendi acil raporuna gönüllü metin beyanı (yalnız metin).
  addStatement(
    reportId: string,
    description: string,
  ): Promise<ApiResponse<{ acknowledged: boolean }>> {
    return api.patch(`/emergency/${reportId}`, { description })
  },
}
