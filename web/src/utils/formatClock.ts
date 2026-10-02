/** M6b — saniye/ms → `0:07`, `1:23` (sesli mesaj süresi ve kayıt sayacı). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
