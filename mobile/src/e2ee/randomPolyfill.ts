// Güvenli rastgelelik kurulumu (E1 §5). Hermes'te `crypto.getRandomValues` yok; MLS anahtarları ve
// AES-GCM IV'leri buna dayanır. Kaynak yalnız `expo-crypto` (işletim sisteminin CSPRNG'si, native).
// 🔴 `Math.random` tabanlı HİÇBİR yol kripto için kullanılmaz: livekit'in `crypto.randomUUID`
// polyfill'i Math.random kullanır ve burada dokunulmaz, yalnız `getRandomValues` eklenir.

type FillRandom = (array: Uint8Array) => Uint8Array

interface CryptoLike {
  getRandomValues?: unknown
  [key: string]: unknown
}

/**
 * `target.crypto.getRandomValues` yoksa `source` ile kurar. Dönen değer: güvenli rastgelelik var mı.
 * `false` ise çağıran E2EE'yi BAŞLATMAZ ve loglar (motor da `RandomUnavailableError` ile reddeder).
 */
export function installSecureRandom(
  source: FillRandom,
  target: { crypto?: CryptoLike } = globalThis as unknown as { crypto?: CryptoLike },
): boolean {
  if (typeof target.crypto?.getRandomValues === 'function') return true
  // livekit `global.crypto = {}` ile yalnız randomUUID koymuş olabilir: mevcut nesneyi koru, üstüne ekle.
  const existing = target.crypto ?? {}
  existing.getRandomValues = (array: Uint8Array) => source(array)
  target.crypto = existing
  return typeof target.crypto.getRandomValues === 'function'
}
