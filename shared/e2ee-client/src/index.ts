// e2ee-client: platformdan bağımsız istemci motoru (E1 §6.3). Web ve mobil yalnız adaptör yazar (ports.ts).
export {
  E2eeEngine,
  type EvidenceItem,
  EVIDENCE_CONTEXT,
  type Hydrated,
  type HydrateOptions,
  type LocalEngineDeps,
  type NotificationPreview,
  type SentCipher,
} from './engine'
export { type PushCommit } from './commitPreview'
export { GroupNotReadyError, type E2eeContext } from './context'
export { DeviceRemovedError, type ChannelInfo } from './channelSync'
export { DeviceBrokenError } from './deviceSetup'
export { serialLock } from './lock'
export {
  BackupLockedError,
  BackupNotConfiguredError,
  TransferPayloadError,
  TransferSessionError,
  TransferTooLargeError,
  e2eeErrorCode,
} from './errors'
export { TransferManager } from './transfer'
export { isBeforeDevice, reachedDeviceBoundary, visibleMessages, type VisibilityMessage } from './historyVisibility'
export {
  BACKUP_MIN_INTERVAL_MS,
  BackupManager,
  type BackupRunResult,
  type BackupState,
  type PasswordResult,
  type RestoreResult,
} from './backup'
export { BackupScheduler, BACKUP_FIRST_DELAY_MS, BACKUP_MAX_DELAY_MS, type Timers } from './backupScheduler'
export { buildSnapshot, parseSnapshot, pickCandidates, shouldWrite, type SnapshotContent, type SnapshotMessage } from './backupSnapshot'
export { fromB64, toB64 } from './b64'
export { MAX_MENTION_IDS, mentionIdsOf } from './mentionIds'
export { noticeSlots } from './deviceNoticeSlots'
export type { DeviceNotice, StoredStatus, StoredMessage } from './localStore'
export type { WireMessage } from './hydrate'
export type * from './ports'
