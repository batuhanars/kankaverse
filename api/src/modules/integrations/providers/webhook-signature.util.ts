import { createHmac, createPublicKey, timingSafeEqual, verify } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';

/** Olay zaman damgası bundan eskiyse (ya da bu kadar ileriyse) reddedilir (§3). */
export const WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1000;

export function unauthorized(): never {
  throw new UnauthorizedException({ message: 'Geçersiz imza.', error: 'INVALID_SIGNATURE' });
}

export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** RFC3339 zaman damgası ±5 dk içinde mi (tekrar saldırısı). Ayrıştırılamıyorsa false. */
export function isFreshTimestamp(timestamp: string, now = Date.now()): boolean {
  const at = Date.parse(timestamp);
  return Number.isFinite(at) && Math.abs(now - at) <= WEBHOOK_MAX_SKEW_MS;
}

/** Twitch EventSub: `sha256=` + HMAC-SHA256(secret, id + timestamp + ham gövde); sabit zamanlı karşılaştırma. */
export function twitchSignatureMatches(
  secret: string,
  messageId: string,
  timestamp: string,
  rawBody: Buffer,
  presented: string,
): boolean {
  const expected = Buffer.from(
    'sha256=' +
      createHmac('sha256', secret)
        .update(messageId)
        .update(timestamp)
        .update(rawBody)
        .digest('hex'),
    'utf8',
  );
  const given = Buffer.from(presented, 'utf8');
  // timingSafeEqual uzunluk şartı: farklı uzunluk zaten eşleşmez (uzunluk sızıntısı sabit biçimli imzada önemsiz)
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Kick: RSA PKCS#1 v1.5 + SHA-256 üzerinde `{id}.{timestamp}.{ham gövde}`; imza base64. */
export function kickSignatureMatches(
  publicKeyPem: string,
  messageId: string,
  timestamp: string,
  rawBody: Buffer,
  signatureB64: string,
): boolean {
  try {
    const signed = Buffer.concat([Buffer.from(`${messageId}.${timestamp}.`, 'utf8'), rawBody]);
    const key = createPublicKey(publicKeyPem);
    return verify('RSA-SHA256', signed, key, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
