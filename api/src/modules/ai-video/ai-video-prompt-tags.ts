import { BadRequestException } from '@nestjs/common';
import { AiVideoError } from './ai-video.constants';
import { AI_VIDEO_MESSAGES } from './ai-video.mapper';
import { AiVideoMode } from './ai-video.models';

/** Etiket sayıları: türü içinde kaç referans var (etiketin geçerli üst sınırı). */
export interface PromptTagCounts {
  image: number;
  video: number;
  audio: number;
}

/** Referans türlerinden etiket sayıları. */
export function countKinds(kinds: ('image' | 'video' | 'audio')[]): PromptTagCounts {
  const counts: PromptTagCounts = { image: 0, video: 0, audio: 0 };
  for (const kind of kinds) counts[kind] += 1;
  return counts;
}

/** `@Görsel2`, `@Video1`, `@Ses1` (büyük/küçük harf duyarsız). Harf/rakam bitişiğindeki `@` (e-posta) etiket sayılmaz. */
const TAG_PATTERN = /(?<![\p{L}\p{N}])@(Görsel|Video|Ses)(\d+)/giu;

const KIND_OF_WORD = { görsel: 'image', video: 'video', ses: 'audio' } as const;
/** Sağlayıcı yazımındaki tür adı (`tagFormat` içindeki `{Kind}`). */
const PROVIDER_WORD = { image: 'Image', video: 'Video', audio: 'Audio' } as const;
/** Wan omni yazımı (C42 §0; ses yazımı belgede yok, varsayım). Model tablosunda `references.tagFormat`. */
export const DEFAULT_TAG_FORMAT = '{Kind} {n}';

/**
 * C42 §1.4: kullanıcının yazdığı etiketleri sağlayıcı yazımına çevirir (saf fonksiyon, satırda ham istem saklanır).
 * - reference: `tagFormat`e göre; Wan `@Görsel2` → `Image 2`, Seedance `@Görsel2` → `@Image2`
 * - image (görselden video): `@Görsel1` → `görsel` (tek görsel, numara anlamsız)
 * - Var olmayan referansa etiket → 400 AI_VIDEO_INVALID_OPTION.
 */
export function translatePromptTags(
  prompt: string,
  mode: AiVideoMode,
  counts: PromptTagCounts,
  tagFormat = DEFAULT_TAG_FORMAT,
): string {
  return prompt.replace(TAG_PATTERN, (_all, word: string, num: string) => {
    const kind = KIND_OF_WORD[word.toLowerCase() as keyof typeof KIND_OF_WORD];
    const n = Number(num);
    if (n < 1 || n > counts[kind]) {
      throw new BadRequestException({
        message: AI_VIDEO_MESSAGES[AiVideoError.INVALID_OPTION],
        error: AiVideoError.INVALID_OPTION,
      });
    }
    if (mode === 'image') return 'görsel';
    return tagFormat.replace('{Kind}', PROVIDER_WORD[kind]).replace('{n}', String(n));
  });
}
