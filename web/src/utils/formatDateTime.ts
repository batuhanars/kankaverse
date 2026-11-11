/** TR tarih + saat: "25 Ekim 2026 18.42" (kök CLAUDE.md i18n kuralı; saat ayıracı nokta). */
export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const date = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d
    .toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    .replace(':', '.')
  return `${date} ${time}`
}
