import { registerDecorator, type ValidationOptions } from 'class-validator';

/** C24: hızlı tepki şeridi varsayılanı (tek kaynak; istemciler etkin listeyi sunucudan okur). */
export const DEFAULT_QUICK_REACTIONS: readonly string[] = ['👍', '❤️', '😂', '😮', '😢'];
export const QUICK_REACTION_COUNT = 5;
const MAX_EMOJI_LENGTH = 32;

/** Kayıtlı liste doluysa o, değilse varsayılan. */
export function effectiveQuickReactions(stored: string[] | null | undefined): string[] {
  return stored && stored.length > 0 ? stored : [...DEFAULT_QUICK_REACTIONS];
}

const HAS_ALNUM = /[\p{L}\p{N}]/u;
const HAS_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Tek bir emoji grafemi mi (boş değil, <=32, harf/rakam yok). */
export function isSingleEmoji(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_EMOJI_LENGTH) {
    return false;
  }
  if (HAS_ALNUM.test(value) || !HAS_EMOJI.test(value)) return false;
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return [...segmenter.segment(value)].length === 1;
}

/** Boş dizi (= varsayılana dön) YA DA tam 5 benzersiz tek-emoji. */
export function IsQuickReactions(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isQuickReactions',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Hızlı tepkiler boş (varsayılan) ya da 5 farklı emoji olmalı.',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return false;
          if (value.length === 0) return true;
          return (
            value.length === QUICK_REACTION_COUNT &&
            value.every(isSingleEmoji) &&
            new Set(value).size === value.length
          );
        },
      },
    });
}
