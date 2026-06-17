// Sprint C6 §5 — bannerColor preset → CSS gradient eşlemesi (TEK KAYNAK).
// Backend allowlist anahtarlarıyla BİREBİR aynı (api/.../discovery preset KEY'leri).
// Hem Keşfet kartı afişinde hem Ortam Ayarları swatch seçicide kullanılır.
// Görsel afiş YOK — afiş yalnız renk/gradient preset (sözleşme §0/§3).

// Backend allowlist ile birebir sıra (Ayarlar swatch seçici bu sırayı kullanır).
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
] as const

export type BannerPresetKey = (typeof BANNER_PRESET_KEYS)[number]

// Her preset için makul iki-renk gradient. --kv paletiyle uyumlu koyu-tema tonları.
const BANNER_GRADIENTS: Record<BannerPresetKey, string> = {
  cream: 'linear-gradient(135deg, #E8DCC8 0%, #C9B79A 100%)',
  pink: 'linear-gradient(135deg, #F58BB4 0%, #D14E86 100%)',
  red: 'linear-gradient(135deg, #F2545B 0%, #C0303A 100%)',
  orange: 'linear-gradient(135deg, #FF845E 0%, #E5552A 100%)',
  yellow: 'linear-gradient(135deg, #F5C843 0%, #E8A33D 100%)',
  purple: 'linear-gradient(135deg, #9B7BE8 0%, #6C4BC0 100%)',
  blue: 'linear-gradient(135deg, #5BA3F5 0%, #2E6BC0 100%)',
  teal: 'linear-gradient(135deg, #3FC9C0 0%, #1F8C8C 100%)',
  green: 'linear-gradient(135deg, #5BC97E 0%, #2E8C4E 100%)',
  dark: 'linear-gradient(135deg, #3A3633 0%, #1A1817 100%)',
}

// Varsayılan afiş (bannerColor null / geçersiz) — Kankaverse markasının KARARTILMIŞ Kor tonu.
// Parlak accent DEĞİL: aksi halde aynı renkteki Kor hexagon simge afişe karışıp seçilmiyor
// (Görsel #46). Koyu ember gradyanı → marka sıcaklığı kalır, simge net öne çıkar.
const DEFAULT_BANNER = 'linear-gradient(135deg, #6E3A28 0%, #3A1E16 100%)'

/** Preset anahtarını CSS background değerine çevir. null/geçersiz → marka Kor gradyanı. */
export function bannerBackground(key: string | null): string {
  if (key && key in BANNER_GRADIENTS) {
    return BANNER_GRADIENTS[key as BannerPresetKey]
  }
  return DEFAULT_BANNER
}
