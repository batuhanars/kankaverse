import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiVideoGeneration, AiVideoStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import {
  AI_ESTIMATE_TTL_MS,
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
import { AI_VIDEO_MODEL_TABLE, AiVideoModelSpec, apiIdOf, buildPikaBody } from './ai-video.models';
import { CreateAiVideoDto, EstimateAiVideoDto } from './dto/ai-video.dto';
import { AiVideoInputService } from './ai-video-input.service';
import { PikaClient, PikaError, PikaJob } from './pika.client';

/** Türkiye UTC+3 (DST yok): "bugün" Türkiye gününe göre. */
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const QUOTE_PLACEHOLDER_IMAGE = 'https://example.com/quote-placeholder.png';
const VIDEO_URL_TTL_S = 15 * 60;

/**
 * C14/C14b — yapay zeka video üretimi: seçenekler, teklif (estimate), tek çağrıda teklif+tavan+gönderim, durum/liste. Erişim kapısı controller'daki
 * AiVideoAccessGuard'dadır (burada tekrar edilmez). Durumun doğruluk kaynağı DB satırı; ilerlemeyi
 * AiVideoPoller yürütür.
 */
@Injectable()
export class AiVideoService {
  private readonly logger = new Logger(AiVideoService.name);
  private readonly estimateCache = new Map<string, { micro: number; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private config: ConfigService,
    private pika: PikaClient,
    private input: AiVideoInputService,
  ) {}

  /** Açık modeller + seçenekleri + bugünkü harcama (diyalog açılışında). */
  async options(userId: string) {
    return {
      models: this.enabledModels().map((m) => ({
        key: m.key,
        label: m.label,
        durations: m.durations,
        resolutions: m.resolutions,
        supportsImage: true,
        audio: m.audio,
      })),
      dailyCapUsd: this.dailyCapMicro() / MICRO,
      todaySpentUsd: usd(await this.todaySpentMicro(userId)),
    };
  }

  /** Satır oluşturmaz; 10 dk bellek önbelleği. İstem fiyata etki etmez (yer tutucu gider). */
  async estimate(dto: EstimateAiVideoDto) {
    const spec = this.resolveSpec(dto.model, dto.resolution, dto.durationS);
    const cacheKey = `${spec.key}|${dto.resolution}|${dto.durationS}|${dto.withImage}`;
    const hit = this.estimateCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return { quoteUsd: usd(hit.micro) };

    const micro = await this.quoteMicro(spec, dto, dto.withImage, dto.withImage ? undefined : 'x');
    this.estimateCache.set(cacheKey, { micro, expiresAt: Date.now() + AI_ESTIMATE_TTL_MS });
    return { quoteUsd: usd(micro) };
  }

  /** Teklif (yeniden alınır, önbellekten değil) + tavan + gönderim tek çağrıda. */
  async create(userId: string, dto: CreateAiVideoDto) {
    const spec = this.resolveSpec(dto.model, dto.resolution, dto.durationS);
    if (dto.inputKey === undefined && dto.prompt.length === 0) {
      throw new BadRequestException({
        message: 'İstem boş olamaz.',
        error: 'AI_VIDEO_PROMPT_REQUIRED',
      });
    }
    const withImage = dto.inputKey !== undefined;
    if (dto.inputKey !== undefined) await this.input.assertInputKey(userId, dto.inputKey);

    const quoteMicroUsd = await this.quoteMicro(spec, dto, withImage, dto.prompt);
    this.assertUnderCap(await this.todaySpentMicro(userId), quoteMicroUsd);

    const row = await this.prisma.aiVideoGeneration.create({
      data: {
        userId,
        model: apiIdOf(spec, withImage),
        prompt: dto.prompt,
        inputKey: dto.inputKey,
        resolution: dto.resolution,
        durationS: dto.durationS,
        quoteMicroUsd,
        status: AiVideoStatus.QUEUED,
      },
    });

    let job: PikaJob;
    try {
      // Görsel yükleme ücretsiz ve gönderimden önce: yeniden deneme kapsamı dışında.
      const body = await this.submitBody(row, spec);
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
      where: { userId, deletedAt: null },
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

  /** Görselden üretimde: özel bucket'tan oku, Pika yüklemesine koy, dönen adres modelin görsel alanı olur. */
  private async submitBody(
    row: AiVideoGeneration,
    spec: AiVideoModelSpec,
  ): Promise<Record<string, unknown>> {
    const opts = { prompt: row.prompt, resolution: row.resolution, durationS: row.durationS };
    if (row.inputKey === null) return buildPikaBody(spec, opts);
    return buildPikaBody(spec, { ...opts, image: await this.input.uploadToPika(row.inputKey) });
  }

  /**
   * Pika teklifi image-to-video'da görsel alanını ŞART koşar; fiyat görsele bağlı değil, yer tutucu adres
   * gider (kullanıcı görseli teklife gitmez).
   */
  private quoteMicro(
    spec: AiVideoModelSpec,
    o: { resolution: string; durationS: number },
    withImage: boolean,
    prompt?: string,
  ): Promise<number> {
    const body = buildPikaBody(spec, {
      prompt,
      resolution: o.resolution,
      durationS: o.durationS,
      image: withImage ? QUOTE_PLACEHOLDER_IMAGE : undefined,
    });
    return this.callPika(() => this.pika.quote(apiIdOf(spec, withImage), body));
  }

  private enabledModels(): AiVideoModelSpec[] {
    const keys = this.config.get<string[]>('aiVideo.models') ?? [];
    return AI_VIDEO_MODEL_TABLE.filter((m) => keys.includes(m.key));
  }

  /** Açık model + tabloda olan süre/çözünürlük; aksi 400 AI_VIDEO_INVALID_OPTION. */
  private resolveSpec(model: string, resolution: string, durationS: number): AiVideoModelSpec {
    const spec = this.enabledModels().find((m) => m.key === model);
    if (!spec || !spec.resolutions.includes(resolution) || !spec.durations.includes(durationS)) {
      throw new BadRequestException({
        message: AI_VIDEO_MESSAGES[AiVideoError.INVALID_OPTION],
        error: AiVideoError.INVALID_OPTION,
      });
    }
    return spec;
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
    const row = await this.prisma.aiVideoGeneration.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Üretim bulunamadı.');
    return row;
  }

  private async present(row: AiVideoGeneration) {
    if (row.status !== AiVideoStatus.COMPLETED || !row.outputKey) return toAiVideoDto(row);
    const [videoUrl, downloadUrl] = await Promise.all([
      this.storage.presignGet(row.outputKey, { expiresIn: VIDEO_URL_TTL_S }),
      this.storage.presignGet(row.outputKey, {
        expiresIn: VIDEO_URL_TTL_S,
        downloadFilename: `kankaverse-yz-${row.id}.mp4`,
      }),
    ]);
    return toAiVideoDto(row, { videoUrl, downloadUrl });
  }

  private markFailed(id: string, errorCode: string) {
    return this.prisma.aiVideoGeneration.update({
      where: { id },
      data: { status: AiVideoStatus.FAILED, errorCode },
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
