/** C14b §1 — Pika model tablosu (tek kaynak). Gövde alan adları buradan gelir; servis model adına göre dallanmaz. */
export interface AiVideoModelSpec {
  key: string;
  label: string;
  /** `api_id` = `${apiBase}/${text-to-video|image-to-video}` */
  apiBase: string;
  durations: number[];
  resolutions: string[];
  durationField: string;
  imageField: string;
  /** Ses: none = sessiz, default = varsayılan açık, always = her zaman sesli. */
  audio: 'none' | 'default' | 'always';
  /** Her gövdeye eklenen sabit alanlar. */
  fixed: Record<string, unknown>;
}

export const AI_VIDEO_MODEL_TABLE: AiVideoModelSpec[] = [
  {
    key: 'pika-2.5',
    label: 'Pika 2.5',
    apiBase: 'pika/pika-2.5',
    durations: [5, 10],
    resolutions: ['480p', '720p'],
    durationField: 'duration_s',
    imageField: 'image',
    audio: 'none',
    fixed: {},
  },
  {
    key: 'wan-3.0',
    label: 'Wan 3.0',
    apiBase: 'alibaba/wan3.0-video',
    durations: [5, 10, 15, 20, 30],
    resolutions: ['480p', '720p'],
    durationField: 'duration',
    imageField: 'first_frame_url',
    audio: 'default',
    fixed: { watermark: false },
  },
  {
    key: 'kling-3.0-turbo',
    label: 'Kling 3.0 Turbo',
    apiBase: 'kling/kling-3.0-turbo',
    durations: [5, 10, 15],
    resolutions: ['720p'],
    durationField: 'duration',
    imageField: 'image_url',
    audio: 'always',
    fixed: {},
  },
];

export const findModelSpec = (key: string): AiVideoModelSpec | undefined =>
  AI_VIDEO_MODEL_TABLE.find((m) => m.key === key);

/** Satırda saklanan tam api_id'den model anahtarı (C14'ten kalan satırlar dahil). */
export const modelKeyOfApiId = (apiId: string): string =>
  AI_VIDEO_MODEL_TABLE.find((m) => apiId.startsWith(`${m.apiBase}/`))?.key ?? apiId;

export const apiIdOf = (spec: AiVideoModelSpec, withImage: boolean): string =>
  `${spec.apiBase}/${withImage ? 'image-to-video' : 'text-to-video'}`;

/** Pika'ya giden gövde (teklif ve gönderim aynı alanlar; görsel adresi `image` verilirse eklenir). */
export function buildPikaBody(
  spec: AiVideoModelSpec,
  opts: { prompt?: string; resolution: string; durationS: number; image?: string },
): Record<string, unknown> {
  return {
    ...(opts.prompt !== undefined && opts.prompt.length > 0 && { prompt: opts.prompt }),
    resolution: opts.resolution,
    [spec.durationField]: opts.durationS,
    ...(opts.image !== undefined && { [spec.imageField]: opts.image }),
    ...spec.fixed,
  };
}
