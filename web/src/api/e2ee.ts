import http from './axios'
import type {
  BackupInfo,
  E2eeApi,
  E2eeChannelState,
  E2eeCommitRow,
  E2eeWelcomeItem,
  E2eeWelcomeRow,
  Reauth,
  SnapshotRef,
  TransferPending,
  TransferStatus,
  TransferView,
} from '@kankaverse/e2ee-client'

// E1 §2 uçları (axios adaptörü). Tipler ve arayüz paylaşılan pakette (shared/e2ee-client). Envelope axios'ta açılır.
export { e2eeErrorCode } from '@kankaverse/e2ee-client'

type TransferStep = { id: string; status: TransferStatus }
type TransferBlobRef = { size: number; sha256: string }

export const e2eeApi = {
  status: () =>
    http.get<{ enabled: boolean; franking?: boolean; backup?: boolean; transfer?: boolean }>(
      '/e2ee/status',
    ),
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
  // E5a Rev.2 §4.7: yerel mesajlar sunucuda hâlâ var mı (silinmiş geçmişte dönmez).
  messagesExist: (channelId: string, ids: string[]) =>
    http.post<{ existing: string[] }>('/e2ee/messages/exists', { channelId, ids }),
  // E5a yedek uçları (§3.2). Silme/sıfırlama reauth gövdesi taşır (axios DELETE gövdesi `data`).
  backupGet: () => http.get<BackupInfo>('/e2ee/backup'),
  backupPutKey: (body: Parameters<E2eeApi['backupPutKey']>[0]) =>
    http.put<{ keyVersion: number }>('/e2ee/backup/key', body),
  backupReset: (body: Parameters<E2eeApi['backupReset']>[0]) =>
    http.post<{ keyVersion: number }>('/e2ee/backup/reset', body),
  backupDelete: (reauth: Reauth) => http.delete<null>('/e2ee/backup', { data: reauth }),
  snapshotPresign: (ref: SnapshotRef) =>
    http.post<{ url: string }>('/e2ee/backup/snapshot/presign', ref),
  snapshotCommit: (ref: SnapshotRef) =>
    http.post<{ deviceId: string; size: number; keyVersion: number }>(
      '/e2ee/backup/snapshot/commit',
      ref,
    ),
  snapshotGetUrl: (deviceId: string) =>
    http.get<{ url: string; deviceId: string; size: number; sha256: string; keyVersion: number }>(
      `/e2ee/backup/snapshot/${deviceId}`,
    ),
  // E5b aktarım uçları (§3.2). Çağıranın cihazı sunucuda oturumdan çözülür.
  transferCreate: (commit: string) =>
    http.post<{ id: string; expiresAt: string }>('/e2ee/transfer', { commit }),
  transferPending: () => http.get<TransferPending | null>('/e2ee/transfer/pending'),
  transferGet: (id: string) => http.get<TransferView>(`/e2ee/transfer/${id}`),
  transferAccept: (id: string, pub: string) =>
    http.post<TransferStep>(`/e2ee/transfer/${id}/accept`, { pub }),
  transferReveal: (id: string, pub: string, nonce: string) =>
    http.post<TransferStep>(`/e2ee/transfer/${id}/reveal`, { pub, nonce }),
  transferUpload: (id: string, blob: TransferBlobRef) =>
    http.post<{ url: string }>(`/e2ee/transfer/${id}/upload`, blob),
  transferCommit: (id: string, blob: TransferBlobRef) =>
    http.post<TransferStep>(`/e2ee/transfer/${id}/commit`, blob),
  transferBlob: (id: string) =>
    http.get<{ url: string; size: number; sha256: string }>(`/e2ee/transfer/${id}/blob`),
  transferDone: (id: string) => http.post<TransferStep>(`/e2ee/transfer/${id}/done`),
  transferCancel: (id: string) => http.post<TransferStep>(`/e2ee/transfer/${id}/cancel`),
} satisfies E2eeApi
