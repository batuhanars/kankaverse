// Sohbet yedeği kriptosu (E5a sözleşmesi §2). Yeni ilkel yazılmaz: Argon2id @noble/hashes'ten,
// AES-256-GCM @noble/ciphers'tan. Burada yalnız parametre denetimi, bağlam (AAD) ve bayt düzeni var.
//
// Anahtar hiyerarşisi: şifre --Argon2id--> KEK --sarar--> BMK --şifreler--> yedek görüntüsü.
// Sunucu yalnız sarılı BMK ve şifreli görüntüyü görür.
import { argon2id } from '@noble/hashes/argon2.js'
import { open, seal } from './aead'
import { utf8 } from './bytes'
import { BackupParamsError, BackupPasswordError, BackupSnapshotError } from './errors'
import { randomBytes } from './pure/random'

export interface BackupKdfParams {
  /** KiB cinsinden bellek. */
  m: number
  /** Tur sayısı. */
  t: number
  /** Paralellik; her zaman 1. */
  p: number
}

/** Alt sınır (OWASP asgari). Türetme bunun altına inen parametreyi reddeder; indirilen başlık dahil. */
export const BACKUP_KDF_FLOOR: BackupKdfParams = { m: 19456, t: 2, p: 1 }
/** Üst sınır (256 MiB): kötü niyetli ya da bozuk sunucu kaydı dev bellek dayatıp uygulamayı çökertmesin. API ile aynı değer. */
export const BACKUP_KDF_MAX: BackupKdfParams = { m: 262144, t: 16, p: 1 }
/** Yeni yedekte kullanılan hedef (adım 0b ölçümü: telefonda ~0,8 sn). */
export const BACKUP_KDF_DEFAULT: BackupKdfParams = { m: 65536, t: 4, p: 1 }

/** Argon2id hesaplayıcısı enjekte edilir: web noble'ı, mobil native işlevi verir (E5a §2.4). */
export type Argon2idFn = (
  password: Uint8Array,
  salt: Uint8Array,
  opts: { m: number; t: number; p: number; dkLen: number },
) => Promise<Uint8Array>

/** Web ve testler için: saf JS @noble/hashes Argon2id. */
export const nobleArgon2id: Argon2idFn = async (password, salt, { m, t, p, dkLen }) =>
  argon2id(password, salt, { m, t, p, dkLen })

const KEY_LENGTH = 32
const SALT_LENGTH = 16
export const SNAPSHOT_VERSION = 1

/** Türetmeden önce taban ve üst sınır denetlenir; sunucu ne düşük ne de aşırı yüksek parametre dayatabilir. */
function assertParams(params: BackupKdfParams): void {
  const { m, t, p } = params
  if (!Number.isInteger(m) || !Number.isInteger(t) || !Number.isInteger(p)) {
    throw new BackupParamsError('Argon2id parametreleri tam sayı olmalı')
  }
  if (m < BACKUP_KDF_FLOOR.m || t < BACKUP_KDF_FLOOR.t || p !== BACKUP_KDF_FLOOR.p) {
    throw new BackupParamsError('Argon2id parametreleri tabanın altında')
  }
  if (m > BACKUP_KDF_MAX.m || t > BACKUP_KDF_MAX.t) {
    throw new BackupParamsError('Argon2id parametreleri üst sınırın üstünde')
  }
}

/** Şifreden 32 baytlık KEK türetir. Şifre NFC normalize edilip UTF-8 yapılır (aynı şifre iki klavyede aynı bayt). */
export async function deriveBackupKek(
  password: string,
  salt: Uint8Array,
  params: BackupKdfParams,
  argon2: Argon2idFn,
): Promise<Uint8Array> {
  if (salt.length !== SALT_LENGTH) throw new BackupParamsError('Tuz 16 bayt olmalı')
  assertParams(params)
  return argon2(utf8(password.normalize('NFC')), salt, {
    m: params.m,
    t: params.t,
    p: params.p,
    dkLen: KEY_LENGTH,
  })
}

/** Kullanıcı başına bir kez üretilen yedek ana anahtarı (BMK). Rastgelelik tek kapıdan (Math.random yok). */
export const newBackupKey = (): Uint8Array => randomBytes(KEY_LENGTH)

export const newBackupSalt = (): Uint8Array => randomBytes(SALT_LENGTH)

const bmkAad = (userId: string, keyVersion: number) => `kv-e5-bmk-v1|${userId}|${keyVersion}`
const snapAad = (userId: string, deviceId: string, keyVersion: number) =>
  `kv-e5-snap-v1|${userId}|${deviceId}|${keyVersion}`

/** BMK'yi KEK ile sarar. AAD kullanıcıya ve anahtar sürümüne bağlar. */
export function wrapBackupKey(kek: Uint8Array, bmk: Uint8Array, userId: string, keyVersion: number): Uint8Array {
  return seal(kek, bmk, bmkAad(userId, keyVersion))
}

/** Yanlış şifre ile kurcalanmış sarma aynı `BackupPasswordError`'ı verir. */
export function unwrapBackupKey(
  kek: Uint8Array,
  wrapped: Uint8Array,
  userId: string,
  keyVersion: number,
): Uint8Array {
  const bmk = open(kek, wrapped, bmkAad(userId, keyVersion))
  if (!bmk || bmk.length !== KEY_LENGTH) throw new BackupPasswordError('Yedek anahtarı açılamadı')
  return bmk
}

/** Yedek görüntüsünü şifreler. İçeriğin (JSON) biçimi e2ee-client'ındır; burada yalnız bayt. */
export function sealSnapshot(
  bmk: Uint8Array,
  plaintext: Uint8Array,
  userId: string,
  deviceId: string,
  keyVersion: number,
): Uint8Array {
  return seal(bmk, plaintext, snapAad(userId, deviceId, keyVersion))
}

export function openSnapshot(
  bmk: Uint8Array,
  sealed: Uint8Array,
  userId: string,
  deviceId: string,
  keyVersion: number,
): Uint8Array {
  const plaintext = open(bmk, sealed, snapAad(userId, deviceId, keyVersion))
  if (!plaintext) throw new BackupSnapshotError('Yedek görüntüsü açılamadı')
  return plaintext
}
