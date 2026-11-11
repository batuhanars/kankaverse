import { createHmac, timingSafeEqual } from 'node:crypto';
import { FRANKING_KEY_BYTES, FRANKING_TAG_BYTES } from './e2ee.constants';

export interface FrankingInput {
  channelId: string;
  senderDeviceId: string;
  body: string;
  sentAt: number;
}

/**
 * Kanonik biçim (E4 §2.1): UTF-8 JSON, anahtar sırası SABİT `{c,d,b,s}`. Çekirdekteki
 * (`shared/e2ee-core`) `frank`'ın birebir aynısı; ikisi de aynı test vektörleriyle sınanır
 * (`api/test/fixtures/franking-vectors.json`). api çekirdek paketi import etmez (Docker context `./api`).
 */
export function frankingCanon(input: FrankingInput): string {
  return JSON.stringify({
    c: input.channelId,
    d: input.senderDeviceId,
    b: input.body,
    s: input.sentAt,
  });
}

/** tag = HMAC-SHA256(fk, utf8(canon)) */
export function computeFrankingTag(fk: Uint8Array, input: FrankingInput): Buffer {
  return createHmac('sha256', fk).update(frankingCanon(input), 'utf8').digest();
}

/**
 * Sabit zamanlı karşılaştırma. `fk` ya da beklenen tag beklenen uzunlukta değilse false
 * (uzunluk farkı `timingSafeEqual`'a hiç gitmez; o atar).
 */
export function verifyFrankingTag(
  fk: Uint8Array,
  expectedTag: Uint8Array,
  input: FrankingInput,
): boolean {
  if (fk.length !== FRANKING_KEY_BYTES || expectedTag.length !== FRANKING_TAG_BYTES) return false;
  return timingSafeEqual(computeFrankingTag(fk, input), expectedTag);
}
