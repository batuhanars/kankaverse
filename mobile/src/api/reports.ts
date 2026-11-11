import http from './http';

// E4 §4.1 — web `web/src/api/reports.ts` ile aynı tipler; uç mevcut `POST /reports` (yeni uç yok).
export const ReportTargetType = {
  MESSAGE: 'MESSAGE',
  USER: 'USER',
  CHANNEL: 'CHANNEL',
  GUILD: 'GUILD',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- enum-like const+type deseni, bkz. api/channels.ts
export type ReportTargetType = (typeof ReportTargetType)[keyof typeof ReportTargetType];

export const ReportReason = {
  SPAM: 'SPAM',
  HARASSMENT: 'HARASSMENT',
  MINOR_SAFETY: 'MINOR_SAFETY',
  VIOLENCE: 'VIOLENCE',
  CSAM: 'CSAM',
  SELF_HARM: 'SELF_HARM',
  OTHER: 'OTHER',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- enum-like const+type deseni, bkz. api/channels.ts
export type ReportReason = (typeof ReportReason)[keyof typeof ReportReason];

/** E4: şifreli mesaj şikâyetinde şikâyetçinin cihazından giden çözülmüş mesaj (hedef + önceki 5). */
export interface ReportEvidenceItem {
  messageId: string;
  body: string;
  sentAt: number;
  fk?: string;
}

export interface CreateReportPayload {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
  evidence?: ReportEvidenceItem[];
}

export const reportsApi = {
  async createReport(payload: CreateReportPayload): Promise<null> {
    const res = await http.post<null>('/reports', payload);
    return res.data;
  },
};
