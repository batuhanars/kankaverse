import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * C35 §2.2 (R7) — webhook token'ı.
 *
 * Token: 32 bayt `crypto.randomBytes`, base64url (256 bit entropi). DB'ye YALNIZ SHA-256 özeti
 * yazılır: değer yüksek entropili rastgele olduğu için yavaş parola özeti (argon2) gerekmez,
 * sözlük/kaba kuvvet saldırısı yok. Ham token yalnız oluşturma/yenileme cevabında bir kez görünür.
 */
export function generateWebhookToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashWebhookToken(token) };
}

export function hashWebhookToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Var olmayan webhook'ta da AYNI işi yapmak için (zamanlama farkı var/yok sızdırmasın). */
const DUMMY_HASH = hashWebhookToken('kankaverse-webhook-dummy');

/**
 * Sunulan token, saklanan özetle sabit zamanda karşılaştırılır. `storedHash` null (webhook yok/silinmiş)
 * ise sahte özetle aynı karşılaştırma yapılır ve sonuç her durumda false olur.
 * Sunulan değer önce özetlenir → iki taraf da her zaman 32 bayt (timingSafeEqual uzunluk şartı).
 */
export function webhookTokenMatches(presented: string, storedHash: string | null): boolean {
  const presentedDigest = createHash('sha256').update(presented, 'utf8').digest();
  const storedDigest = Buffer.from(storedHash ?? DUMMY_HASH, 'hex');
  if (storedDigest.length !== presentedDigest.length) return false;
  const equal = timingSafeEqual(presentedDigest, storedDigest);
  return equal && storedHash !== null;
}
