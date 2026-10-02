/** Sprint M6b — milisaniyeyi `0:07` / `1:23` biçimine çevirir (sesli mesaj süresi, kayıt sayacı). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
