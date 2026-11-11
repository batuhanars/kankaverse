import type { BackupOutcome } from '@/stores/e2eeBackup'

/** Yedek eyleminin hata sonucunu kullanıcıya Türkçe metne çevirir; ham hata asla gösterilmez. */
export function outcomeMessage(
  o: Extract<BackupOutcome, { ok: false }>,
  t: (key: string) => string,
): string {
  if (o.reason === 'wrong-password') return t('e2ee.backup.wrongPassword')
  if (o.reason === 'generic') return o.message ?? t('e2ee.backup.errors.generic')
  return t(`e2ee.backup.rules.${o.reason}`)
}
