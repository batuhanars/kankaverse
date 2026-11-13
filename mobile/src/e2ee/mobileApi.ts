// E2eeApi'nin mobil HTTP adaptörü (E1 §2). http.ts yanıt zarfını zaten açar; `response.data` gerçek yük.
// Hatalar axios hatasıdır: `response.data.error` makine kodu `e2eeErrorCode` ile okunur.
import type {
  BackupInfo,
  E2eeApi,
  E2eeChannelState,
  E2eeCommitRow,
  E2eeWelcomeRow,
  TransferPending,
  TransferStatus,
  TransferView,
} from '@kankaverse/e2ee-client'
import http from '@/api/http'

type TransferStep = { id: string; status: TransferStatus }
type TransferBlobRef = { size: number; sha256: string }

export const mobileE2eeApi: E2eeApi = {
  status: () => http.get<{ enabled: boolean; franking?: boolean; backup?: boolean; transfer?: boolean }>('/e2ee/status'),
  registerDevice: (signatureKey) =>
    http.post<{ deviceId: string }>('/e2ee/devices', { platform: 'android', signatureKey }),
  available: () => http.get<{ available: number }>('/e2ee/devices/me'),
  // C69: çıkışta park edilen cihazı yeni oturuma bağla (hata kodu `response.data.error`).
  rebindChallenge: () => http.post<{ nonce: string }>('/e2ee/devices/rebind/challenge'),
  rebind: (deviceId, signature) => http.post<{ deviceId: string }>('/e2ee/devices/rebind', { deviceId, signature }),
  uploadKeyPackages: (keyPackages, lastResort) =>
    http.post<{ available: number }>('/e2ee/devices/me/key-packages', {
      keyPackages,
      ...(lastResort ? { lastResort } : {}),
    }),
  channelState: (channelId) => http.get<E2eeChannelState>(`/e2ee/channels/${channelId}`),
  claim: (channelId, deviceIds) =>
    http.post<{ deviceId: string; keyPackage: string }[]>(
      `/e2ee/channels/${channelId}/key-packages/claim`,
      { deviceIds },
    ),
  createGroup: (channelId, groupId, commit, welcomes) =>
    http.post<{ epoch: number }>(`/e2ee/channels/${channelId}/group`, { groupId, commit, welcomes }),
  postCommit: (channelId, epoch, commit, welcomes) =>
    http.post<{ epoch: number }>(`/e2ee/channels/${channelId}/commits`, { epoch, commit, welcomes }),
  commits: (channelId, since) =>
    http.get<E2eeCommitRow[]>(`/e2ee/channels/${channelId}/commits`, { params: { since } }),
  welcomes: () => http.get<E2eeWelcomeRow[]>('/e2ee/welcomes'),
  ackWelcome: (id) => http.post<null>(`/e2ee/welcomes/${id}/ack`),
  // E5a Rev.2 §4.7: yerel mesajlar sunucuda hâlâ var mı (silinmiş geçmişte dönmez).
  messagesExist: (channelId, ids) =>
    http.post<{ existing: string[] }>('/e2ee/messages/exists', { channelId, ids }),
  // E5a yedek uçları (§3.2). Silme/sıfırlama reauth gövdesi taşır (axios DELETE gövdesi `data`).
  backupGet: () => http.get<BackupInfo>('/e2ee/backup'),
  backupPutKey: (body) => http.put<{ keyVersion: number }>('/e2ee/backup/key', body),
  backupReset: (body) => http.post<{ keyVersion: number }>('/e2ee/backup/reset', body),
  backupDelete: (reauth) => http.delete<null>('/e2ee/backup', { data: reauth }),
  snapshotPresign: (ref) => http.post<{ url: string }>('/e2ee/backup/snapshot/presign', ref),
  snapshotCommit: (ref) =>
    http.post<{ deviceId: string; size: number; keyVersion: number }>('/e2ee/backup/snapshot/commit', ref),
  snapshotGetUrl: (deviceId) =>
    http.get<{ url: string; deviceId: string; size: number; sha256: string; keyVersion: number }>(
      `/e2ee/backup/snapshot/${deviceId}`,
    ),
  // E5b aktarım uçları (§3.2). Çağıranın cihazı sunucuda oturumdan çözülür.
  transferCreate: (commit) => http.post<{ id: string; expiresAt: string }>('/e2ee/transfer', { commit }),
  transferPending: () => http.get<TransferPending | null>('/e2ee/transfer/pending'),
  transferGet: (id) => http.get<TransferView>(`/e2ee/transfer/${id}`),
  transferAccept: (id, pub) => http.post<TransferStep>(`/e2ee/transfer/${id}/accept`, { pub }),
  transferReveal: (id, pub, nonce) => http.post<TransferStep>(`/e2ee/transfer/${id}/reveal`, { pub, nonce }),
  transferUpload: (id, blob) => http.post<{ url: string }>(`/e2ee/transfer/${id}/upload`, blob),
  transferCommit: (id, blob) => http.post<TransferStep>(`/e2ee/transfer/${id}/commit`, blob),
  transferBlob: (id) => http.get<{ url: string; size: number; sha256: string }>(`/e2ee/transfer/${id}/blob`),
  transferDone: (id) => http.post<TransferStep>(`/e2ee/transfer/${id}/done`),
  transferCancel: (id) => http.post<TransferStep>(`/e2ee/transfer/${id}/cancel`),
}

/** C69 Oturumlarım: çıkış yapılmış (park) cihazlar. Motor portunun parçası değil (yalnız ayarlar ekranı kullanır). */
export interface ParkedDevice {
  id: string
  platform: string
  lastSeenAt: string
  parkedAt: string
}

export const mobileParkedApi = {
  list: () => http.get<ParkedDevice[]>('/e2ee/devices/parked'),
  remove: (id: string) => http.delete<null>(`/e2ee/devices/parked/${id}`),
}
