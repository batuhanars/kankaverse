/**
 * Sprint M6b §7.2 — sesli mesaj dalgası: 64 örnek, her biri 0-255 bayt, base64 (88 karakter).
 * Web ile AYNI formül (iki istemcinin dalgası benzer görünsün): -60 dB ve altı = 0, 0 dB = 255,
 * arası doğrusal.
 */
export const WAVEFORM_BARS = 64;
const MIN_DB = -60;

/** dB → 0-255. Sayı olmayan/eksik değer sessizlik sayılır. */
export function dbToByte(db: number | undefined): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
  const clamped = Math.max(MIN_DB, Math.min(0, db));
  return Math.round(((clamped - MIN_DB) / -MIN_DB) * 255);
}

/** Ham örnekleri (0-255) 64 kovaya indirir (her kovanın tepe değeri) ve base64'e çevirir. */
export function encodeWaveform(samples: number[]): string {
  const bytes = new Uint8Array(WAVEFORM_BARS);
  const n = samples.length;
  if (n > 0) {
    for (let i = 0; i < WAVEFORM_BARS; i += 1) {
      const from = Math.floor((i * n) / WAVEFORM_BARS);
      const to = Math.max(from + 1, Math.floor(((i + 1) * n) / WAVEFORM_BARS));
      let peak = 0;
      for (let j = from; j < to && j < n; j += 1) peak = Math.max(peak, samples[j]);
      bytes[i] = Math.max(0, Math.min(255, Math.round(peak)));
    }
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** base64 → 64 sayı (0-255). Bozuk/eksik veri null döner (çağıran fallback desene düşer). */
export function decodeWaveform(b64: string | null | undefined): number[] | null {
  if (!b64) return null;
  try {
    const bin = atob(b64);
    if (bin.length !== WAVEFORM_BARS) return null;
    return Array.from({ length: WAVEFORM_BARS }, (_, i) => bin.charCodeAt(i));
  } catch {
    return null;
  }
}

/**
 * `waveform` yokken (M6b-1 mesajları) ek `id`'sinden türetilen sabit, alçak genlikli desen.
 * Rastgele DEĞİL: aynı id her açılışta aynı çizimi verir.
 */
export function fallbackWaveform(id: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Array.from({ length: WAVEFORM_BARS }, () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return 40 + ((h >>> 0) % 60); // 40..99 / 255: alçak, ama görünür
  });
}
