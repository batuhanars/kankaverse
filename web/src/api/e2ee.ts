import http from './axios'
import { announceEvicted } from '@/lib/e2ee/deviceNotices'
import type {
  BackupInfo,
  E2eeApi,
  E2eeChannelState,
  E2eeCommitRow,
  E2eeIdentityInfo,
  E2eeUserDevice,
  E2eeWelcomeItem,
  ExistingMeta,
  IdentityMaterial,
  E2eeWelcomeRow,
  EvictedDevice,
  Reauth,
  SnapshotRef,
  TransferPending,
  TransferStatus,
  TransferView,
} from '@kankaverse/e2ee-client'

// E1 §2 uçları (axios adaptörü). Tipler ve arayüz paylaşılan pakette (shared/e2ee-client). Envelope axios'ta açılır.
export { e2eeErrorCode } from '@kankaverse/e2ee-client'

/** C69: çıkış yapılmış (park) cihaz satırı. `platform`: 'web' (masaüstü uygulaması) | 'android'. */
export interface ParkedDevice {
  id: string
  platform: string
  lastSeenAt: string
  parkedAt: string
}

type TransferStep = { id: string; status: TransferStatus }
type TransferBlobRef = { size: number; sha256: string }

export const e2eeApi = {
  status: () =>
    http.get<{
      enabled: boolean
      franking?: boolean
      backup?: boolean
      transfer?: boolean
      identity?: boolean
    }>('/e2ee/status'),
  // C79: sınır doluyken yer açmak için eski bir cihaz çıkarıldıysa kullanıcıya söylenir.
  registerDevice: async (signatureKey: string) => {
    const res = await http.post<{ deviceId: string; evicted?: EvictedDevice | null }>(
      '/e2ee/devices',
      {
        platform: 'web',
        signatureKey,
      },
    )
    announceEvicted(res.data.evicted)
    return res
  },
  available: () => http.get<{ available: number }>('/e2ee/devices/me'),
  // C69: çıkışta park edilen cihazı yeni oturuma bağla.
  rebindChallenge: () => http.post<{ nonce: string }>('/e2ee/devices/rebind/challenge'),
  rebind: (deviceId: string, signature: string) =>
    http.post<{ deviceId: string }>('/e2ee/devices/rebind', { deviceId, signature }),
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
  messagesExist: (channelId: string, ids: string[], meta?: boolean) =>
    http.post<{ existing: string[]; meta?: ExistingMeta[] }>('/e2ee/messages/exists', {
      channelId,
      ids,
      ...(meta && { meta: true }),
    }),
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
  // E7 §3.2: kimlik ve cihaz imzası.
  userDevices: (userId: string) =>
    http.get<{ identity: E2eeIdentityInfo | null; devices: E2eeUserDevice[] }>(
      `/e2ee/users/${userId}/devices`,
    ),
  identityCreate: (body: IdentityMaterial) => http.put<{ version: number }>('/e2ee/identity', body),
  identityReset: (body: IdentityMaterial & Reauth) =>
    http.post<{ version: number }>('/e2ee/identity/reset', body),
  signDevice: (deviceId: string, body: { identityVersion: number; sig: string }) =>
    http.post<null>(`/e2ee/devices/${deviceId}/signature`, body),
  backupPutIdentity: (body: {
    wrappedIdentity: string
    identityVersion: number
    keyVersion: number
  }) => http.put<null>('/e2ee/backup/identity', body),
} satisfies E2eeApi

/** C69 Oturumlarım: motor portunun parçası değil (yalnız ayarlar ekranı kullanır). */
export const e2eeParkedApi = {
  list: () => http.get<ParkedDevice[]>('/e2ee/devices/parked'),
  remove: (id: string) => http.delete<null>(`/e2ee/devices/parked/${id}`),
}
