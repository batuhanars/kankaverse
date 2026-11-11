/** E3: push verisindeki şifreli yük ayrıştırması (saf, platformdan bağımsız: birim test edilir). */

export type PushE2ee = { ciphertext: string; senderDeviceId: string; createdAt: string; frankingTag?: string };

/** Android'de nesne `dataString` JSON'u içinde nesne olarak gelir; string gelirse de çözülür. */
export function parseE2eePayload(raw: unknown): PushE2ee | null {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const { ciphertext, senderDeviceId, createdAt } = v as Record<string, unknown>;
  if (typeof ciphertext !== 'string' || !ciphertext) return null;
  if (typeof senderDeviceId !== 'string' || !senderDeviceId) return null;
  if (typeof createdAt !== 'string' || !createdAt) return null;
  const { frankingTag } = v as Record<string, unknown>;
  return {
    ciphertext,
    senderDeviceId,
    createdAt,
    ...(typeof frankingTag === 'string' && frankingTag ? { frankingTag } : {}),
  };
}
