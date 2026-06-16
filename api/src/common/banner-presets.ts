/**
 * C6 — Ortam afişi renk preset anahtarları (allowlist).
 *
 * bannerColor = arbitrary CSS DEĞİL, sabit anahtar. Backend bu listeyle doğrular;
 * frontend aynı anahtarları gradient'e eşler (--kv-* token uyumlu).
 */
export const BANNER_PRESET_KEYS = [
  'cream',
  'pink',
  'red',
  'orange',
  'yellow',
  'purple',
  'blue',
  'teal',
  'green',
  'dark',
] as const;

export type BannerPresetKey = (typeof BANNER_PRESET_KEYS)[number];
