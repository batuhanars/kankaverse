/**
 * C21: kanal adı kuralı + emoji yardımcıları (saf TS, tek kaynak).
 * Web (`utils/channelName.ts`) ve mobil kopyaları bu kuralın aynasıdır; sunucu otoritedir.
 */

const MIN_LEN = 2;
const MAX_LEN = 50;

/** Tek emoji kümesi: bayrak (2 bölgesel gösterge) VEYA pictograf + (ten rengi/VS16/etiket) + ZWJ zinciri. */
const EMOJI_CLUSTER =
  /^(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}️\u{E0020}-\u{E007F}]*(?:‍\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}️]*)*)$/u;

const PLAIN_CHAR = /^[a-z0-9çğıöşü-]$/;
const HAS_ALNUM = /[a-z0-9çğıöşü]/;

const segmenter = new Intl.Segmenter('tr', { granularity: 'grapheme' });

/** Görünen karakter (grapheme) dizisi. */
export function graphemes(s: string): string[] {
  return Array.from(segmenter.segment(s), (x) => x.segment);
}

export function graphemeLength(s: string): number {
  return graphemes(s).length;
}

/** Yalnız tek bir emoji kümesi mi (ZWJ, ten rengi, bayrak dahil). */
export function isSingleEmoji(s: string): boolean {
  if (typeof s !== 'string' || s.length === 0) return false;
  const g = graphemes(s);
  return g.length === 1 && EMOJI_CLUSTER.test(g[0]);
}

/**
 * Discord deseni: boşluk -> '-', büyük harf -> küçük (Türkçe I->ı, İ->i), art arda tire teke iner,
 * baş/son tire atılır. ICU'ya bağlı olmamak için I/İ elle çevrilir.
 */
export function normalizeChannelName(input: string): string {
  return (input ?? '')
    .normalize('NFC')
    .replace(/I/g, 'ı')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Geçersizse Türkçe hata mesajı, geçerliyse null. `name` normalleştirilmiş olmalı. */
export function channelNameError(name: string): string | null {
  const parts = graphemes(name);
  if (parts.length < MIN_LEN) return `Kanal adı en az ${MIN_LEN} karakter olmalıdır.`;
  if (parts.length > MAX_LEN) return `Kanal adı en fazla ${MAX_LEN} karakter olabilir.`;
  if (!parts.every((p) => PLAIN_CHAR.test(p) || EMOJI_CLUSTER.test(p))) {
    return 'Kanal adı yalnızca küçük harf, rakam, tire ve emoji içerebilir.';
  }
  if (!HAS_ALNUM.test(name)) return 'Kanal adı en az bir harf veya rakam içermelidir.';
  return null;
}

export function isValidChannelName(name: string): boolean {
  return channelNameError(name) === null;
}

/**
 * Dış kaynaktan (Discord içe aktarma) gelen adı kurala sokar: normalleştir, izinsiz karakterleri
 * tireye çevir, 50 grapheme'e kes. Geçerli ad çıkmazsa `fallback`.
 */
export function sanitizeChannelName(input: string, fallback = 'kanal'): string {
  const cleaned = graphemes(normalizeChannelName(input))
    .map((p) => (PLAIN_CHAR.test(p) || EMOJI_CLUSTER.test(p) ? p : '-'))
    .join('');
  const name = graphemes(normalizeChannelName(cleaned)).slice(0, MAX_LEN).join('');
  return isValidChannelName(name) ? name : fallback;
}
