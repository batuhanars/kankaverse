// Yedek şifresi kuralı (E5a §2.3). Güç ölçer yok: kural basit ve test edilebilir.
const MIN_LENGTH = 12
const MIN_DISTINCT = 6
const MIN_IDENTITY_LENGTH = 3

export type BackupPasswordRejection = 'too-short' | 'too-few-distinct' | 'contains-identity'
export type BackupPasswordCheck = { ok: true } | { ok: false; reason: BackupPasswordRejection }

/** Türkçe büyük/küçük harf duyarsız karşılaştırma için (İ/i, I/ı). NFC önce. */
const fold = (s: string) => s.normalize('NFC').toLocaleLowerCase('tr')

/**
 * Sıra: kısa, az çeşitli, kimlik içeriyor. Uzunluk ve çeşitlilik NFC sonrası kod noktasıyla sayılır.
 * Kimlik: kullanıcı adı ve e-postanın `@` öncesi; 3 karakterden kısa olanlar yok sayılır (her şifreye uyardı).
 */
export function checkBackupPassword(
  password: string,
  ctx: { username: string; email: string },
): BackupPasswordCheck {
  const chars = [...password.normalize('NFC')]
  if (chars.length < MIN_LENGTH) return { ok: false, reason: 'too-short' }
  if (new Set(chars).size < MIN_DISTINCT) return { ok: false, reason: 'too-few-distinct' }

  const folded = fold(password)
  const identities = [ctx.username, ctx.email.split('@')[0]].map(fold)
  const hit = identities.some((id) => [...id].length >= MIN_IDENTITY_LENGTH && folded.includes(id))
  return hit ? { ok: false, reason: 'contains-identity' } : { ok: true }
}
