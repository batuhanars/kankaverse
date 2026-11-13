import { createPublicKey, verify } from 'node:crypto';

/** Ed25519 ham 32 baytlık açık anahtarı SPKI DER'e saran sabit önek. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Alan ayrımı etiketi: MLS yaprak imza anahtarıyla çapraz-protokol imzası olmasın. */
export const REBIND_SIGN_LABEL = 'kankaverse/e2ee/rebind/v1';

/**
 * C69 imza mesajı (bayt düzeni, istemci AYNISINI üretir):
 *   utf8(REBIND_SIGN_LABEL) || 0x00 || nonce (32 ham bayt) || utf8(userId) || 0x00 || utf8(deviceId)
 */
export function rebindMessage(nonce: Uint8Array, userId: string, deviceId: string): Buffer {
  return Buffer.concat([
    Buffer.from(REBIND_SIGN_LABEL, 'utf8'),
    Buffer.from([0]),
    Buffer.from(nonce),
    Buffer.from(userId, 'utf8'),
    Buffer.from([0]),
    Buffer.from(deviceId, 'utf8'),
  ]);
}

/** Ham Ed25519 anahtarı + imza ile doğrular; bozuk girdi false döner (fırlatmaz). */
export function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey)]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
}
