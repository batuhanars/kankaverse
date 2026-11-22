import { AiVideoStatus } from '@prisma/client';

export const AI_INPUT_PREFIX = 'ai-input';
export const AI_VIDEO_PREFIX = 'ai-video';

export const MB = 1024 * 1024;
export const AI_INPUT_MAX_BYTES = 10 * MB;
export const AI_OUTPUT_MAX_BYTES = 50 * MB;
/** C42: süre denetimi payı (sn); kapsayıcı süresi birkaç yüz ms taşabilir. */
export const AI_INPUT_DURATION_TOLERANCE_S = 0.5;
/** Bir istekteki toplam referans tavanı (DTO); tür başına sınır model tablosunda (en büyüğü Seedance 30+10+10). */
export const AI_REFERENCES_MAX = 50;
/** İstem güvenlik tavanı; istemciler sınır göstermez, yalnız kötüye kullanıma karşı. */
export const AI_PROMPT_MAX = 10000;
/** Teklif (estimate) önbellek ömrü; önbellek tek instance bellek içi (C14b §6). */
export const AI_ESTIMATE_TTL_MS = 10 * 60 * 1000;
/** Yoklayıcı: iş bu süreyi aşarsa AI_VIDEO_TIMEOUT (yavaş kuyruk için geniş; sonradan tamamlanan kurtarılır). */
export const AI_JOB_TIMEOUT_MS = 60 * 60 * 1000;
export const AI_POLL_INTERVAL_MS = 5000;
/** C14c: indirme yeniden deneme aralıkları (dk; sonuncusu tekrarlanır) ve Pika completed sonrası pes etme süresi. */
export const AI_DOWNLOAD_RETRY_DELAYS_MS = [1, 2, 5, 10].map((m) => m * 60_000);
export const AI_DOWNLOAD_GIVEUP_MS = 24 * 60 * 60 * 1000;
export const AI_RECOVERY_INTERVAL_MS = 60 * 60 * 1000;
export const AI_RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const AI_RECENT_LIMIT = 10;

export type AiInputKind = 'image' | 'video' | 'audio';
export const AI_INPUT_KINDS: AiInputKind[] = ['image', 'video', 'audio'];

/** C42 §1.2: girdi türleri (tek tablo). `demuxer` ffprobe'a ZORLANIR (R7: -f), görselde yok, yalnız video/ses süre okur. */
export const AI_INPUT_TYPES: Record<
  string,
  { kind: AiInputKind; ext: string; maxBytes: number; demuxer?: string }
> = {
  'image/png': { kind: 'image', ext: 'png', maxBytes: 10 * MB },
  'image/jpeg': { kind: 'image', ext: 'jpg', maxBytes: 10 * MB },
  'image/webp': { kind: 'image', ext: 'webp', maxBytes: 10 * MB },
  'video/mp4': { kind: 'video', ext: 'mp4', maxBytes: 50 * MB, demuxer: 'mov,mp4,m4a,3gp,3g2,mj2' },
  'video/quicktime': {
    kind: 'video',
    ext: 'mov',
    maxBytes: 50 * MB,
    demuxer: 'mov,mp4,m4a,3gp,3g2,mj2',
  },
  'video/webm': { kind: 'video', ext: 'webm', maxBytes: 50 * MB, demuxer: 'matroska,webm' },
  'audio/mpeg': { kind: 'audio', ext: 'mp3', maxBytes: 10 * MB, demuxer: 'mp3' },
  'audio/mp4': { kind: 'audio', ext: 'm4a', maxBytes: 10 * MB, demuxer: 'mov,mp4,m4a,3gp,3g2,mj2' },
  'audio/aac': { kind: 'audio', ext: 'aac', maxBytes: 10 * MB, demuxer: 'aac' },
  'audio/wav': { kind: 'audio', ext: 'wav', maxBytes: 10 * MB, demuxer: 'wav' },
  'audio/ogg': { kind: 'audio', ext: 'ogg', maxBytes: 10 * MB, demuxer: 'ogg' },
  'audio/webm': { kind: 'audio', ext: 'weba', maxBytes: 10 * MB, demuxer: 'matroska,webm' },
};

/** En büyük girdi boyutu (DTO üst sınırı; tür başına sınır serviste). */
export const AI_INPUT_ANY_MAX_BYTES = Math.max(
  ...Object.values(AI_INPUT_TYPES).map((t) => t.maxBytes),
);

/** Türe göre kabul edilen içerik türleri (`GET /ai-video/options` → references.inputTypes). */
export const aiInputTypesOf = (kind: AiInputKind): string[] =>
  Object.entries(AI_INPUT_TYPES)
    .filter(([, t]) => t.kind === kind)
    .map(([contentType]) => contentType);

/** Anahtar uzantısından içerik türü bilgisi (assertInputKey sonrası uzantı tablodadır). */
export const inputTypeOfKey = (key: string) => {
  const ext = key.slice(key.lastIndexOf('.') + 1);
  return Object.entries(AI_INPUT_TYPES).find(([, t]) => t.ext === ext);
};

/** Bizim hata kodlarımız (sözleşme §2.3/§2.4). */
export const AiVideoError = {
  DAILY_CAP: 'AI_VIDEO_DAILY_CAP',
  BUDGET_EXCEEDED: 'AI_VIDEO_BUDGET_EXCEEDED',
  IN_PROGRESS: 'AI_VIDEO_IN_PROGRESS',
  INVALID_OPTION: 'AI_VIDEO_INVALID_OPTION',
  INPUT_TOO_LONG: 'AI_VIDEO_INPUT_TOO_LONG',
  /** 2026-11-22: modelin en kısa süresinin altında video/ses (Seedance 2 sn). */
  INPUT_TOO_SHORT: 'AI_VIDEO_INPUT_TOO_SHORT',
  /** 2026-11-22: modelin kabul etmediği dosya türü (Seedance sesi yalnız wav/mp3). */
  INPUT_TYPE: 'AI_VIDEO_INPUT_TYPE',
  NOT_READY: 'AI_VIDEO_NOT_READY',
  PROVIDER_ERROR: 'AI_VIDEO_PROVIDER_ERROR',
  CONTENT_REJECTED: 'AI_VIDEO_CONTENT_REJECTED',
  INSUFFICIENT_BALANCE: 'AI_VIDEO_INSUFFICIENT_BALANCE',
  TIMEOUT: 'AI_VIDEO_TIMEOUT',
  DOWNLOAD_PENDING: 'AI_VIDEO_DOWNLOAD_PENDING',
  DOWNLOAD_FAILED: 'AI_VIDEO_DOWNLOAD_FAILED',
  BUSY: 'AI_VIDEO_BUSY',
} as const;

/** Bugünkü harcamaya sayılan durumlar için yardımcı. */
export const ACTIVE_STATUSES: AiVideoStatus[] = [AiVideoStatus.QUEUED, AiVideoStatus.RUNNING];

export const MICRO = 1_000_000;

/** pika.submit için yeniden deneme aralıkları (ms); aynı Idempotency-Key ile en çok 2 ek deneme. */
export const AI_SUBMIT_RETRY_DELAYS_MS = [1000, 3000];
