/** M6b §7.2 — sesli mesaj dalga formu: 64 örnek, 0-255 bayt, base64. Web yalnız çözer (gönderim yalnız mobilde, §8.1). */
export const WAVEFORM_BARS = 64

/** base64 → 64 sayı; çözülemezse ya da uzunluk 64 değilse null. */
export function decodeWaveform(b64: string | null | undefined): number[] | null {
  if (!b64) return null
  try {
    const bin = atob(b64)
    if (bin.length !== WAVEFORM_BARS) return null
    return Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/** waveform yoksa ek id'sinden türetilen sabit, alçak genlikli desen (rastgele DEĞİL). */
export function fallbackWaveform(id: string): number[] {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  const out: number[] = []
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) + i
    out.push(40 + ((h >>> 0) % 50)) // 40..89
  }
  return out
}
