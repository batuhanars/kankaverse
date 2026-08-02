import { t } from '@/i18n';

/**
 * Etkinlik tarih/saat TR formatı — web `useEventDateFormat.ts` karşılığı (Sprint V3 §8).
 *  - Bugün:  "bugün saat 23.00"
 *  - Yarın:  "yarın saat 22.00"
 *  - Diğer:  "15 Haziran 22.00"
 * Saat ayıracı **nokta** (TR yereli — kök CLAUDE.md i18n kuralı). Metinler `event.date.*` ve
 * `months.*` anahtarlarından; ay adı koda gömülmez.
 */
export function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (isSameDay(d, now)) return t('event.date.today', { time: formatTime(d) });
  if (isSameDay(d, tomorrow)) return t('event.date.tomorrow', { time: formatTime(d) });

  return t('event.date.full', {
    day: String(d.getDate()),
    month: t(`months.${d.getMonth() + 1}`),
    time: formatTime(d),
  });
}

/**
 * Başlangıç + (varsa) bitiş: "bugün saat 21.00 - 23.00".
 * Bitiş aynı güne düşüyorsa yalnız saat, farklı güne taşıyorsa tam tarih yazılır.
 */
export function formatEventRange(startIso: string, endIso: string | null): string {
  const start = formatEventDate(startIso);
  if (!endIso) return start;
  const s = new Date(startIso);
  const e = new Date(endIso);
  const end = isSameDay(s, e) ? formatTime(e) : formatEventDate(endIso);
  return t('event.date.range', { start, end });
}

/** Form alanı etiketi: "2 Ağustos 2026" (seçici düğmesinde gösterilir). */
export function formatDateLabel(d: Date): string {
  return `${d.getDate()} ${t(`months.${d.getMonth() + 1}`)} ${d.getFullYear()}`;
}
