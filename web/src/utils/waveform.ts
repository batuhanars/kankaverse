/** M6b §7.2 — sesli mesaj dalga formu: 64 örnek, 0-255 bayt, base64 (mobil ile aynı formül). */
export const WAVEFORM_BARS = 64

/** dB → 0-255: -60 dB ve altı 0, 0 dB 255, arası doğrusal. */
export function dbToByte(db: number): number {
  if (!Number.isFinite(db)) return 0
  const clamped = Math.min(0, Math.max(-60, db))
  return Math.round(((clamped + 60) / 60) * 255)
}

/** Örnekleri (0-255) 64 kovaya indirir (kova tepe değeri) ve base64 yapar. */
export function encodeWaveform(samples: number[]): string {
  const out = new Uint8Array(WAVEFORM_BARS)
  const n = samples.length
  if (n > 0) {
    for (let i = 0; i < WAVEFORM_BARS; i++) {
      const from = Math.floor((i * n) / WAVEFORM_BARS)
      const to = Math.max(from + 1, Math.floor(((i + 1) * n) / WAVEFORM_BARS))
      let peak = 0
      for (let j = from; j < to && j < n; j++) peak = Math.max(peak, samples[j])
      out[i] = Math.min(255, Math.max(0, Math.round(peak)))
    }
  }
  let bin = ''
  out.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

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
