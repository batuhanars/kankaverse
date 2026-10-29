import { t } from '@/i18n';

/** C31f: geçmiş bir anı "4 saat önce" biçiminde yazar (Hermes'te Intl.RelativeTimeFormat'a güvenilmez, metinler i18n'den). */
export function formatAgo(iso: string, nowMs: number = Date.now()): string {
  const minutes = Math.floor((nowMs - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t('profile.activity.justNow');
  if (minutes < 60) return t('profile.activity.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('profile.activity.hoursAgo', { n: hours });
  return t('profile.activity.daysAgo', { n: Math.floor(hours / 24) });
}
