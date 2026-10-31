import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiVideoGeneration, AiVideoStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import {
  AI_ESTIMATE_TTL_MS,
  AI_SUBMIT_RETRY_DELAYS_MS,
  AI_RECENT_LIMIT,
  ACTIVE_STATUSES,
  AiVideoError,
  inputTypeOfKey,
} from './ai-video.constants';
import {
  AI_VIDEO_MESSAGES,
  mapPikaErrorCode,
  fromCredits,
  toAiVideoDto,
  toReferencesOption,
  toCredits,
  floorCredits,
  DEFAULT_CREDIT_MICRO_USD,
  usd,
} from './ai-video.mapper';
import {
  AI_VIDEO_MODEL_TABLE,
  AiVideoMode,
  AiVideoModelSpec,
  AiVideoReferenceUrls,
  apiIdOf,
  buildPikaBody,
  quotePlaceholderUrls,
} from './ai-video.models';
import { countKinds, translatePromptTags } from './ai-video-prompt-tags';
import { AiVideoReferenceService, parseReferences } from './ai-video-references.service';
import { CreateAiVideoDto, EstimateAiVideoDto } from './dto/ai-video.dto';
import type { AiInputKind } from './ai-video.constants';
import { AiVideoInputService } from './ai-video-input.service';
import { ActiveAiVideoGrant, AiVideoDb, findActiveAiVideoGrant } from './ai-video-grant';
import { PikaClient, PikaError, PikaJob } from './pika.client';

/** Türkiye UTC+3 (DST yok): "bugün" Türkiye gününe göre. */
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
    private references: AiVideoReferenceService,
  ) {}

  /**
   * Açık modeller + seçenekleri + hak özeti (diyalog açılışında).
   * `allowed=false` (kilitli tanıtım): hak/tutar alanları 0/null, DB'ye gidilmez; Pika çağrılmaz.
   */
  async options(userId: string, allowed = true) {
    const credit = this.creditMicro();
    const active = allowed ? await findActiveAiVideoGrant(this.prisma, userId) : null;
    const grant = this.grantView(active, credit);
    // Geri uyum (vc42 ve öncesi "Bugün {spent} / {cap}" satırı + kalan = cap - spent): hak varsa bütçe/kullanılan,
    // yoksa 0 (hak yokken istemci zaten kilitli modda). D84'te kalkacak.
    const legacyCap = grant?.budgetCredits ?? 0;
    const legacySpent = grant?.usedCredits ?? 0;
    return {
      models: this.enabledModels().map((m) => ({
        key: m.key,
        label: m.label,
        durations: m.durations,
        resolutions: m.resolutions,
        aspectRatios: m.aspectRatios,
        supportsImage: true,
        references: toReferencesOption(m.references),
        audio: m.audio,
      })),
      dailyCapUsd: usd(fromCredits(legacyCap, credit)),
      todaySpentUsd: usd(fromCredits(legacySpent, credit)),
      dailyCapCredits: legacyCap,
      spentTodayCredits: legacySpent,
      // C40/C43: etkin hak varsa kullanılan/bütçe/kalan; yoksa (ya da kilitliyse) null. Not asla dönmez.
      grant,
      // C39: yalnız kilitli (allowed=false) iken; erişimli kullanıcıya gereksiz
      accessInviteCode: allowed
        ? null
        : (this.config.get<string | null>('aiVideo.accessInviteCode') ?? null),
    };
  }

  /** C43: kullanıcıya dönen hak özeti. Kullanılan yukarı, kalan/bütçe aşağı yuvarlanır. */
  private grantView(active: ActiveAiVideoGrant | null, credit: number) {
    if (!active) return null;
    const budgetCredits = floorCredits(active.grant.budgetMicroUsd, credit);
    return {
      usedCredits: Math.min(budgetCredits, toCredits(active.spentMicro, credit)),
      budgetCredits,
      remainingCredits: floorCredits(active.remainingMicro, credit),
      expiresAt: active.grant.expiresAt?.toISOString() ?? null,
    };
  }

  /**
   * C40/C43 bütçe kapısı (R7): etkin hak yoksa ya da tahmin kalan bütçeyi aşarsa 403. İstisna yok.
   */
  private async assertUnderBudget(
    db: AiVideoDb,
    userId: string,
    quoteMicro: number,
  ): Promise<void> {
    const active = await findActiveAiVideoGrant(db, userId);
    if (!active || quoteMicro > active.remainingMicro) {
      throw new ForbiddenException({
        message: AI_VIDEO_MESSAGES[AiVideoError.BUDGET_EXCEEDED],
        error: AiVideoError.BUDGET_EXCEEDED,
      });
    }
  }

  /** Satır oluşturmaz; 10 dk bellek önbelleği. İstem fiyata etki etmez (yer tutucu gider). */
  async estimate(dto: EstimateAiVideoDto) {
    const kinds = dto.referenceKinds;
    const mode: AiVideoMode = kinds ? 'reference' : dto.withImage ? 'image' : 'text';
    const spec = this.resolveSpec(dto, mode);
    if (kinds) this.assertReferenceCounts(spec, kinds);
    // C42: referans kipinde fiyat yalnız "video var mı"ya bağlı (§0), anahtar buna göre.
    const shape = kinds ? `ref${kinds.includes('video')}` : dto.withImage;
    const cacheKey = `${spec.key}|${dto.resolution}|${dto.durationS}|${shape}|${dto.aspectRatio ?? ''}`;
    const hit = this.estimateCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return this.estimateBody(hit.micro);

    const micro = await this.quoteMicro(spec, dto, {
      mode,
      prompt: mode === 'image' ? undefined : 'x',
      referenceKinds: kinds,
    });
    this.estimateCache.set(cacheKey, { micro, expiresAt: Date.now() + AI_ESTIMATE_TTL_MS });
    return this.estimateBody(micro);
  }

  private estimateBody(micro: number) {
    return { quoteUsd: usd(micro), estimateCredits: toCredits(micro, this.creditMicro()) };
  }

  /** Teklif (yeniden alınır, önbellekten değil) + bütçe kapısı + gönderim tek çağrıda. */
  async create(userId: string, dto: CreateAiVideoDto) {
    const refs = dto.references;
    if (refs !== undefined && dto.inputKey !== undefined) throw this.invalidOption();
    const mode: AiVideoMode = refs ? 'reference' : dto.inputKey !== undefined ? 'image' : 'text';
    const spec = this.resolveSpec(dto, mode);
    if (dto.inputKey === undefined && dto.prompt.length === 0) {
      throw new BadRequestException({
        message: 'İstem boş olamaz.',
        error: 'AI_VIDEO_PROMPT_REQUIRED',
      });
    }
    // C42 §1.4: var olmayan referansa etiket, dosya indirmeden (ffprobe) önce reddedilir.
    const kinds: AiInputKind[] = refs?.map((r) => r.kind) ?? (dto.inputKey ? ['image'] : []);
    const prompt = translatePromptTags(dto.prompt, mode, countKinds(kinds));
    if (dto.inputKey !== undefined) {
      await this.input.assertInputKey(userId, dto.inputKey);
      // Görselden video yolu yalnız görsel kabul eder (video/ses anahtarı ilk kare olamaz).
      if (inputTypeOfKey(dto.inputKey)?.[1].kind !== 'image') throw this.invalidOption();
    }
    if (refs) await this.references.validate(userId, spec.references!, refs);

    const quoteMicroUsd = await this.quoteMicro(spec, dto, {
      mode,
      prompt,
      referenceKinds: refs && kinds,
    });
    const row = await this.reserveRow(userId, quoteMicroUsd, {
      userId,
      model: apiIdOf(spec, mode),
      prompt: dto.prompt,
      inputKey: dto.inputKey,
      references: refs?.map(({ kind, key }) => ({ kind, key })),
      resolution: dto.resolution,
      durationS: dto.durationS,
      aspectRatio: dto.aspectRatio,
      quoteMicroUsd,
      status: AiVideoStatus.QUEUED,
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

  /**
   * C43 (R7): kullanıcıya özgü advisory kilit altında tek transaction: aktif (QUEUED/RUNNING) üretim varsa 409,
   * yoksa bütçe kapısı (aynı transaction), sonra QUEUED satırı yazılır. Eşzamanlı ikinci istek kilitte bekler,
   * ilk satırı görüp reddedilir (bütçe yarışı da kapanır). Pika gönderimi transaction DIŞINDA (kilit ağ çağrısı tutmaz).
   */
  private async reserveRow(
    userId: string,
    quoteMicro: number,
    data: Prisma.AiVideoGenerationUncheckedCreateInput,
  ): Promise<AiVideoGeneration> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ai-video:' || ${userId}))`;
      const active = await tx.aiVideoGeneration.findFirst({
        where: { userId, status: { in: ACTIVE_STATUSES } },
        select: { id: true },
      });
      if (active) {
        throw new ConflictException({
          message: AI_VIDEO_MESSAGES[AiVideoError.IN_PROGRESS],
          error: AiVideoError.IN_PROGRESS,
        });
      }
      await this.assertUnderBudget(tx, userId, quoteMicro);
      return tx.aiVideoGeneration.create({ data });
    });
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

  /**
   * Girdili üretimde: özel bucket'tan oku, Pika yüklemesine koy, dönen adres modelin ilgili alanı olur.
   * İstemdeki @etiketler burada çevrilir (satırda ham istem durur; yeniden deneme aynı sonucu üretir).
   */
  private async submitBody(
    row: AiVideoGeneration,
    spec: AiVideoModelSpec,
  ): Promise<Record<string, unknown>> {
    const refs = parseReferences(row.references);
    const mode: AiVideoMode = refs.length > 0 ? 'reference' : row.inputKey ? 'image' : 'text';
    const kinds: AiInputKind[] =
      refs.length > 0 ? refs.map((r) => r.kind) : row.inputKey ? ['image'] : [];
    const opts = {
      prompt: translatePromptTags(row.prompt, mode, countKinds(kinds)),
      resolution: row.resolution,
      durationS: row.durationS,
      aspectRatio: row.aspectRatio ?? undefined,
    };
    if (mode === 'reference') {
      const referenceUrls: AiVideoReferenceUrls = { image: [], video: [], audio: [] };
      for (const ref of refs) referenceUrls[ref.kind].push(await this.input.uploadToPika(ref.key));
      return buildPikaBody(spec, { ...opts, referenceUrls });
    }
    if (row.inputKey === null) return buildPikaBody(spec, opts);
    return buildPikaBody(spec, { ...opts, image: await this.input.uploadToPika(row.inputKey) });
  }

  /**
   * Pika teklifi görsel/referans alanlarını ŞART koşar; fiyat dosyaya bağlı değil (referansta yalnız "video var mı"),
   * yer tutucu adres gider (kullanıcı dosyası teklife gitmez).
   */
  private quoteMicro(
    spec: AiVideoModelSpec,
    o: { resolution: string; durationS: number; aspectRatio?: string },
    q: { mode: AiVideoMode; prompt?: string; referenceKinds?: AiInputKind[] },
  ): Promise<number> {
    const body = buildPikaBody(spec, {
      prompt: q.prompt,
      resolution: o.resolution,
      durationS: o.durationS,
      aspectRatio: o.aspectRatio,
      image: q.mode === 'image' ? QUOTE_PLACEHOLDER_IMAGE : undefined,
      referenceUrls:
        q.mode === 'reference' ? quotePlaceholderUrls(q.referenceKinds ?? []) : undefined,
    });
    return this.callPika(() => this.pika.quote(apiIdOf(spec, q.mode), body));
  }

  private enabledModels(): AiVideoModelSpec[] {
    const keys = this.config.get<string[]>('aiVideo.models') ?? [];
    return AI_VIDEO_MODEL_TABLE.filter((m) => keys.includes(m.key));
  }

  /** Açık model + tabloda olan süre/çözünürlük/ölçü; aksi 400 AI_VIDEO_INVALID_OPTION. */
  private resolveSpec(
    o: { model: string; resolution: string; durationS: number; aspectRatio?: string },
    mode: AiVideoMode,
  ): AiVideoModelSpec {
    const spec = this.enabledModels().find((m) => m.key === o.model);
    const ratios = mode === 'reference' ? spec?.references?.aspectRatios : spec?.aspectRatios[mode];
    const ratioOk = o.aspectRatio === undefined || ratios?.includes(o.aspectRatio) === true;
    if (
      !spec ||
      !spec.resolutions.includes(o.resolution) ||
      !spec.durations.includes(o.durationS) ||
      (mode === 'reference' && !spec.references) ||
      !ratioOk
    ) {
      throw this.invalidOption();
    }
    return spec;
  }

  /** Teklif için tür sayıları: en az 1, tür başına tavan aşılmaz (dosya yok, süre denetimi create'te). */
  private assertReferenceCounts(spec: AiVideoModelSpec, kinds: AiInputKind[]): void {
    const c = countKinds(kinds);
    const max = spec.references!.max;
    if (kinds.length === 0 || c.image > max.image || c.video > max.video || c.audio > max.audio) {
      throw this.invalidOption();
    }
  }

  private invalidOption() {
    return new BadRequestException({
      message: AI_VIDEO_MESSAGES[AiVideoError.INVALID_OPTION],
      error: AiVideoError.INVALID_OPTION,
    });
  }

  private creditMicro(): number {
    return this.config.get<number>('aiVideo.creditMicroUsd') ?? DEFAULT_CREDIT_MICRO_USD;
  }

  private async findOwned(userId: string, id: string): Promise<AiVideoGeneration> {
    const row = await this.prisma.aiVideoGeneration.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Üretim bulunamadı.');
    return row;
  }

  private async present(row: AiVideoGeneration) {
    if (row.status !== AiVideoStatus.COMPLETED || !row.outputKey)
      return toAiVideoDto(row, this.creditMicro());
    const [videoUrl, downloadUrl] = await Promise.all([
      this.storage.presignGet(row.outputKey, { expiresIn: VIDEO_URL_TTL_S }),
      this.storage.presignGet(row.outputKey, {
        expiresIn: VIDEO_URL_TTL_S,
        downloadFilename: `kankaverse-yz-${row.id}.mp4`,
      }),
    ]);
    return toAiVideoDto(row, this.creditMicro(), { videoUrl, downloadUrl });
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
