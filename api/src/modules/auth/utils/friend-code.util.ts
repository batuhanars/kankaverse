import { randomBytes } from 'crypto';

const BASE32_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Tahmin edilemez 6 karakterlik base32 arkadaş kodu üretir (30-bit, RFC4648 belirsizlik hariç). */
export function generateFriendCode(): string {
  const bytes = randomBytes(4);
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
  return result.padEnd(6, BASE32_CHARS[0]).slice(0, 6);
}
