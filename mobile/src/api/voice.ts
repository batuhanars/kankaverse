import http from './http';

// Sözleşme §2 — sunucu HTTP yüzeyi birebir (envelope zaten `http.ts` interceptor'ında açılıyor,
// `res.data` gerçek `data` alanıdır). Uçlar `api/src/modules/voice/voice.controller.ts`'ten
// doğrulandı: `POST/GET/POST /channels/:id/voice/{token,participants,leave}`.

export interface VoiceTokenDto {
  token: string;
  url: string;
  canPublish: boolean;
  bitrate?: number;
  canPublishCamera?: boolean;
  canPublishScreen?: boolean;
}

export interface VoiceParticipantDto {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface VoiceParticipantsDto {
  startedAt: number | null;
  participants: VoiceParticipantDto[];
}

export const voiceApi = {
  async getToken(channelId: string): Promise<VoiceTokenDto> {
    const res = await http.post<VoiceTokenDto>(`/channels/${channelId}/voice/token`);
    return res.data;
  },
  async getParticipants(channelId: string): Promise<VoiceParticipantsDto> {
    const res = await http.get<VoiceParticipantsDto>(`/channels/${channelId}/voice/participants`);
    return res.data;
  },
  // Dev-fix sinyali (api/CLAUDE.md notu, voice.controller.ts): LiveKit webhook'u yakalayamadığında
  // presence'ı tetikler. Best-effort — çağıran taraf hatayı yutar (bkz. stores/voice.ts leave()).
  async leave(channelId: string): Promise<null> {
    const res = await http.post<null>(`/channels/${channelId}/voice/leave`);
    return res.data;
  },
};
