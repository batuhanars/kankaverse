// AES-256-GCM sarmalayıcısı (E5a yedek + E5b aktarım ortak). Yeni ilkel yok: @noble/ciphers.
// Bayt düzeni: nonce(12) || GCM çıktısı. AAD bağlam dizesidir (kim, hangi sürüm, hangi aktarım).
import { gcm } from '@noble/ciphers/aes.js'
import { concat, utf8 } from './bytes'
import { randomBytes } from './pure/random'

const NONCE_LENGTH = 12

/** Nonce her çağrıda yeni rastgele (32 baytlık anahtar başına sayısı sınırlı; tekrar olasılığı ihmal edilebilir). */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad: string): Uint8Array {
  const nonce = randomBytes(NONCE_LENGTH)
  return concat(nonce, gcm(key, nonce, utf8(aad)).encrypt(plaintext))
}

/** seal'in tersi. Kısa girdi ya da GCM doğrulama hatası `null` döner; çağıran kendi hata türünü fırlatır. */
export function open(key: Uint8Array, sealed: Uint8Array, aad: string): Uint8Array | null {
  if (sealed.length < NONCE_LENGTH) return null
  try {
    return gcm(key, sealed.subarray(0, NONCE_LENGTH), utf8(aad)).decrypt(sealed.subarray(NONCE_LENGTH))
  } catch {
    return null
  }
}
