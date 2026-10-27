/**
 * C21: kanal adı kuralı, mobil kopyası (sunucu `api/src/common/utils/channel-name.util.ts` otoritedir).
 *
 * Discord deseni: boşluk -> '-', büyük harf -> küçük (Türkçe I->ı, İ->i), art arda tire teke iner.
 * Emoji kabul edilir. Yazarken izinsiz karakterler atılır; baş/son tire yalnız kaydederken temizlenir.
 *
 * `Intl.Segmenter` KULLANILMAZ (Hermes'te yok); bu yüzden grapheme sayımı da yapılmaz, sunucu karar
 * verir. `toLocaleLowerCase('tr')` da kullanılmaz (Hermes locale desteğine bağlı); I/İ elle çevrilir.
 */

const PLAIN = /[a-z0-9çğıöşü-]/;
const HAS_ALNUM = /[a-z0-9çğıöşü]/;
/** Emoji ile ilişkili ama 0x2190 altında kalan nadir tek-kod-noktaları. */
const LOW_EMOJI = new Set([0xa9, 0xae, 0x203c, 0x2049, 0x2122, 0x2139]);

/**
 * Bir karakteri tutar mı? Düz izinli karakterler + emoji bileşenleri (ZWJ 200D, VS16 FE0F, ten rengi,
 * etiket) + 0x2190 ve üstü semboller/pictograflar. Noktalama ve ASCII/Latin dışı harfler atılır.
 * Burada AMAÇ bariz geçersizi yazdırmamak; kesin karar sunucuda (CJK gibi sızanı o reddeder).
 */
function keep(ch: string): boolean {
  if (PLAIN.test(ch)) return true;
  const cp = ch.codePointAt(0) ?? 0;
  return cp === 0x200d || cp === 0xfe0f || LOW_EMOJI.has(cp) || cp >= 0x2190;
}

/** Yazarken uygulanır: baş/son tire KORUNUR (kullanıcı "oyun-" yazarken tire silinmesin). */
export function normalizeChannelNameLive(input: string): string {
  const lowered = input.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase().replace(/\s+/g, '-');
  let out = '';
  for (const ch of lowered) if (keep(ch)) out += ch;
  return out.replace(/-+/g, '-');
}

/** Kaydederken uygulanır: yazarken kuralı + baştaki/sondaki tire temizliği. */
export function normalizeChannelName(input: string): string {
  return normalizeChannelNameLive(input).replace(/^-|-$/g, '');
}

/** Gönderilebilir mi (UX): en az 2 kod noktası ve en az bir harf/rakam. Kesin karar sunucuda. */
export function isChannelNameSubmittable(name: string): boolean {
  return [...name].length >= 2 && HAS_ALNUM.test(name);
}
