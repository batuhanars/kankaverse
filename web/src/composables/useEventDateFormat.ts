import { useI18n } from 'vue-i18n'

/**
 * Etkinlik tarih+saat TR yerel formatlayıcı (Sprint V3 §8).
 *  - Bugün:  "bugün saat 23.00"
 *  - Yarın:  "yarın saat 22.00"
 *  - Diğer:  "15 Haziran 22.00"  (ay adı i18n months.*)
 * Saat ayıracı nokta (TR yereli — brief §12 / kök CLAUDE.md).
 */
export function useEventDateFormat() {
  const { t } = useI18n()

  function timePart(d: Date): string {
    return d
      .toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      .replace(':', '.')
  }

  function isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    )
  }

  function formatEventDate(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)

    if (isSameDay(d, now)) {
      return t('event.date.today', { time: timePart(d) })
    }
    if (isSameDay(d, tomorrow)) {
      return t('event.date.tomorrow', { time: timePart(d) })
    }
    const month = t(`months.${d.getMonth() + 1}`)
    return t('event.date.full', { day: d.getDate(), month, time: timePart(d) })
  }

  return { formatEventDate, timePart }
}
