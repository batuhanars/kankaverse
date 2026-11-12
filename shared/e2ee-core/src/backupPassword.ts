import { randomBytes } from './pure/random'

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

// Öneri alfabesi: karışan karakterler yok (0/O, 1/l/I). Yalnız harf + rakam: mobil klavyede kolay yazılır.
const SUGGEST_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const SUGGEST_GROUPS = 4
const SUGGEST_GROUP_LENGTH = 5
// Modülo yanlılığı olmasın: alfabe boyunun katının üstündeki baytlar atılır (reddetme örneklemesi).
const SUGGEST_BYTE_LIMIT = 256 - (256 % SUGGEST_ALPHABET.length)

/**
 * "Güçlü şifre öner" (sahip kararı 2026-11-12): `Xk7Pq-mR4tZ-...` biçiminde 4x5 karakter, ~116 bit.
 * Kullanıcı isterse kullanır, kendi şifresini girmeye devam edebilir. Rastgelelik tek kapıdan
 * (`randomBytes`, yoksa açık hata; Math.random yok). Sonuç her zaman `checkBackupPassword`'dan geçer.
 */
export function suggestBackupPassword(
  ctx: { username: string; email: string },
  random: (n: number) => Uint8Array = randomBytes,
): string {
  const need = SUGGEST_GROUPS * SUGGEST_GROUP_LENGTH
  for (;;) {
    const chars: string[] = []
    while (chars.length < need) {
      for (const b of random(need * 2)) {
        if (b < SUGGEST_BYTE_LIMIT && chars.length < need) chars.push(SUGGEST_ALPHABET[b % SUGGEST_ALPHABET.length])
      }
    }
    const groups: string[] = []
    for (let i = 0; i < need; i += SUGGEST_GROUP_LENGTH) groups.push(chars.slice(i, i + SUGGEST_GROUP_LENGTH).join(''))
    const candidate = groups.join('-')
    if (checkBackupPassword(candidate, ctx).ok) return candidate
  }
}
