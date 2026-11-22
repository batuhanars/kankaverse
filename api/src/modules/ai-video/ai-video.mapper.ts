import { AiVideoGeneration, AiVideoStatus } from '@prisma/client';
import { AiVideoReferenceSpec, modelKeyOfApiId } from './ai-video.models';
import { ACTIVE_STATUSES, AiVideoError, aiInputTypesOf, MICRO } from './ai-video.constants';
import type { AiInputKind } from './ai-video.constants';

/** Pika `error.code` → bizim hata kodumuz (istemci i18n'i koda göre). Bilinmeyen her şey PROVIDER_ERROR. */
export function mapPikaErrorCode(code: string | null | undefined): string {
  if (code === 'content_moderation') return AiVideoError.CONTENT_REJECTED;
  if (code === 'insufficient_balance') return AiVideoError.INSUFFICIENT_BALANCE;
  if (code === 'timed_out' || code === 'provider_timeout') return AiVideoError.TIMEOUT;
  return AiVideoError.PROVIDER_ERROR;
}

/** Kullanıcıya Türkçe mesaj (exception için). Ham Pika mesajı ASLA iletilmez. */
export const AI_VIDEO_MESSAGES: Record<string, string> = {
  [AiVideoError.DAILY_CAP]: 'Bugünkü yapay zeka video kredi sınırına ulaşıldı.',
  [AiVideoError.BUDGET_EXCEEDED]: 'Kredin bu video için yetmiyor.',
  [AiVideoError.IN_PROGRESS]: 'Bir üretimin zaten sürüyor. Bitince yenisini başlatabilirsin.',
  [AiVideoError.INVALID_OPTION]: 'Seçilen model, süre, çözünürlük veya ölçü geçerli değil.',
  [AiVideoError.INPUT_TOO_LONG]: 'Video en fazla 15 saniye, sesler en fazla 30 saniye olabilir.',
  [AiVideoError.NOT_READY]: 'Video henüz hazır değil.',
  [AiVideoError.PROVIDER_ERROR]:
    'Video üretim hizmeti şu an yanıt vermiyor. Biraz sonra tekrar dene.',
  [AiVideoError.CONTENT_REJECTED]:
    'Bu istem içerik kurallarına takıldı. İstemi değiştirip tekrar dene.',
  [AiVideoError.INSUFFICIENT_BALANCE]: 'Pika bakiyesi bitti.',
  [AiVideoError.TIMEOUT]: 'Üretim çok uzun sürdü ve iptal edildi.',
  [AiVideoError.DOWNLOAD_FAILED]: 'Video üretildi ama kaydedilemedi.',
  [AiVideoError.BUSY]: 'Üretim sürerken silinemez.',
};

/** `GET /ai-video/options` → model.references: istemci sınırları ve kabul edilen türleri buradan okur (C42 §1.7). */
/** Modelin türe göre kabul ettiği içerik türleri (verilmeyen tür = genel tablo). */
export const referenceInputTypes = (r: AiVideoReferenceSpec, kind: AiInputKind): string[] =>
  r.inputTypes?.[kind] ?? aiInputTypesOf(kind);

export const toReferencesOption = (r: AiVideoReferenceSpec | null) =>
  r && {
    max: r.max,
    videoTotalMaxS: r.videoTotalMaxS,
    videoMaxS: r.videoMaxS,
    audioMaxS: r.audioMaxS,
    audioTotalMaxS: r.audioTotalMaxS,
    minS: r.minS,
    /** null = modelin süreleri geçerli. */
    durations: r.durations ?? null,
    aspectRatios: r.aspectRatios,
    inputTypes: {
      image: referenceInputTypes(r, 'image'),
      video: referenceInputTypes(r, 'video'),
      audio: referenceInputTypes(r, 'audio'),
    },
  };

export const usd = (micro: number): number => micro / MICRO;

/** 1 kredi kaç mikro-USD (varsayılan 10000 = 0,01 $). Tahmin, harcama ve tavan AYNI dönüştürücüden geçer. */
export const DEFAULT_CREDIT_MICRO_USD = 10_000;

/** Mikro-USD → kredi, yukarı yuvarlanır (0 mikro = 0 kredi; en küçük ücret en az 1 kredi görünür). */
export function toCredits(micro: number, creditMicroUsd: number): number {
  return Math.ceil(micro / creditMicroUsd);
}

/** Kredi -> mikro-USD (toCredits'in tersi; admin hak bütçesi bu dönüştürücüden geçer). */
export function fromCredits(credits: number, creditMicroUsd: number): number {
  return credits * creditMicroUsd;
}

/** Kalan bütçe kredisi: aşağı yuvarlanır (kullanıcıya olduğundan fazla kredi vaat etme). */
export function floorCredits(micro: number, creditMicroUsd: number): number {
  return Math.floor(micro / creditMicroUsd);
}

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

/** C42: `references` Json?; dolu dizi = referanslı üretim. */
export const hasReferences = (refs: unknown): boolean => Array.isArray(refs) && refs.length > 0;

export function toAiVideoDto(
  row: AiVideoGeneration,
  creditMicroUsd: number,
  urls?: { videoUrl: string; downloadUrl: string },
) {
  return {
    id: row.id,
    status: row.status,
    model: modelKeyOfApiId(row.model),
    resolution: row.resolution,
    durationS: row.durationS,
    aspectRatio: row.aspectRatio,
    prompt: row.prompt,
    hasInput: row.inputKey !== null || hasReferences(row.references),
    quoteUsd: usd(row.quoteMicroUsd),
    costUsd: row.costMicroUsd === null ? null : usd(row.costMicroUsd),
    quoteCredits: toCredits(row.quoteMicroUsd, creditMicroUsd),
    costCredits: row.costMicroUsd === null ? null : toCredits(row.costMicroUsd, creditMicroUsd),
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
    ...(urls !== undefined && urls),
  };
}
