/**
 * Afiş rengi preset → gradient eşlemesi (mobil karşılığı).
 *
 * 🔴 **`bannerColor` bir CSS rengi DEĞİL, bir anahtar.** Sunucu allowlist ile doğruluyor
 * (`api/src/common/banner-presets.ts` `BANNER_PRESET_KEYS`) ve liste dışını "Geçersiz afiş rengi."
 * diye reddediyor. Yani serbest hex girilemez; girilse sunucu kabul etmez.
 *
 * Değerler web'in `web/src/utils/bannerColor.ts` dosyasından **birebir** alındı. Metro proje kökü
 * dışını çözemediği için (i18n'deki aynı sınır) import edilemiyor, kopyalandı:
 * **iki dosya birlikte değişir.** Anahtar listesi üç yerde aynı olmalı — sunucu allowlist'i, web
 * eşlemesi, bu dosya.
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

/** Web'deki `linear-gradient(135deg, A 0%, B 100%)` çiftlerinin [A, B] hâli. */
const BANNER_GRADIENTS: Record<BannerPresetKey, [string, string]> = {
  cream: ['#E8DCC8', '#C9B79A'],
  pink: ['#F58BB4', '#D14E86'],
  red: ['#F2545B', '#C0303A'],
  orange: ['#FF845E', '#E5552A'],
  yellow: ['#F5C843', '#E8A33D'],
  purple: ['#9B7BE8', '#6C4BC0'],
  blue: ['#5BA3F5', '#2E6BC0'],
  teal: ['#3FC9C0', '#1F8C8C'],
  green: ['#5BC97E', '#2E8C4E'],
  dark: ['#3A3633', '#1A1817'],
};

/**
 * Varsayılan afiş — markanın KARARTILMIŞ Kor tonu (web ile aynı). Parlak aksan bilinçli
 * kullanılmıyor: aynı renkteki altıgen simge afişe karışıyordu.
 */
const DEFAULT_BANNER: [string, string] = ['#6E3A28', '#3A1E16'];

/** Preset anahtarını gradient renk çiftine çevir. null/geçersiz → marka gradyanı. */
export function bannerColors(key: string | null | undefined): [string, string] {
  if (key && key in BANNER_GRADIENTS) return BANNER_GRADIENTS[key as BannerPresetKey];
  return DEFAULT_BANNER;
}
