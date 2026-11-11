// e2ee-core: istemcinin gördüğü tek yüz (sözleşme §3.1). ts-mls tipleri buradan dışarı çıkmaz.
export { createDevice, deserializeDevice, Device } from './device'
export { createGroup, joinFromWelcome, type CreateGroupParams } from './groupSetup'
export {
  Group,
  deserializeGroup,
  type DecryptResult,
  type EncryptResult,
  type ProcessCommitResult,
} from './group'
export type { PendingCommit, WelcomeOut } from './pending'
export type { ExpectedDevice } from './members'
export { tunePurePrecompute } from './pure/suite'
export { webProvider, pureProvider, detectWebProvider, type CryptoProvider } from './provider'
export {
  decodePayload,
  encodePayload,
  textPayload,
  type DecodedPayload,
  type TextPayload,
  type TextPayloadV1,
  type TextPayloadV2,
} from './payload'
export {
  FRANKING_KEY_LENGTH,
  frank,
  frankingCanon,
  newFrankingKey,
  verifyFrank,
  type FrankingInput,
} from './franking'
export {
  BACKUP_KDF_DEFAULT,
  BACKUP_KDF_FLOOR,
  SNAPSHOT_VERSION,
  deriveBackupKek,
  newBackupKey,
  newBackupSalt,
  nobleArgon2id,
  openSnapshot,
  sealSnapshot,
  unwrapBackupKey,
  wrapBackupKey,
  type Argon2idFn,
  type BackupKdfParams,
} from './backup'
export { checkBackupPassword, type BackupPasswordCheck, type BackupPasswordRejection } from './backupPassword'
export { fromBase64, toBase64 } from './bytes'
export { SerialQueue } from './queue'
// Tek UTF-8 yolu (yerleşik varsa o, yoksa katı saf JS); istemciler TextDecoder'ı doğrudan kullanmaz.
export { fromUtf8, utf8, utf8Path, InvalidUtf8Error } from './utf8'
// Yerel depo özeti için (WebCrypto'suz ortamlarda da çalışır; yeni ilkel yazılmıyor, noble'dan).
export { sha256 } from '@noble/hashes/sha2.js'
export * from './errors'
