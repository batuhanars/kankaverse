import http from './axios'

export interface VoiceTokenDto {
  token: string
  url: string
  canPublish: boolean
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
}
