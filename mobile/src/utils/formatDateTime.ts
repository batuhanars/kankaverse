import { formatTime } from '@/utils/eventDate';
import { t } from '@/i18n';

/** TR tarih + saat: "25 Ekim 2026 18.42". Ay adı `months.*` anahtarlarından (Hermes Intl'ine güvenilmez). */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${t(`months.${d.getMonth() + 1}`)} ${d.getFullYear()} ${formatTime(d)}`;
}
