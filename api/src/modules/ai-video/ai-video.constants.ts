import { AiVideoStatus } from '@prisma/client';

export const AI_INPUT_PREFIX = 'ai-input';
export const AI_VIDEO_PREFIX = 'ai-video';

export const MB = 1024 * 1024;
export const AI_INPUT_MAX_BYTES = 10 * MB;
export const AI_OUTPUT_MAX_BYTES = 50 * MB;
export const AI_PROMPT_MAX = 1000;
export const AI_DURATION_S = 5;
/** Teklifin gönderime kadar geçerli kalma süresi. */
export const AI_QUOTE_TTL_MS = 30 * 60 * 1000;
/** Yoklayıcı: iş bu süreyi aşarsa AI_VIDEO_TIMEOUT. */
export const AI_JOB_TIMEOUT_MS = 15 * 60 * 1000;
export const AI_POLL_INTERVAL_MS = 5000;
export const AI_DOWNLOAD_ATTEMPTS = 3;
export const AI_RECENT_LIMIT = 10;

export const AI_INPUT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Bizim hata kodlarımız (sözleşme §2.3/§2.4). */
export const AiVideoError = {
  DAILY_CAP: 'AI_VIDEO_DAILY_CAP',
  QUOTE_EXPIRED: 'AI_VIDEO_QUOTE_EXPIRED',
  PROVIDER_ERROR: 'AI_VIDEO_PROVIDER_ERROR',
  CONTENT_REJECTED: 'AI_VIDEO_CONTENT_REJECTED',
  INSUFFICIENT_BALANCE: 'AI_VIDEO_INSUFFICIENT_BALANCE',
  TIMEOUT: 'AI_VIDEO_TIMEOUT',
} as const;

/** Bugünkü harcamaya sayılan durumlar için yardımcı. */
export const ACTIVE_STATUSES: AiVideoStatus[] = [AiVideoStatus.QUEUED, AiVideoStatus.RUNNING];

export const MICRO = 1_000_000;

/** pika.submit için yeniden deneme aralıkları (ms); aynı Idempotency-Key ile en çok 2 ek deneme. */
export const AI_SUBMIT_RETRY_DELAYS_MS = [1000, 3000];
