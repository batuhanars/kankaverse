/** C14b §1 — Pika model tablosu (tek kaynak). Gövde alan adları buradan gelir; servis model adına göre dallanmaz. */
/** C42: istek kipi. text/image = mevcut uçlar; reference = çoklu referans (omni) ucu. */
export type AiVideoMode = 'text' | 'image' | 'reference';

/** C42 §1.1: çoklu referans yeteneği (yoksa null). Sınırlar bizim tavanımız, sağlayıcınınkinden küçük. */
export interface AiVideoReferenceSpec {
  apiFunction: string;
  fields: { image: string; video: string; audio: string };
  max: { image: number; video: number; audio: number };
  videoTotalMaxS: number;
  videoMaxS: number;
  audioMaxS: number;
  aspectRatios: string[];
}

export interface AiVideoModelSpec {
  key: string;
  label: string;
  /** `api_id` = `${apiBase}/${text-to-video|image-to-video|references.apiFunction}` */
  apiBase: string;
  durations: number[];
  resolutions: string[];
  /** C14f: ölçü alanının gövdedeki adı ve yazı/görsel için kabul edilen değerler (görselde boş = alan yok). */
  aspectField: string;
  aspectRatios: { text: string[]; image: string[] };
  durationField: string;
  imageField: string;
  /** Ses: none = sessiz, default = varsayılan açık, always = her zaman sesli. */
  audio: 'none' | 'default' | 'always';
  /** Her gövdeye eklenen sabit alanlar. */
  fixed: Record<string, unknown>;
  references: AiVideoReferenceSpec | null;
}

/** 2026-11-07: Wan 2-30, Kling 3-15 tam sayı kabul ediyor (teklif ucuyla sınandı); arayüz 5'ten başlar. */
const secondsRange = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const AI_VIDEO_MODEL_TABLE: AiVideoModelSpec[] = [
  {
    key: 'pika-2.5',
    label: 'Pika 2.5',
    apiBase: 'pika/pika-2.5',
    durations: [5, 10],
    resolutions: ['480p', '720p'],
    aspectField: 'aspect_ratio',
    aspectRatios: { text: ['16:9', '9:16', '1:1', '4:3'], image: [] },
    durationField: 'duration_s',
    imageField: 'image',
    audio: 'none',
    fixed: {},
    references: null,
  },
  {
    key: 'wan-3.0',
    label: 'Wan 3.0',
    apiBase: 'alibaba/wan3.0-video',
    durations: secondsRange(5, 30),
    resolutions: ['480p', '720p'],
    aspectField: 'ratio',
    aspectRatios: {
      text: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      image: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    },
    durationField: 'duration',
    imageField: 'first_frame_url',
    audio: 'default',
    fixed: { watermark: false },
    references: {
      apiFunction: 'omni-video',
      fields: {
        image: 'reference_image_urls',
        video: 'reference_video_urls',
        audio: 'reference_audio_urls',
      },
      max: { image: 4, video: 2, audio: 2 },
      videoTotalMaxS: 15,
      videoMaxS: 15,
      audioMaxS: 30,
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    },
  },
  {
    key: 'kling-3.0-turbo',
    label: 'Kling 3.0 Turbo',
    apiBase: 'kling/kling-3.0-turbo',
    durations: secondsRange(5, 15),
    resolutions: ['720p'],
    aspectField: 'aspect_ratio',
    aspectRatios: { text: ['16:9', '9:16', '1:1'], image: [] },
    durationField: 'duration',
    imageField: 'image_url',
    audio: 'always',
    fixed: {},
    references: null,
  },
];

export const findModelSpec = (key: string): AiVideoModelSpec | undefined =>
  AI_VIDEO_MODEL_TABLE.find((m) => m.key === key);

/** Satırda saklanan tam api_id'den model anahtarı (C14'ten kalan satırlar dahil). */
export const modelKeyOfApiId = (apiId: string): string =>
  AI_VIDEO_MODEL_TABLE.find((m) => apiId.startsWith(`${m.apiBase}/`))?.key ?? apiId;

export const apiIdOf = (spec: AiVideoModelSpec, mode: AiVideoMode): string => {
  if (mode === 'reference') return `${spec.apiBase}/${spec.references!.apiFunction}`;
  return `${spec.apiBase}/${mode === 'image' ? 'image-to-video' : 'text-to-video'}`;
};

/** Referans adresleri türe göre (C42); alanlar `spec.references.fields`ten, boş tür gövdeye girmez. */
export interface AiVideoReferenceUrls {
  image: string[];
  video: string[];
  audio: string[];
}

/** Pika'ya giden gövde (teklif ve gönderim aynı alanlar; görsel adresi `image` verilirse eklenir). */
export function buildPikaBody(
  spec: AiVideoModelSpec,
  opts: {
    prompt?: string;
    resolution: string;
    durationS: number;
    image?: string;
    aspectRatio?: string;
    referenceUrls?: AiVideoReferenceUrls;
  },
): Record<string, unknown> {
  return {
    ...(opts.prompt !== undefined && opts.prompt.length > 0 && { prompt: opts.prompt }),
    resolution: opts.resolution,
    [spec.durationField]: opts.durationS,
    ...(opts.aspectRatio !== undefined && { [spec.aspectField]: opts.aspectRatio }),
    ...(opts.image !== undefined && { [spec.imageField]: opts.image }),
    ...(opts.referenceUrls !== undefined && referenceFields(spec, opts.referenceUrls)),
    ...spec.fixed,
  };
}

function referenceFields(spec: AiVideoModelSpec, urls: AiVideoReferenceUrls) {
  const fields = spec.references!.fields;
  return Object.fromEntries(
    (['image', 'video', 'audio'] as const)
      .filter((kind) => urls[kind].length > 0)
      .map((kind) => [fields[kind], urls[kind]]),
  );
}

const QUOTE_PLACEHOLDER_BASE = 'https://example.com/quote-placeholder';
const QUOTE_PLACEHOLDER_EXT = { image: 'png', video: 'mp4', audio: 'mp3' } as const;

/** Teklif gövdesi için yer tutucu referans adresleri (kullanıcı dosyası teklife gitmez; fiyat yalnız "video var mı"ya bağlı). */
export function quotePlaceholderUrls(kinds: ('image' | 'video' | 'audio')[]): AiVideoReferenceUrls {
  const urls: AiVideoReferenceUrls = { image: [], video: [], audio: [] };
  kinds.forEach((kind, i) => {
    urls[kind].push(`${QUOTE_PLACEHOLDER_BASE}-${i + 1}.${QUOTE_PLACEHOLDER_EXT[kind]}`);
  });
  return urls;
}
