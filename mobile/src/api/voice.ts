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
  // Sprint M4h §3 (R16) — kalıcı (server) susturma listesi; yalnız GUILD_VOICE'ta dolu,
  // DM/GROUP_DM'de her zaman []. Moderasyon sheet'inin "Sustur"/"Susturmayı Kaldır" etiketinin
  // TEK okuma kaynağı — bkz. `stores/voice.ts` `serverMutedUserIds` yorumu (D53 tuzağı).
  mutedUserIds: string[];
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

  // ── Sprint M4h — ses kanalı moderasyonu (R11/R11B, R7'den geçti; istemci yalnız uç çağırır) ──
  // Uçlar `api/src/modules/voice/voice.controller.ts` (`VoiceModerationController`/`VoiceInspectController`)
  // ile birebir; envelope zaten `http.ts`te açılıyor, `data: null` dönüyor.

  /** Sustur (kalıcı) — MUTE_MEMBERS. */
  async mute(channelId: string, userId: string): Promise<null> {
    const res = await http.post<null>(`/voice/${channelId}/mute/${userId}`);
    return res.data;
  },
  /** Susturmayı kaldır — MUTE_MEMBERS. */
  async unmute(channelId: string, userId: string): Promise<null> {
    const res = await http.delete<null>(`/voice/${channelId}/mute/${userId}`);
    return res.data;
  },
  /** Taşı — MOVE_MEMBERS. */
  async move(channelId: string, userId: string, targetChannelId: string): Promise<null> {
    const res = await http.post<null>(`/voice/${channelId}/move/${userId}`, { targetChannelId });
    return res.data;
  },
  /** Yayını durdur (video/ekran düşer, ses kalır) — MUTE_MEMBERS. */
  async stopBroadcast(channelId: string, targetUserId: string): Promise<null> {
    const res = await http.post<null>(`/channels/${channelId}/voice/stop-broadcast`, { targetUserId });
    return res.data;
  },
  /** Odadan çıkar (ses oturumundan düşür, ortam üyeliği korunur) — MOVE_MEMBERS. */
  async disconnectParticipant(channelId: string, targetUserId: string): Promise<null> {
    const res = await http.post<null>(`/channels/${channelId}/voice/disconnect`, { targetUserId });
    return res.data;
  },
};
