// RFC 9180 HPKE, base mode (mode 0), yalnız suite 1: DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / AES-128-GCM.
// İlkel yazmıyoruz: X25519, HKDF, SHA-256, AES-GCM @noble'dan; burası yalnız RFC'nin etiketli
// türetme (labeled extract/expand) ve anahtar çizelgesi yapıştırması. RFC 9180 resmi vektörleriyle sınanır.
import { x25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { expand, extract } from '@noble/hashes/hkdf.js'
import { gcm } from '@noble/ciphers/aes.js'
import { CryptoError } from 'ts-mls'
import { concat, utf8 } from '../bytes'
import { randomBytes } from './random'

const empty = new Uint8Array(0)
const i2 = (n: number) => new Uint8Array([(n >> 8) & 255, n & 255])

// Suite kimlikleri (RFC 9180 §4.1 ve §5.1): kem_id 0x0020, kdf_id 1, aead_id 1.
const KEM_SUITE = concat(utf8('KEM'), i2(0x20))
const HPKE_SUITE = concat(utf8('HPKE'), i2(0x20), i2(1), i2(1))
const N_SK = 32
const N_KEY = 16
const N_NONCE = 12
const BASE_MODE = new Uint8Array([0])

const lExtract = (suite: Uint8Array, salt: Uint8Array, label: string, ikm: Uint8Array) =>
  extract(sha256, concat(utf8('HPKE-v1'), suite, utf8(label), ikm), salt)
const lExpand = (suite: Uint8Array, prk: Uint8Array, label: string, info: Uint8Array, len: number) =>
  expand(sha256, prk, concat(i2(len), utf8('HPKE-v1'), suite, utf8(label), info), len)

/** DHKEM paylaşılan sırrı (RFC 9180 §4.1 ExtractAndExpand). */
const sharedSecret = (dh: Uint8Array, kemContext: Uint8Array) =>
  lExpand(KEM_SUITE, lExtract(KEM_SUITE, empty, 'eae_prk', dh), 'shared_secret', kemContext, 32)

/** Anahtar çizelgesi (RFC 9180 §5.1), base mode: psk yok. */
export function keySchedule(ss: Uint8Array, info: Uint8Array) {
  const ctx = concat(
    BASE_MODE,
    lExtract(HPKE_SUITE, empty, 'psk_id_hash', empty),
    lExtract(HPKE_SUITE, empty, 'info_hash', info),
  )
  const secret = lExtract(HPKE_SUITE, ss, 'secret', empty)
  return {
    key: lExpand(HPKE_SUITE, secret, 'key', ctx, N_KEY),
    baseNonce: lExpand(HPKE_SUITE, secret, 'base_nonce', ctx, N_NONCE),
    exporterSecret: lExpand(HPKE_SUITE, secret, 'exp', ctx, 32),
  }
}

/** Encap, ephemeral anahtar dışarıdan verilebilir (yalnız test vektörleri için; üretimde rastgele). */
export function encapWith(skE: Uint8Array, pkR: Uint8Array) {
  const pkE = x25519.getPublicKey(skE)
  const ss = sharedSecret(x25519.getSharedSecret(skE, pkR), concat(pkE, pkR))
  return { enc: pkE, ss }
}
export const encap = (pkR: Uint8Array) => encapWith(randomBytes(N_SK), pkR)

export function decap(enc: Uint8Array, skR: Uint8Array) {
  const pkR = x25519.getPublicKey(skR)
  return sharedSecret(x25519.getSharedSecret(skR, enc), concat(enc, pkR))
}

/** DeriveKeyPair (RFC 9180 §7.1.3, X25519). */
export function deriveKeySecret(ikm: Uint8Array): Uint8Array {
  const prk = lExtract(KEM_SUITE, empty, 'dkp_prk', ikm)
  return lExpand(KEM_SUITE, prk, 'sk', empty, N_SK)
}

export const exportFrom = (exporterSecret: Uint8Array, ctx: Uint8Array, len: number) =>
  lExpand(HPKE_SUITE, exporterSecret, 'sec', ctx, len)

// ts-mls'in Hpke arayüzündeki anahtar nesneleri. CryptoKey yok (Hermes'te subtle yok); ham bayt taşır.
type RawKey = { type: 'public' | 'private'; bytes: Uint8Array }
const pubKey = (bytes: Uint8Array) => ({ type: 'public', bytes }) as RawKey
const privKey = (bytes: Uint8Array) => ({ type: 'private', bytes }) as RawKey

const aeadOpen = (key: Uint8Array, nonce: Uint8Array, aad: Uint8Array | undefined, ct: Uint8Array) => {
  try {
    return gcm(key, nonce, aad ?? empty).decrypt(ct)
  } catch (e) {
    // Etiket tutmadı = bozuk/sahte veri; ts-mls CryptoError bekler.
    throw new CryptoError(`${e}`)
  }
}

export const pureHpke = {
  async seal(pk: RawKey, pt: Uint8Array, info: Uint8Array, aad: Uint8Array = empty) {
    const { enc, ss } = encap(pk.bytes)
    const ks = keySchedule(ss, info)
    return { ct: gcm(ks.key, ks.baseNonce, aad).encrypt(pt), enc }
  },
  async open(sk: RawKey, enc: Uint8Array, ct: Uint8Array, info: Uint8Array, aad: Uint8Array = empty) {
    try {
      const ks = keySchedule(decap(enc, sk.bytes), info)
      return aeadOpen(ks.key, ks.baseNonce, aad, ct)
    } catch (e) {
      // Geçersiz enc (ör. düşük mertebeli nokta) da aynı hata sınıfına iner.
      throw e instanceof CryptoError ? e : new CryptoError(`${e}`)
    }
  },
  async exportSecret(pk: RawKey, ctx: Uint8Array, len: number, info: Uint8Array) {
    const { enc, ss } = encap(pk.bytes)
    return { enc, secret: exportFrom(keySchedule(ss, info).exporterSecret, ctx, len) }
  },
  async importSecret(sk: RawKey, ctx: Uint8Array, enc: Uint8Array, len: number, info: Uint8Array) {
    return exportFrom(keySchedule(decap(enc, sk.bytes), info).exporterSecret, ctx, len)
  },
  importPrivateKey: async (k: Uint8Array) => privKey(k),
  importPublicKey: async (k: Uint8Array) => pubKey(k),
  exportPublicKey: async (k: RawKey) => k.bytes,
  exportPrivateKey: async (k: RawKey) => k.bytes,
  encryptAead: async (key: Uint8Array, nonce: Uint8Array, aad: Uint8Array | undefined, pt: Uint8Array) =>
    gcm(key, nonce, aad ?? empty).encrypt(pt),
  decryptAead: async (key: Uint8Array, nonce: Uint8Array, aad: Uint8Array | undefined, ct: Uint8Array) =>
    aeadOpen(key, nonce, aad, ct),
  async deriveKeyPair(ikm: Uint8Array) {
    const sk = deriveKeySecret(ikm)
    return { privateKey: privKey(sk), publicKey: pubKey(x25519.getPublicKey(sk)) }
  },
  async generateKeyPair() {
    const sk = randomBytes(N_SK)
    return { privateKey: privKey(sk), publicKey: pubKey(x25519.getPublicKey(sk)) }
  },
  keyLength: N_KEY,
  nonceLength: N_NONCE,
}
