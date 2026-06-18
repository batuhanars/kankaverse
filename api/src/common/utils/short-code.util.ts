import { randomBytes } from 'crypto';

const BASE32_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Tahmin edilemez URL-safe base32 kısa kod üretir (RFC4648 belirsizlik hariç).
 * @param length Kod uzunluğu (karakter sayısı). Varsayılan: 8.
 *
 * Kullanım:
 *  - 6-char → generateFriendCode (auth/utils/friend-code.util.ts)  [ayrı — farklı uzunluk]
 *  - 8-char → guild Invite kodu (invites/utils/invite-code.util.ts)
 *  - 8-char → PlatformInvite kodu (platform-invites/utils/platform-invite-code.util.ts)
 *
 * Rule of Three: guild-invite + platform-invite iki kullanıcı → ortak util'e çıkarıldı.
 * friend-code 6-char olduğu için ayrı kalır; bu util ile de üretilebilir ama mevcut
 * friend-code.util bozulmaya karşı dokunulmadan bırakıldı.
 */
export function generateShortCode(length: number = 8): string {
  // Her base32 karakteri 5 bit → length*5 bit için ceil(length*5/8) byte yeterli
  const byteCount = Math.ceil((length * 5) / 8);
  const bytes = randomBytes(byteCount);
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
  return result.padEnd(length, BASE32_CHARS[0]).slice(0, length);
}
