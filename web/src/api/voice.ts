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

export const voiceApi = {
  // C1 — katılım tokeni (audio-only grant)
  getToken(channelId: string) {
    return http.post<VoiceTokenDto>(`/channels/${channelId}/voice/token`)
  },
  // C3 — anlık katılımcılar (LiveKit room state)
  getParticipants(channelId: string) {
    return http.get<VoiceParticipantDto[]>(`/channels/${channelId}/voice/participants`)
  },
}
