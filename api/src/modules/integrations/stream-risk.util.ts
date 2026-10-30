import { StreamInfo, ProviderKey } from './providers/stream-provider';

/**
 * C36 §5.3 (R7) — duyuru içerik kapısı. Saf fonksiyon, test edilebilir.
 *
 * Riskli = kumar kategorisi VEYA platformun yetişkin işareti VEYA okunamadı (fail-closed).
 * Riskli yayın yalnız `adultsOnly` ortamlarda duyurulur; diğerlerinde HİÇ.
 */

/**
 * Kategori ADI deseni. Kimlikler platformdan doğrulanamadığı için (rapora bak) ana kapı addır ve
 * bilinçli geniştir: yanlış pozitif = duyuru yalnız 18+ ortama gider (güvenli yön).
 * Kick ve Twitch kumar kategorisi: "Slots & Casino" (Kick'in yardım merkezi; Twitch'te "Slots & Casino" ve "Poker").
 */
const GAMBLING_NAME_PATTERN =
  /(slot|casino|kumarhane|poker|blackjack|roulette|rulet|baccarat|bakara|gambl|kumar|bahis|betting|sportsbook|\bbet\b|lottery|loto|jackpot)/i;

/** Twitch içerik sınıflandırma etiketleri (§5.3) */
const RISKY_TWITCH_LABELS = new Set([
  'Gambling',
  'MatureGame',
  'SexualThemes',
  'DrugsIntoxication',
  'ViolentGraphic',
  'ProfanityVulgarity',
]);

export function isRiskyStream(
  provider: ProviderKey,
  info: StreamInfo | null,
  extraGamblingCategoryIds: string[] = [],
): boolean {
  if (info === null) return true; // okunamadı → riskli
  if (info.categoryId !== null && extraGamblingCategoryIds.includes(info.categoryId)) return true;
  if (info.categoryName !== null && GAMBLING_NAME_PATTERN.test(info.categoryName)) return true;
  if (info.mature) return true;
  if (provider === 'twitch' && info.labels.some((label) => RISKY_TWITCH_LABELS.has(label))) {
    return true;
  }
  return false;
}
