// C69: park edilmiş cihazı yeni oturuma bağlarken imzalanan mesaj. Sunucudaki
// api/src/modules/e2ee/e2ee-rebind.util.ts `rebindMessage` ile BAYT BAYT aynı olmalı.
import { concat, utf8 } from './bytes'

/** Alan ayrımı etiketi: MLS yaprak imza anahtarıyla çapraz-protokol imzası olmasın. */
export const REBIND_SIGN_LABEL = 'kankaverse/e2ee/rebind/v1'

/** utf8(etiket) || 0x00 || nonce (32 ham bayt) || utf8(userId) || 0x00 || utf8(deviceId) */
export function rebindMessage(nonce: Uint8Array, userId: string, deviceId: string): Uint8Array {
  const zero = new Uint8Array([0])
  return concat(utf8(REBIND_SIGN_LABEL), zero, nonce, utf8(userId), zero, utf8(deviceId))
}
