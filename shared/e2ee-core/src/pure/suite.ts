// Suite 1 (MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519) için saf @noble sağlayıcısı.
// Hermes'te crypto.subtle YOK; tek gereken global crypto.getRandomValues (bkz. random.ts).
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { expand, extract } from '@noble/hashes/hkdf.js'
import type { CiphersuiteImpl } from 'ts-mls'
import { bytesEqual } from '../bytes'
import { pureHpke } from './hpke'
import { randomBytes } from './random'

const SIGN_KEY_LEN = 32

export const pureSuite1 = {
  kdf: {
    extract: async (salt: Uint8Array, ikm: Uint8Array) => extract(sha256, ikm, salt),
    expand: async (prk: Uint8Array, info: Uint8Array, len: number) => expand(sha256, prk, info, len),
    size: 32,
  },
  hash: {
    digest: async (d: Uint8Array) => sha256(d),
    mac: async (k: Uint8Array, d: Uint8Array) => hmac(sha256, k, d),
    // MAC doğrulaması sabit zamanlı karşılaştırır.
    verifyMac: async (k: Uint8Array, mac: Uint8Array, d: Uint8Array) => bytesEqual(mac, hmac(sha256, k, d)),
  },
  signature: {
    sign: async (k: Uint8Array, m: Uint8Array) =>
      ed25519.sign(m, k.length === SIGN_KEY_LEN ? k : k.slice(-SIGN_KEY_LEN)),
    // zip215:false = katı RFC 8032; WebCrypto ile aynı imzaları kabul eder (iki istemci ayrışmasın).
    verify: async (p: Uint8Array, m: Uint8Array, s: Uint8Array) => ed25519.verify(s, m, p, { zip215: false }),
    keygen: async () => {
      const signKey = randomBytes(SIGN_KEY_LEN)
      return { signKey, publicKey: ed25519.getPublicKey(signKey) }
    },
  },
  hpke: pureHpke,
  rng: { randomBytes },
  id: 1,
}

// ts-mls'in tipleri CryptoKey bekler; saf sağlayıcı ham bayt taşır. Tek yer, tek cast.
export const pureSuiteImpl = pureSuite1 as unknown as CiphersuiteImpl
