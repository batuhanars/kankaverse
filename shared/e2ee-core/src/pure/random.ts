// Rastgelelik tek kapıdan: globalThis.crypto.getRandomValues. Yoksa AÇIK hata.
// Neden: Hermes'te bu global yoksa sessizce Math.random'a düşmek anahtarları tahmin edilebilir yapar.
import { RandomUnavailableError } from '../errors'

export function randomBytes(n: number): Uint8Array {
  const g = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (typeof g?.getRandomValues !== 'function') {
    throw new RandomUnavailableError('crypto.getRandomValues yok: güvenli rastgelelik olmadan E2EE başlatılamaz')
  }
  return g.getRandomValues(new Uint8Array(n))
}
