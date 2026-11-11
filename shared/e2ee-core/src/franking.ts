// Mesaj parmak izi / franking (E4 sözleşmesi §2.1). Kripto kodu yazılmaz: HMAC-SHA256 @noble/hashes'ten.
// Taahhüt: tag = HMAC-SHA256(fk, utf8(canon)). `canon` TEK yerde burada üretilir; api aynı biçimi
// test/vectors/franking.json vektörleriyle sınar.
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesEqual, utf8 } from './bytes'
import { randomBytes } from './pure/random'

export const FRANKING_KEY_LENGTH = 32

export interface FrankingInput {
  channelId: string
  senderDeviceId: string
  body: string
  sentAt: number
}

/** Mesaj başına 32 bayt anahtar. Rastgelelik tek kapıdan (getRandomValues; yoksa açık hata, Math.random yok). */
export function newFrankingKey(random: (n: number) => Uint8Array = randomBytes): Uint8Array {
  return random(FRANKING_KEY_LENGTH)
}

/**
 * Kanonik biçim: `{"c":channelId,"d":senderDeviceId,"b":body,"s":sentAt}`. Anahtar sırası nesnenin
 * ekleme sırasıyla sabit, kaçışları JSON.stringify standardı belirler (elle birleştirme yok).
 */
export function frankingCanon(input: FrankingInput): string {
  return JSON.stringify({ c: input.channelId, d: input.senderDeviceId, b: input.body, s: input.sentAt })
}

/** tag (32 bayt) = HMAC-SHA256(fk, utf8(canon)). */
export function frank(fk: Uint8Array, input: FrankingInput): Uint8Array {
  return hmac(sha256, fk, utf8(frankingCanon(input)))
}

/** Sabit zamanlı doğrulama; tag uzunluğu farklıysa false. */
export function verifyFrank(fk: Uint8Array, input: FrankingInput, tag: Uint8Array): boolean {
  return bytesEqual(frank(fk, input), tag)
}
