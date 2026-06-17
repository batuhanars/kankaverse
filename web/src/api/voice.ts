import http from './axios'

export interface VoiceTokenDto {
  token: string
  url: string
  canPublish: boolean
  bitrate?: number // ses bit hızı (kbps) — istemci publish'te uygular
  canPublishCamera?: boolean // C4 — kamera grant (build-dark: default false)
  canPublishScreen?: boolean // C4 — ekran paylaşımı grant (build-dark: default false)
}

export interface VoiceParticipantDto {
  userId: string
  username: string
  avatarUrl: string | null
}

// REV-13b: katılımcılar + kanal aktif-başlangıcı (en erken katılım, ms epoch)
export interface VoiceParticipantsResponse {
  startedAt: number | null
  participants: VoiceParticipantDto[]
}

export const voiceApi = {
  // C1 — katılım tokeni (audio-only grant)
  getToken(channelId: string) {
    return http.post<VoiceTokenDto>(`/channels/${channelId}/voice/token`)
  },
  // C3 — anlık katılımcılar + kanal aktif-başlangıcı (LiveKit room state)
  getParticipants(channelId: string) {
    return http.get<VoiceParticipantsResponse>(`/channels/${channelId}/voice/participants`)
  },
  // R11 — moderasyon: server-mute (kalıcı). Envelope data: null.
  mute(channelId: string, userId: string) {
    return http.post<null>(`/voice/${channelId}/mute/${userId}`)
  },
  unmute(channelId: string, userId: string) {
    return http.delete<null>(`/voice/${channelId}/mute/${userId}`)
  },
  // R11 — moderasyon: başka ses kanalına taşı. Envelope data: null.
  move(channelId: string, userId: string, targetChannelId: string) {
    return http.post<null>(`/voice/${channelId}/move/${userId}`, { targetChannelId })
  },
  // Dev-fix: ayrılış sinyali — LiveKit webhook localhost'a ulaşamadığında presence günceller.
  leave(channelId: string) {
    return http.post<null>(`/channels/${channelId}/voice/leave`)
  },
  // R11B — mod: yayını durdur (MUTE_MEMBERS). Hedefin video/ekran kaynakları düşer, ses kalır.
  stopBroadcast(channelId: string, targetUserId: string) {
    return http.post<null>(`/channels/${channelId}/voice/stop-broadcast`, { targetUserId })
  },
  // R11B — mod: odadan çıkar (MOVE_MEMBERS). Ortam üyeliği korunur; hedef yeniden katılabilir.
  disconnect(channelId: string, targetUserId: string) {
    return http.post<null>(`/channels/${channelId}/voice/disconnect`, { targetUserId })
  },
}
