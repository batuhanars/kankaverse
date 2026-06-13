import { randomBytes } from 'crypto';

const BASE32_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Tahmin edilemez 8 karakterlik URL-safe base32 davet kodu üretir (friend-code.util deseni). */
export function generateInviteCode(): string {
  const bytes = randomBytes(5);
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_CHARS[(value >> bits) & 0x1f];
    }
  }
  return result.padEnd(8, BASE32_CHARS[0]).slice(0, 8);
}
