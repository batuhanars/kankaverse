import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiVideoGeneration, AiVideoStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import {
  AI_DOWNLOAD_ATTEMPTS,
  AI_JOB_TIMEOUT_MS,
  AI_OUTPUT_MAX_BYTES,
  AI_POLL_INTERVAL_MS,
  AI_VIDEO_PREFIX,
  ACTIVE_STATUSES,
  AiVideoError,
} from './ai-video.constants';
import { mapPikaErrorCode } from './ai-video.mapper';
import { PikaClient, PikaJob } from './pika.client';

/** Maliyet henüz kesinleşmemiş tamamlanmış işler için yeniden okuma penceresi / aralığı. */
const BILLING_RECHECK_WINDOW_MS = 60 * 60 * 1000;
const BILLING_UNAVAILABLE_RETRY_MS = 30_000;

/**
 * C14 yoklayıcı: QUEUED/RUNNING satırları Pika'dan 5 sn arayla sorar. Durumun doğruluk kaynağı DB'dir;
 * açılışta yarım kalan satırlar aynı döngüyle kendiliğinden yeniden yoklanır.
 *
 * TEK-INSTANCE VARSAYIMI: çok instance'ta aynı satır iki kez yoklanır (indirme/yazma idempotent ama boşa iş).
 * Çok-instance ya da kullanıcıya açma gelince BullMQ'ya geçilir (sözleşme §0/§6).
 */
@Injectable()
export class AiVideoPoller implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AiVideoPoller.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Bellek içi: satırın ilk görüldüğü an (zaman aşımı) ve indirme deneme sayısı. Yeniden başlatmada sıfırlanır. */
  private readonly firstSeen = new Map<string, number>();
  private readonly downloadFails = new Map<string, number>();
  private readonly billingNextAt = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private pika: PikaClient,
    private config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    // Bayrak kapalıyken döngü hiç başlamaz.
    if (this.config.get<boolean>('aiVideo.enabled') !== true) return;
    this.timer = setInterval(() => void this.tick(), AI_POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Bir tur: örtüşmeyi engelle, her satırı bağımsız işle (biri patlarsa diğerleri sürer). */
  async tick(now: number = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.prisma.aiVideoGeneration.findMany({
        where: {
          providerJobId: { not: null },
          OR: [
            { status: { in: ACTIVE_STATUSES } },
            {
              status: AiVideoStatus.COMPLETED,
              costMicroUsd: null,
              completedAt: { gte: new Date(now - BILLING_RECHECK_WINDOW_MS) },
            },
          ],
        },
      });
      for (const row of rows) {
        await this.processRow(row, now).catch((err: Error) =>
          this.logger.warn(`yoklama hatası: id=${row.id} ${err.message}`),
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async processRow(row: AiVideoGeneration, now: number): Promise<void> {
    if (row.status === AiVideoStatus.COMPLETED) return this.recheckBilling(row, now);

    const seen = this.firstSeen.get(row.id) ?? now;
    this.firstSeen.set(row.id, seen);
    if (now - seen > AI_JOB_TIMEOUT_MS) return this.fail(row.id, AiVideoError.TIMEOUT);

    const job = await this.pika.getJob(row.providerJobId!);
    if (job.status === 'completed') return this.complete(row, job, now);
    if (job.status === 'failed') {
      await this.fail(row.id, mapPikaErrorCode(job.errorCode), this.settledCost(job));
      return;
    }
    const next = job.status === 'running' ? AiVideoStatus.RUNNING : AiVideoStatus.QUEUED;
    if (next !== row.status) {
      await this.prisma.aiVideoGeneration.update({ where: { id: row.id }, data: { status: next } });
    }
  }

  private async complete(row: AiVideoGeneration, job: PikaJob, now: number): Promise<void> {
    if (!job.outputUrl) return this.downloadFailed(row.id);
    const outputKey = `${AI_VIDEO_PREFIX}/${row.userId}/${row.id}.mp4`;
    try {
      const bytes = await this.pika.downloadVideo(job.outputUrl, AI_OUTPUT_MAX_BYTES);
      await this.storage.putPrivate(outputKey, bytes, 'video/mp4');
    } catch (err) {
      this.logger.warn(`çıktı indirilemedi: id=${row.id} ${(err as Error).message}`);
      return this.downloadFailed(row.id);
    }
    const cost = this.settledCost(job);
    await this.prisma.aiVideoGeneration.update({
      where: { id: row.id },
      data: {
        status: AiVideoStatus.COMPLETED,
        outputKey,
        completedAt: new Date(now),
        ...(cost !== null && { costMicroUsd: cost }),
      },
    });
    this.forget(row.id);
  }

  /** Maliyet `pending`/`unavailable` ise tamamlanmış satır sonraki turlarda yeniden okunur. */
  private async recheckBilling(row: AiVideoGeneration, now: number): Promise<void> {
    if (now < (this.billingNextAt.get(row.id) ?? 0)) return;
    const job = await this.pika.getJob(row.providerJobId!);
    const cost = this.settledCost(job);
    if (cost !== null) {
      await this.prisma.aiVideoGeneration.update({
        where: { id: row.id },
        data: { costMicroUsd: cost },
      });
      this.billingNextAt.delete(row.id);
    } else if (job.billing?.state === 'unavailable') {
      this.billingNextAt.set(row.id, now + BILLING_UNAVAILABLE_RETRY_MS);
    }
  }

  private async downloadFailed(id: string): Promise<void> {
    const fails = (this.downloadFails.get(id) ?? 0) + 1;
    this.downloadFails.set(id, fails);
    if (fails >= AI_DOWNLOAD_ATTEMPTS) await this.fail(id, AiVideoError.PROVIDER_ERROR);
  }

  private settledCost(job: PikaJob): number | null {
    return job.billing?.state === 'settled' ? job.billing.chargeMicroUsd : null;
  }

  private async fail(id: string, errorCode: string, cost: number | null = null): Promise<void> {
    await this.prisma.aiVideoGeneration.update({
      where: { id },
      data: {
        status: AiVideoStatus.FAILED,
        errorCode,
        completedAt: new Date(),
        ...(cost !== null && { costMicroUsd: cost }),
      },
    });
    this.forget(id);
  }

  private forget(id: string): void {
    this.firstSeen.delete(id);
    this.downloadFails.delete(id);
  }
}
