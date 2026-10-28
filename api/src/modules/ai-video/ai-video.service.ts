import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AiVideoGeneration, AiVideoStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import {
  AI_DURATION_S,
  AI_INPUT_MAX_BYTES,
  AI_INPUT_PREFIX,
  AI_INPUT_TYPES,
  AI_QUOTE_TTL_MS,
  AI_SUBMIT_RETRY_DELAYS_MS,
  AI_RECENT_LIMIT,
  AiVideoError,
  MICRO,
} from './ai-video.constants';
import {
  AI_VIDEO_MESSAGES,
  mapPikaErrorCode,
  sumSpentMicro,
  toAiVideoDto,
  usd,
} from './ai-video.mapper';
import { PikaClient, PikaError, PikaJob } from './pika.client';

/** Türkiye UTC+3 (DST yok): "bugün" Türkiye gününe göre. */
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const QUOTE_PLACEHOLDER_IMAGE = 'https://example.com/quote-placeholder.png';
const VIDEO_URL_TTL_S = 15 * 60;
const INPUT_EXT_PATTERN = Object.values(AI_INPUT_TYPES).join('|');
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * C14 — yapay zeka video üretimi: teklif → gönderim → durum/liste. Erişim kapısı controller'daki
 * AiVideoAccessGuard'dadır (burada tekrar edilmez). Durumun doğruluk kaynağı DB satırı; ilerlemeyi
 * AiVideoPoller yürütür.
 */
@Injectable()
export class AiVideoService {
  private readonly logger = new Logger(AiVideoService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private config: ConfigService,
    private pika: PikaClient,
  ) {}

  async presignInput(userId: string, contentType: string, size: number) {
    const ext = AI_INPUT_TYPES[contentType];
    if (!ext || size > AI_INPUT_MAX_BYTES) {
      throw new BadRequestException({
        message: 'Yalnızca en çok 10 MB boyutunda PNG, JPEG veya WebP görsel kullanılabilir.',
        error: 'UNSUPPORTED_TYPE',
      });
    }
    const inputKey = `${AI_INPUT_PREFIX}/${userId}/${randomUUID()}.${ext}`;
    const uploadUrl = await this.storage.presignPut(inputKey, contentType);
    return { uploadUrl, inputKey };
  }

  async quote(userId: string, prompt: string, inputKey?: string) {
    if (inputKey === undefined && prompt.length === 0) {
      throw new BadRequestException({
        message: 'İstem boş olamaz.',
        error: 'AI_VIDEO_PROMPT_REQUIRED',
      });
    }
    if (inputKey !== undefined) await this.assertInputKey(userId, inputKey);

    const model = this.apiId(inputKey !== undefined);
    const resolution = this.config.get<string>('aiVideo.resolution')!;
    const quoteMicroUsd = await this.callPika(() =>
      this.pika.quote(model, this.quoteBody(prompt, resolution, inputKey !== undefined)),
    );

    const spent = await this.todaySpentMicro(userId);
    this.assertUnderCap(spent, quoteMicroUsd);

    const row = await this.prisma.aiVideoGeneration.create({
      data: {
        userId,
        model,
        prompt,
        inputKey,
        resolution,
        durationS: AI_DURATION_S,
        quoteMicroUsd,
      },
    });
    return {
      generationId: row.id,
      quoteUsd: usd(quoteMicroUsd),
      todaySpentUsd: usd(spent),
      dailyCapUsd: this.dailyCapMicro() / MICRO,
    };
  }

  async submit(userId: string, id: string) {
    const row = await this.findOwned(userId, id);
    if (row.status !== AiVideoStatus.QUOTED) throw this.alreadySubmitted();
    if (Date.now() - row.createdAt.getTime() > AI_QUOTE_TTL_MS) {
      throw new ConflictException({
        message: AI_VIDEO_MESSAGES[AiVideoError.QUOTE_EXPIRED],
        error: AiVideoError.QUOTE_EXPIRED,
      });
    }
    this.assertUnderCap(await this.todaySpentMicro(userId), row.quoteMicroUsd);

    // Çift gönderimi engelle: QUOTED -> QUEUED atomik talep (Idempotency-Key ikinci emniyet).
    const claimed = await this.prisma.aiVideoGeneration.updateMany({
      where: { id, userId, status: AiVideoStatus.QUOTED },
      data: { status: AiVideoStatus.QUEUED },
    });
    if (claimed.count === 0) throw this.alreadySubmitted();

    let job: PikaJob;
    try {
      // Görsel yükleme ücretsiz ve gönderimden önce: yeniden deneme kapsamı dışında.
      const body = await this.submitBody(row);
      job = await this.submitWithRetry(row, body);
    } catch (err) {
      await this.markFailed(row.id, AiVideoError.PROVIDER_ERROR);
      this.logger.warn(`submit başarısız: id=${row.id} ${(err as Error).message}`);
      throw this.errorFor(AiVideoError.PROVIDER_ERROR);
    }
    return this.afterSubmit(row, job);
  }

  async list(userId: string) {
    const rows = await this.prisma.aiVideoGeneration.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: AI_RECENT_LIMIT,
    });
    return Promise.all(rows.map((r) => this.present(r)));
  }

  async get(userId: string, id: string) {
    return this.present(await this.findOwned(userId, id));
  }

  // ─── iç yardımcılar ──────────────────────────────────────────────────────

  /**
   * Taşıma hatası (fetch reddi/zaman aşımı) ya da 5xx düz hatada Pika isteği almış olabilir: aynı
   * Idempotency-Key ile yeniden dene (Pika aynı işi döner). 4xx düz hata ve iş zarfı yeniden denenmez.
   */
  private async submitWithRetry(
    row: AiVideoGeneration,
    body: Record<string, unknown>,
  ): Promise<PikaJob> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.pika.submit(row.model, body, row.id);
      } catch (err) {
        const retryable = !(err instanceof PikaError) || err.httpStatus >= 500;
        const delay = AI_SUBMIT_RETRY_DELAYS_MS[attempt];
        if (!retryable || delay === undefined) throw err;
        this.logger.warn(`submit yeniden denenecek: id=${row.id} deneme=${attempt + 1}`);
        await this.sleep(delay);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async afterSubmit(row: AiVideoGeneration, job: PikaJob) {
    if (job.status === 'failed') {
      // Pika anında reddetti (bakiye, moderasyon, hız sınırı...): satırı kapat, kodu istemciye ilet.
      const code = mapPikaErrorCode(job.errorCode);
      await this.prisma.aiVideoGeneration.update({
        where: { id: row.id },
        data: { status: AiVideoStatus.FAILED, errorCode: code, providerJobId: job.id },
      });
      throw this.errorFor(code);
    }
    const updated = await this.prisma.aiVideoGeneration.update({
      where: { id: row.id },
      data: { providerJobId: job.id },
    });
    return this.present(updated);
  }

  /** Görselden üretimde: özel bucket'tan oku, Pika yüklemesine koy, dönen adres `image` olur. */
  private async submitBody(row: AiVideoGeneration): Promise<Record<string, unknown>> {
    const body = this.pikaBody(row.prompt, row.resolution);
    if (row.inputKey === null) return body;
    const contentType = this.contentTypeOf(row.inputKey);
    const bytes = await this.storage.getBuffer(row.inputKey, AI_INPUT_MAX_BYTES);
    const upload = await this.pika.createUpload(contentType, bytes.length);
    await this.pika.putUpload(upload, bytes, contentType);
    return { ...body, image: upload.url };
  }

  /** Pika'ya giden TEK gövde şekli (teklif ve gönderim aynı alanları taşır; görsel adresi gönderimde eklenir). */
  private pikaBody(prompt: string, resolution: string): Record<string, unknown> {
    return {
      ...(prompt.length > 0 && { prompt }),
      resolution,
      duration_s: AI_DURATION_S,
    };
  }

  /** Pika teklifi image-to-video'da `image` alanını ŞART koşar; fiyat görsele bağlı değil, yer tutucu adres gider (kullanıcı görseli teklife gitmez). */
  private quoteBody(prompt: string, resolution: string, withImage: boolean) {
    const body = this.pikaBody(prompt, resolution);
    return withImage ? { ...body, image: QUOTE_PLACEHOLDER_IMAGE } : body;
  }

  private apiId(withImage: boolean): string {
    const base = this.config.get<string>('aiVideo.model')!;
    return `${base}/${withImage ? 'image-to-video' : 'text-to-video'}`;
  }

  /** `ai-input/{userId}/{uuid}.{ext}` biçimi + sahiplik öneki + nesne var + boyut (C13 assertStagingKey deseni). */
  private async assertInputKey(userId: string, key: string): Promise<void> {
    const safeUserId = userId.replace(/[^A-Za-z0-9-]/g, '\\$&');
    const re = new RegExp(
      `^${AI_INPUT_PREFIX}/${safeUserId}/${UUID_PATTERN}\\.(${INPUT_EXT_PATTERN})$`,
    );
    if (!re.test(key)) {
      throw new BadRequestException({
        message: 'Geçersiz storage anahtarı.',
        error: 'INVALID_STORAGE_KEY',
      });
    }
    let size: number;
    try {
      size = await this.storage.headSize(key);
    } catch {
      throw new BadRequestException({
        message: 'Görsel bulunamadı. Yeniden yükle.',
        error: 'INVALID_STORAGE_KEY',
      });
    }
    if (size > AI_INPUT_MAX_BYTES) {
      throw new BadRequestException({
        message: 'Görsel en fazla 10 MB olabilir.',
        error: 'FILE_TOO_LARGE',
      });
    }
  }

  private contentTypeOf(key: string): string {
    const ext = key.slice(key.lastIndexOf('.') + 1);
    return Object.entries(AI_INPUT_TYPES).find(([, e]) => e === ext)![0];
  }

  private dailyCapMicro(): number {
    return Math.round((this.config.get<number>('aiVideo.dailyCapUsd') ?? 0) * MICRO);
  }

  private assertUnderCap(spentMicro: number, quoteMicro: number): void {
    if (spentMicro + quoteMicro > this.dailyCapMicro()) {
      throw new BadRequestException({
        message: AI_VIDEO_MESSAGES[AiVideoError.DAILY_CAP],
        error: AiVideoError.DAILY_CAP,
      });
    }
  }

  private async todaySpentMicro(userId: string): Promise<number> {
    const dayStart = new Date(
      Math.floor((Date.now() + TR_OFFSET_MS) / DAY_MS) * DAY_MS - TR_OFFSET_MS,
    );
    const rows = await this.prisma.aiVideoGeneration.findMany({
      where: { userId, createdAt: { gte: dayStart } },
      select: { status: true, costMicroUsd: true, quoteMicroUsd: true },
    });
    return sumSpentMicro(rows);
  }

  private async findOwned(userId: string, id: string): Promise<AiVideoGeneration> {
    const row = await this.prisma.aiVideoGeneration.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Üretim bulunamadı.');
    return row;
  }

  private async present(row: AiVideoGeneration) {
    if (row.status !== AiVideoStatus.COMPLETED || !row.outputKey) return toAiVideoDto(row);
    const url = await this.storage.presignGet(row.outputKey, { expiresIn: VIDEO_URL_TTL_S });
    return toAiVideoDto(row, url);
  }

  private markFailed(id: string, errorCode: string) {
    return this.prisma.aiVideoGeneration.update({
      where: { id },
      data: { status: AiVideoStatus.FAILED, errorCode },
    });
  }

  private alreadySubmitted() {
    return new ConflictException({
      message: 'Bu üretim zaten gönderildi.',
      error: 'AI_VIDEO_ALREADY_SUBMITTED',
    });
  }

  private errorFor(code: string) {
    const body = { message: AI_VIDEO_MESSAGES[code], error: code };
    return code === AiVideoError.CONTENT_REJECTED || code === AiVideoError.INSUFFICIENT_BALANCE
      ? new BadRequestException(body)
      : new BadGatewayException(body);
  }

  /** Pika çağrısı: HTTP/ağ hatasını anahtarsız PROVIDER_ERROR'a çevirir. */
  private async callPika<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Pika çağrısı başarısız: ${(err as Error).message}`);
      throw this.errorFor(AiVideoError.PROVIDER_ERROR);
    }
  }
}
