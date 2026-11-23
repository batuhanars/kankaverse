// E7 §2: kullanıcı kimlik anahtarı, cihaz imzası, kimliğin yedekte sarılması ve güvenlik kodu.
// Kimlik MLS'e girmez (kurul k.4): MLS yaprağı hâlâ cihazın kendi anahtarıyla imzalanır; bu dosyanın imzası
// sunucunun cihaz listesinin yanında taşınan ek veridir ve istemci onu ayrıca doğrular.
// Ed25519 her platformda saf @noble ile (Electron 36'da WebCrypto Ed25519 yok, D93); imza başına ~ms, sağlayıcı gerekmez.
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { open, seal } from './aead'
import { pack, utf8 } from './bytes'
import { IdentityKeyError, IdentityOpenError } from './errors'

const KEY_LENGTH = 32
const SIG_LENGTH = 64
const BMK_LENGTH = 32

/** Bu cihazın taşıdığı kimlik (özel anahtar yalnız Vault'ta, düz olarak hiçbir yere gitmez). */
export interface IdentityKeyPair {
  privateKey: Uint8Array
  publicKey: Uint8Array
  version: number
}

/** Sunucunun bildirdiği / istemcinin sabitlediği kimlik. */
export interface PublicIdentity {
  publicKey: Uint8Array
  version: number
}

/** Sunucunun cihaz listesindeki bir cihazın imzayla ilgili alanları. */
export interface SignedDevice {
  deviceId: string
  signatureKey: Uint8Array
  identitySig: Uint8Array | null
  identityVersion: number | null
}

/** Yeni kimlik. Sıfırlamada çağıran sunucudaki sürümün bir fazlasını verir. */
export function createIdentity(version = 1): IdentityKeyPair {
  assertVersion(version)
  const privateKey = ed25519.utils.randomSecretKey()
  return { privateKey, publicKey: ed25519.getPublicKey(privateKey), version }
}

/**
 * Özel anahtardan kimlik (aktarımda gelen anahtar). Açık anahtar HER ZAMAN yeniden türetilir: dışarıdan gelen
 * açık anahtara güvenilmez, çağıran bunu sunucunun bildirdiğiyle karşılaştırır.
 */
export function identityFromPrivate(privateKey: Uint8Array, version: number): IdentityKeyPair {
  assertVersion(version)
  assertLength(privateKey, KEY_LENGTH, 'Kimlik özel anahtarı')
  return { privateKey, publicKey: ed25519.getPublicKey(privateKey), version }
}

/**
 * İmzalanan bayt: etiket + kullanıcı + kimlik sürümü + cihaz + cihazın MLS imza anahtarı.
 * Sürüm içeride olduğu için sıfırlamadan önce atılmış imza yeni kimlikle "geçerli" sayılamaz;
 * kullanıcı içeride olduğu için bir kullanıcının imzası başkasının cihazına taşınamaz.
 */
export function deviceSigMessage(userId: string, version: number, deviceId: string, signatureKey: Uint8Array): Uint8Array {
  return pack([utf8('kv-e7-dev-v1'), utf8(userId), utf8(String(version)), utf8(deviceId), signatureKey])
}

export function signDevice(
  identity: IdentityKeyPair,
  userId: string,
  deviceId: string,
  signatureKey: Uint8Array,
): Uint8Array {
  assertLength(identity.privateKey, KEY_LENGTH, 'Kimlik özel anahtarı')
  return ed25519.sign(deviceSigMessage(userId, identity.version, deviceId, signatureKey), identity.privateKey)
}

/**
 * Cihaz, verilen (sabitlenmiş) kimlikle imzalanmış mı? İmza yoksa, sürüm tutmuyorsa ya da imza bozuksa false.
 * Hata fırlatmaz: sonuç yalnız sohbetteki satırı belirler, MLS akışını durdurmaz (kurul k.1).
 */
export function verifyDevice(identity: PublicIdentity, userId: string, device: SignedDevice): boolean {
  const sig = device.identitySig
  if (!sig || sig.length !== SIG_LENGTH) return false
  if (device.identityVersion !== identity.version) return false
  if (identity.publicKey.length !== KEY_LENGTH) return false
  try {
    // zip215: false = katı RFC 8032 doğrulaması (MLS tarafındaki saf sağlayıcıyla aynı tercih).
    return ed25519.verify(sig, deviceSigMessage(userId, identity.version, device.deviceId, device.signatureKey), identity.publicKey, {
      zip215: false,
    })
  } catch {
    return false
  }
}

const identityAad = (userId: string, idVersion: number, keyVersion: number) =>
  `kv-e7-id-v1|${userId}|${idVersion}|${keyVersion}`

/** §2.3: kimlik özel anahtarı yedek ana anahtarıyla (BMK) sarılır. AAD kullanıcıya ve iki sürüme bağlar. */
export function wrapIdentity(bmk: Uint8Array, identity: IdentityKeyPair, userId: string, keyVersion: number): Uint8Array {
  assertLength(bmk, BMK_LENGTH, 'Yedek anahtarı')
  assertLength(identity.privateKey, KEY_LENGTH, 'Kimlik özel anahtarı')
  return seal(bmk, identity.privateKey, identityAad(userId, identity.version, keyVersion))
}

/** Yanlış BMK, yanlış bağlam ya da kurcalanmış bayt: `IdentityOpenError` (ayırt edilmez). */
export function unwrapIdentity(
  bmk: Uint8Array,
  wrapped: Uint8Array,
  userId: string,
  idVersion: number,
  keyVersion: number,
): IdentityKeyPair {
  assertLength(bmk, BMK_LENGTH, 'Yedek anahtarı')
  const privateKey = open(bmk, wrapped, identityAad(userId, idVersion, keyVersion))
  if (!privateKey || privateKey.length !== KEY_LENGTH) throw new IdentityOpenError('Kimlik anahtarı açılamadı')
  return { privateKey, publicKey: ed25519.getPublicKey(privateKey), version: idVersion }
}

/** §2.4: bir kullanıcının parmak izi, 6 grup × 5 hane. 30 bayt = 6 parça × 5 bayt; 5 bayt (2^40) JS sayısına sığar. */
export function fingerprint(userId: string, identity: PublicIdentity): string[] {
  assertLength(identity.publicKey, KEY_LENGTH, 'Kimlik açık anahtarı')
  const digest = sha512(pack([utf8('kv-e7-fp-v1'), utf8(userId), utf8(String(identity.version)), identity.publicKey]))
  const groups: string[] = []
  for (let i = 0; i < 6; i++) {
    let n = 0
    for (let j = 0; j < 5; j++) n = n * 256 + digest[i * 5 + j]
    groups.push(String(n % 100000).padStart(5, '0'))
  }
  return groups
}

/**
 * §2.4: iki kişinin güvenlik kodu, 12 grup × 5 hane. Sıra `userId`'ye göre: iki tarafta aynı kod.
 * Karşılaştırma kod birimi sırasıyla (localeCompare değil): cuid ASCII, sıra her cihazda aynı kalmalı.
 */
export function safetyCode(
  a: { userId: string; identity: PublicIdentity },
  b: { userId: string; identity: PublicIdentity },
): string[] {
  const [first, second] = a.userId < b.userId ? [a, b] : [b, a]
  return [...fingerprint(first.userId, first.identity), ...fingerprint(second.userId, second.identity)]
}

function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) throw new IdentityKeyError('Kimlik sürümü 1 ya da büyük tam sayı olmalı')
}

function assertLength(b: Uint8Array, n: number, what: string): void {
  if (!(b instanceof Uint8Array) || b.length !== n) throw new IdentityKeyError(`${what} ${n} bayt olmalı`)
}
