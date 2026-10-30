/**
 * C35 §3.5 — `username` / webhook adı taklidi. Normalleştirilmiş ad aşağıdaki ayrılmış adlardan
 * birini İÇERİYORSA (eşitlik dahil) ad reddedilir. Rozet her durumda görünür (§5.1); bu kural
 * yalnız "Kankaverse Moderatör" gibi resmî görünüm taklidini keser.
 */
const RESERVED_NAMES = [
  'kankaverse',
  'moderator',
  'yonetici',
  'admin',
  'sistem',
  'system',
  'destek',
  'support',
  'resmi',
  'official',
];

/**
 * Türkçe duyarlı küçük harf, aksan/ayrık işaret sökümü, Türkçe harfleri ASCII'ye indirme,
 * harf-rakam dışını atma ("K a n k a v e r s e", "kanka_verse" kaçışı kapanır).
 * Not: burada `ı → i` KATLANIR (automod'un tersine): amaç taklit tespiti, kelime ayırt etmek değil.
 */
export function normalizeWebhookName(name: string): string {
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

export function isReservedWebhookName(name: string): boolean {
  const normalized = normalizeWebhookName(name);
  return RESERVED_NAMES.some((reserved) => normalized.includes(reserved));
}
