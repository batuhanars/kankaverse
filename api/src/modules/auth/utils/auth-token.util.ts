import { randomBytes, createHash } from 'crypto';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;
export const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function generateAuthToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashAuthToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ─── Kurtarma kodları ───────────────────────────────────────────────────────
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 10 byte rastgele → base32 → XXXX-XXXX-XXXX-XXXX formatı (80-bit entropi). */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(10);
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let raw = '';
  for (let i = 0; i < 16; i++) {
    raw += BASE32_CHARS[parseInt(bits.slice(i * 5, (i + 1) * 5), 2)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/** Kurtarma kodu lookup hash'i — dashes kaldırılıp uppercase normalize edilir. */
export function hashRecoveryCode(raw: string): string {
  const normalized = raw.replace(/-/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}
