import http from './axios'

// E1 §2 uçları. Baytlar base64 metin (dönüşüm lib/e2ee tarafında). Envelope axios'ta açılır.

export interface E2eeDeviceInfo {
  deviceId: string
  signatureKey: string
  revokedAt: string | null
}

export interface E2eeChannelState {
  encrypted: boolean
  epoch: number | null
  groupId: string | null
  createdAt: string | null
  members: { userId: string; devices: E2eeDeviceInfo[] }[]
}

export interface E2eeCommitRow {
  epoch: number
  commit: string
  senderDeviceId: string
}

export interface E2eeWelcomeRow {
  id: string
  channelId: string
  epoch: number
  welcome: string
}

export interface E2eeWelcomeItem {
  deviceId: string
  welcome: string
}

export const e2eeApi = {
  status: () => http.get<{ enabled: boolean }>('/e2ee/status'),
  registerDevice: (signatureKey: string) =>
    http.post<{ deviceId: string }>('/e2ee/devices', { platform: 'web', signatureKey }),
  available: () => http.get<{ available: number }>('/e2ee/devices/me'),
  uploadKeyPackages: (keyPackages: string[], lastResort?: string) =>
    http.post<{ available: number }>('/e2ee/devices/me/key-packages', {
      keyPackages,
      ...(lastResort ? { lastResort } : {}),
    }),
  channelState: (channelId: string) => http.get<E2eeChannelState>(`/e2ee/channels/${channelId}`),
  claim: (channelId: string, deviceIds: string[]) =>
    http.post<{ deviceId: string; keyPackage: string }[]>(
      `/e2ee/channels/${channelId}/key-packages/claim`,
      { deviceIds },
    ),
  createGroup: (channelId: string, groupId: string, commit: string, welcomes: E2eeWelcomeItem[]) =>
    http.post<{ epoch: number }>(`/e2ee/channels/${channelId}/group`, {
      groupId,
      commit,
      welcomes,
    }),
  postCommit: (channelId: string, epoch: number, commit: string, welcomes: E2eeWelcomeItem[]) =>
    http.post<{ epoch: number }>(`/e2ee/channels/${channelId}/commits`, {
      epoch,
      commit,
      welcomes,
    }),
  commits: (channelId: string, since: number) =>
    http.get<E2eeCommitRow[]>(`/e2ee/channels/${channelId}/commits`, { params: { since } }),
  welcomes: () => http.get<E2eeWelcomeRow[]>('/e2ee/welcomes'),
  ackWelcome: (id: string) => http.post<null>(`/e2ee/welcomes/${id}/ack`),
}

/** Sunucunun makine hata kodu (envelope `error`), yoksa undefined. */
export function e2eeErrorCode(e: unknown): string | undefined {
  return (e as { response?: { data?: { error?: string } } }).response?.data?.error
}
