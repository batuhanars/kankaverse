import { t } from '@/i18n';
import { extractErrorCode, extractErrorMessage } from '@/api/errors';

const KNOWN_ERRORS = [
  'AI_VIDEO_DAILY_CAP',
  'AI_VIDEO_BUDGET_EXCEEDED',
  'AI_VIDEO_IN_PROGRESS',
  'AI_VIDEO_INVALID_OPTION',
  'AI_VIDEO_NOT_READY',
  'UPLOADS_DISABLED',
  'AI_VIDEO_PROVIDER_ERROR',
  'AI_VIDEO_CONTENT_REJECTED',
  'AI_VIDEO_INSUFFICIENT_BALANCE',
  'AI_VIDEO_TIMEOUT',
  'AI_VIDEO_DOWNLOAD_FAILED',
  'AI_VIDEO_BUSY',
];

/** C42: referans kipinin hata kodları; metinler mobil ad alanında. */
const REFERENCE_ERRORS = ['AI_VIDEO_INPUT_TOO_LONG', 'AI_VIDEO_PROMPT_REQUIRED'];

const isKnown = (code: string | null | undefined): code is string =>
  !!code && (KNOWN_ERRORS.includes(code) || REFERENCE_ERRORS.includes(code));

/** İç işaret: RUNNING satırda video kaydediliyor (web ile aynı). */
export const DOWNLOAD_PENDING = 'AI_VIDEO_DOWNLOAD_PENDING';

/** Hata koduna göre Türkçe metin; bilinmeyen kodda verilen yedek ya da genel metin. */
export function aiVideoErrorText(code: string | null | undefined, fallback?: string): string {
  if (code && REFERENCE_ERRORS.includes(code)) return t(`mobile.aiVideoRefs.errors.${code}`);
  if (code && KNOWN_ERRORS.includes(code)) return t(`aiVideo.errors.${code}`);
  return fallback || t('aiVideo.errors.generic');
}

/** İstek hatasından kullanıcı metni: önce hata kodu, sonra sunucunun Türkçe mesajı. */
export function aiVideoFailText(e: unknown): string {
  const code = extractErrorCode(e);
  return aiVideoErrorText(code, isKnown(code) ? undefined : extractErrorMessage(e));
}
