import { AiVideoGeneration, AiVideoStatus } from '@prisma/client';
import { ACTIVE_STATUSES, AiVideoError, MICRO } from './ai-video.constants';

/** Pika `error.code` → bizim hata kodumuz (istemci i18n'i koda göre). Bilinmeyen her şey PROVIDER_ERROR. */
export function mapPikaErrorCode(code: string | null | undefined): string {
  if (code === 'content_moderation') return AiVideoError.CONTENT_REJECTED;
  if (code === 'insufficient_balance') return AiVideoError.INSUFFICIENT_BALANCE;
  if (code === 'timed_out' || code === 'provider_timeout') return AiVideoError.TIMEOUT;
  return AiVideoError.PROVIDER_ERROR;
}

/** Kullanıcıya Türkçe mesaj (exception için). Ham Pika mesajı ASLA iletilmez. */
export const AI_VIDEO_MESSAGES: Record<string, string> = {
  [AiVideoError.DAILY_CAP]: 'Bugünkü yapay zeka video harcama tavanına ulaşıldı.',
  [AiVideoError.QUOTE_EXPIRED]: 'Fiyat teklifinin süresi doldu. Yeniden fiyat al.',
  [AiVideoError.PROVIDER_ERROR]:
    'Video üretim hizmeti şu an yanıt vermiyor. Biraz sonra tekrar dene.',
  [AiVideoError.CONTENT_REJECTED]:
    'Bu istem içerik kurallarına takıldı. İstemi değiştirip tekrar dene.',
  [AiVideoError.INSUFFICIENT_BALANCE]: 'Pika bakiyesi bitti.',
  [AiVideoError.TIMEOUT]: 'Üretim çok uzun sürdü ve iptal edildi.',
};

export const usd = (micro: number): number => micro / MICRO;

/** Bugünkü harcama (mikro-USD): kesin ücret varsa o, yoksa bekleyen/tamamlanmış için teklif; FAILED ücretsizdir. */
export function sumSpentMicro(
  rows: Pick<AiVideoGeneration, 'status' | 'costMicroUsd' | 'quoteMicroUsd'>[],
): number {
  let total = 0;
  for (const r of rows) {
    if (r.status === AiVideoStatus.QUOTED) continue;
    if (r.costMicroUsd !== null) total += r.costMicroUsd;
    else if (ACTIVE_STATUSES.includes(r.status) || r.status === AiVideoStatus.COMPLETED) {
      total += r.quoteMicroUsd;
    }
  }
  return total;
}

export function toAiVideoDto(row: AiVideoGeneration, videoUrl?: string) {
  return {
    id: row.id,
    status: row.status,
    prompt: row.prompt,
    hasInput: row.inputKey !== null,
    quoteUsd: usd(row.quoteMicroUsd),
    costUsd: row.costMicroUsd === null ? null : usd(row.costMicroUsd),
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
    ...(videoUrl !== undefined && { videoUrl }),
  };
}
