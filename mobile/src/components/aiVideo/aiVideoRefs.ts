import type { AiVideoModelOption, AiVideoRefKind, AiVideoReferencesOption } from '@/api/aiVideo';

/** Referans ucu olmayan ama görselden üretebilen model (Pika, Kling, Seedance): tek görsel (web `IMAGE_ONLY` eşdeğeri). */
export const IMAGE_ONLY: AiVideoReferencesOption = {
  max: { image: 1, video: 0, audio: 0 },
  videoTotalMaxS: 0,
  videoMaxS: 0,
  audioMaxS: 0,
  aspectRatios: [],
  inputTypes: { image: ['image/png', 'image/jpeg', 'image/webp'], video: [], audio: [] },
};

/** Modelin ek sınırları; ne referans ne görsel kabul eden modelde (Veo) null = ek eklenemez. */
export function refsLimitsOf(model: AiVideoModelOption | null): AiVideoReferencesOption | null {
  if (!model) return null;
  return model.references ?? (model.supportsImage ? IMAGE_ONLY : null);
}

/** Sunucu süre toleransı (sözleşme §1.3): istemci ön denetimi aynı sınırı kullanır. */
export const DURATION_TOLERANCE_S = 0.5;

/** Boyut sınırları sözleşme §0.4 (options yanıtında yok); otorite sunucu. */
export const MAX_BYTES: Record<AiVideoRefKind, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 10 * 1024 * 1024,
};

/** Etiket adları (sözleşme §1.4): `@Görsel1`, `@Video1`, `@Ses1`. Sunucuyla aynı yazım, çeviri değil protokol. */
const TAG_NAME: Record<AiVideoRefKind, string> = { image: 'Görsel', video: 'Video', audio: 'Ses' };
const TAG_RE = /@(Görsel|Video|Ses)(\d+)(?!\d)/giu;

export interface RefItem {
  id: string;
  kind: AiVideoRefKind;
  uri: string;
  contentType: string;
  size: number;
  /** null = ölçülemedi (ön denetim atlandı, sunucu denetler). */
  durationS: number | null;
  status: 'uploading' | 'ready' | 'error';
  key?: string;
  error?: string;
}

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/mp4a-latm': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-aac': 'audio/aac',
  'audio/aacp': 'audio/aac',
  'video/x-m4v': 'video/mp4',
};

const EXT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
};

/** Picker'ın verdiği içerik türünü sunucu listesine çevirir; yoksa uzantıya düşer. '' = tanınmadı. */
export function normalizeMime(raw: string | null | undefined, name: string | null | undefined): string {
  const mime = (raw ?? '').toLowerCase().split(';')[0].trim();
  if (mime && mime !== 'application/octet-stream') return MIME_ALIASES[mime] ?? mime;
  return EXT_TYPES[(name ?? '').toLowerCase().split('.').pop() ?? ''] ?? '';
}

export function kindOfMime(mime: string): AiVideoRefKind | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

/** Türü içindeki sıra (1'den) → `Görsel1`. */
export function tagLabel(kind: AiVideoRefKind, n: number): string {
  return `${TAG_NAME[kind]}${n}`;
}

/** Her ekin etiketi, eklenme sırasına göre türü içinde numaralanır. */
export function labelsOf(items: RefItem[]): string[] {
  const seen: Record<AiVideoRefKind, number> = { image: 0, video: 0, audio: 0 };
  return items.map((it) => tagLabel(it.kind, ++seen[it.kind]));
}

function kindOfTagName(name: string): AiVideoRefKind {
  const lower = name.toLocaleLowerCase('tr');
  return (Object.keys(TAG_NAME) as AiVideoRefKind[]).find((k) => TAG_NAME[k].toLocaleLowerCase('tr') === lower) ?? 'image';
}

/**
 * Ek kaldırılınca (sözleşme §3.5): kaldırılan eke ait etiketler istemden silinir, aynı türdeki sonraki
 * eklerin etiketi bir azalır. `n` = kaldırılan ekin türü içindeki sırası (1'den).
 */
export function retagPrompt(prompt: string, kind: AiVideoRefKind, n: number): string {
  return prompt
    .replace(TAG_RE, (all, name: string, num: string) => {
      if (kindOfTagName(name) !== kind) return all;
      const k = Number(num);
      if (k === n) return '';
      return k > n ? `@${name}${k - 1}` : all;
    })
    .replace(/ {2,}/g, ' ');
}

/** Kip kuralı (sözleşme §0): yalnız tek görsel → eski görselden video; başka her bileşim → referans. */
export type RefMode = 'text' | 'image' | 'reference';
export function modeOf(items: RefItem[]): RefMode {
  if (items.length === 0) return 'text';
  return items.length === 1 && items[0].kind === 'image' ? 'image' : 'reference';
}

export type AddDenial = 'full' | 'type' | 'size' | 'tooLong' | 'totalLong';

/** Yeni ekin erken denetimi (sunucu yine denetler). Süre bilinmiyorsa (null) süre denetimi atlanır. */
export function denyAdd(
  items: RefItem[],
  cand: { kind: AiVideoRefKind; contentType: string; size: number; durationS: number | null },
  refs: AiVideoReferencesOption,
): AddDenial | null {
  const { kind } = cand;
  if (items.filter((i) => i.kind === kind).length >= refs.max[kind]) return 'full';
  if (!refs.inputTypes[kind].includes(cand.contentType)) return 'type';
  if (cand.size > MAX_BYTES[kind]) return 'size';
  const d = cand.durationS;
  if (d !== null && kind === 'video') {
    if (d > refs.videoMaxS + DURATION_TOLERANCE_S) return 'tooLong';
    const total = items.reduce((sum, i) => sum + (i.kind === 'video' ? (i.durationS ?? 0) : 0), 0) + d;
    if (total > refs.videoTotalMaxS + DURATION_TOLERANCE_S) return 'totalLong';
  }
  if (d !== null && kind === 'audio' && d > refs.audioMaxS + DURATION_TOLERANCE_S) return 'tooLong';
  return null;
}

/** `m:ss` süre metni (kart köşesi). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
