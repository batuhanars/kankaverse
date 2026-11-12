// Cihazdan cihaza geçmiş aktarımı kriptosu (E5b sözleşmesi §2). Yeni ilkel yok: X25519 @noble/curves,
// SHA-256/HKDF @noble/hashes, AES-256-GCM `aead`. Burada yalnız el sıkışma düzeni, bağlam ve bayt düzeni var.
//
// N = yeni cihaz (geçmişi alan), O = eski cihaz (veren). Sunucu yalnız taahhüdü, açık anahtarları ve şifreli yükü
// taşır. Araya giren sunucu: N anahtarını önce taahhüt ettiği için O'nun anahtarını gördükten sonra seçemez;
// iki ekrandaki 6 haneli kod tutmazsa kullanıcı O'da onaylamaz ve hiçbir şey gönderilmez.
import { x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { open, seal } from './aead'
import { bytesEqual, pack, utf8 } from './bytes'
import { TransferCommitError, TransferKeyError, TransferOpenError } from './errors'
import { randomBytes } from './pure/random'

const KEY_LENGTH = 32
const NONCE_LENGTH = 32
const SAS_MODULUS = 1_000_000

/** Aktarım yükünün üst sınırı (E5a görüntüsüyle aynı, §2.2). */
export const TRANSFER_MAX_BYTES = 25 * 1024 * 1024

export interface TransferKeyPair {
  /** Yalnız bellekte; aktarım bitince ya da iptalde `wipe` ile sıfırlanır. */
  secretKey: Uint8Array
  publicKey: Uint8Array
}

/** Geçici X25519 anahtar çifti (her aktarımda yeni). */
export function newTransferKeyPair(random: (n: number) => Uint8Array = randomBytes): TransferKeyPair {
  const secretKey = random(KEY_LENGTH)
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) }
}

/** N'nin taahhüt rastgeleliği `rN` (32 bayt). */
export const newTransferNonce = (random: (n: number) => Uint8Array = randomBytes): Uint8Array =>
  random(NONCE_LENGTH)

/** `C = SHA256(pack("kv-e5b-commit-v1", EN, rN))`. Sunucuya önce yalnız bu gider. */
export function transferCommit(newPub: Uint8Array, nonce: Uint8Array): Uint8Array {
  assertLength(newPub, KEY_LENGTH, 'Açık anahtar')
  assertLength(nonce, NONCE_LENGTH, 'Taahhüt rastgeleliği')
  return sha256(pack([utf8('kv-e5b-commit-v1'), newPub, nonce]))
}

/** O tarafı: açılan `EN`/`rN` taahhüdü tutmazsa aktarım iptal (sunucunun denetimine güvenilmez). */
export function verifyTransferCommit(commit: Uint8Array, newPub: Uint8Array, nonce: Uint8Array): void {
  let expected: Uint8Array
  try {
    expected = transferCommit(newPub, nonce)
  } catch {
    throw new TransferCommitError('Taahhüt açılışı geçersiz')
  }
  if (commit.length !== expected.length || !bytesEqual(commit, expected)) {
    throw new TransferCommitError('Anahtar taahhütle uyuşmuyor')
  }
}

/** Dökümün alanları: iki taraf AYNI değerlerle çağırır (kimlikler sunucudan, anahtarlar el sıkışmadan). */
export interface TransferTranscript {
  userId: string
  transferId: string
  newDeviceId: string
  oldDeviceId: string
  newPub: Uint8Array
  oldPub: Uint8Array
  nonce: Uint8Array
}

export interface TransferSecrets {
  /** 6 hane, başta sıfır korunur ("004217"). İki ekranda karşılaştırılır; saklanmaz, loglanmaz. */
  sas: string
  /** Yük anahtarı (32 bayt). Bellekte; iş bitince `wipe`. */
  key: Uint8Array
}

/**
 * `Z = X25519(own, peer)`; `salt = SHA256(pack(döküm))`; kod ve anahtar ayrı `info` ile HKDF'ten.
 * Döküm uzunluk önekli (`pack`): ayraçlı birleştirmenin belirsizliği yok. Sıfır `Z` (düşük dereceli nokta) reddedilir.
 */
export function deriveTransferSecrets(
  ownSecret: Uint8Array,
  peerPub: Uint8Array,
  t: TransferTranscript,
): TransferSecrets {
  assertLength(peerPub, KEY_LENGTH, 'Karşı açık anahtar')
  assertLength(t.newPub, KEY_LENGTH, 'Yeni cihaz anahtarı')
  assertLength(t.oldPub, KEY_LENGTH, 'Eski cihaz anahtarı')
  assertLength(t.nonce, NONCE_LENGTH, 'Taahhüt rastgeleliği')
  let z: Uint8Array
  try {
    z = x25519.getSharedSecret(ownSecret, peerPub)
  } catch {
    throw new TransferKeyError('Geçersiz açık anahtar')
  }
  if (z.every((b) => b === 0)) throw new TransferKeyError('Sıfır ortak sır')
  const salt = sha256(
    pack([
      utf8('kv-e5b-v1'),
      utf8(t.userId),
      utf8(t.transferId),
      utf8(t.newDeviceId),
      utf8(t.oldDeviceId),
      t.newPub,
      t.oldPub,
      t.nonce,
    ]),
  )
  const sas = sasDigits(hkdf(sha256, z, salt, utf8('kv-e5b-sas-v1'), 4))
  const key = hkdf(sha256, z, salt, utf8('kv-e5b-key-v1'), KEY_LENGTH)
  z.fill(0)
  return { sas, key }
}

/** 4 bayt (büyük uçlu) → `mod 1 000 000`, 6 haneye sıfırla doldurulur. Yanlılık ~2^-12, ihmal edilebilir. */
export function sasDigits(bytes: Uint8Array): string {
  assertLength(bytes, 4, 'Kod baytları')
  const n = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0)
  return String(n % SAS_MODULUS).padStart(6, '0')
}

/** Ekran biçimi: "123 456". */
export const formatSas = (sas: string): string => `${sas.slice(0, 3)} ${sas.slice(3)}`

const blobAad = (userId: string, transferId: string) => `kv-e5b-blob-v1|${userId}|${transferId}`

/** O tarafı: yükü (e2ee-client JSON'u) aktarım anahtarıyla şifreler. AAD kullanıcıya ve aktarıma bağlar. */
export function sealTransfer(key: Uint8Array, plaintext: Uint8Array, userId: string, transferId: string): Uint8Array {
  assertLength(key, KEY_LENGTH, 'Aktarım anahtarı')
  return seal(key, plaintext, blobAad(userId, transferId))
}

/** N tarafı: yanlış anahtar/bağlam ya da kurcalanmış bayt `TransferOpenError`. */
export function openTransfer(key: Uint8Array, sealed: Uint8Array, userId: string, transferId: string): Uint8Array {
  assertLength(key, KEY_LENGTH, 'Aktarım anahtarı')
  const plaintext = open(key, sealed, blobAad(userId, transferId))
  if (!plaintext) throw new TransferOpenError('Aktarım yükü açılamadı')
  return plaintext
}

/** Geçici gizli malzemeyi bellekte sıfırlar (anahtar çifti, yük anahtarı). */
export function wipe(...parts: Uint8Array[]): void {
  for (const p of parts) p.fill(0)
}

function assertLength(b: Uint8Array, n: number, what: string): void {
  if (!(b instanceof Uint8Array) || b.length !== n) throw new TransferKeyError(`${what} ${n} bayt olmalı`)
}
