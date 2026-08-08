import http from './http';

// A4 — Acil Yardım / Panik. Sözleşme: contracts/SPRINT_A4_EMERGENCY_CONTRACT.md (web
// `web/src/api/emergency.ts` ile birebir uç/gövde pariteti — envelope zaten `http.ts`
// interceptor'ında açılıyor). `channelId` opsiyonel: aktif ses kanalındaysa gönderilir
// (yoksa backend aktif `VoiceSession`'dan türetir).

export interface TriggerEmergencyPayload {
  channelId?: string;
}

export interface TriggerEmergencyResult {
  acknowledged: boolean;
  reportId: string;
}

export interface AddStatementResult {
  acknowledged: boolean;
}

export const emergencyApi = {
  async trigger(payload: TriggerEmergencyPayload = {}): Promise<TriggerEmergencyResult> {
    const res = await http.post<TriggerEmergencyResult>('/emergency', payload);
    return res.data;
  },
  // B1b — mağdurun kendi acil raporuna gönüllü metin beyanı (yalnız metin, zorunlu değil).
  async addStatement(reportId: string, description: string): Promise<AddStatementResult> {
    const res = await http.patch<AddStatementResult>(`/emergency/${reportId}`, { description });
    return res.data;
  },
};
