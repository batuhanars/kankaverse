import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiVideoGeneration, AiVideoStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../../shared/storage/storage.service';
import {
  AI_DOWNLOAD_GIVEUP_MS,
  AI_DOWNLOAD_RETRY_DELAYS_MS,
  AI_JOB_TIMEOUT_MS,
  AI_OUTPUT_MAX_BYTES,
  AI_POLL_INTERVAL_MS,
  AI_VIDEO_PREFIX,
  ACTIVE_STATUSES,
  AiVideoError,
} from './ai-video.constants';
import { mapPikaErrorCode } from './ai-video.mapper';
import { AiVideoRecoveryService } from './ai-video-recovery.service';
import { PikaClient, PikaJob } from './pika.client';

const PREVIEW_MAX = 120;

/** İstem → bildirim önizlemesi: boşluklar sadeleşir, 120 karakteri aşarsa `…` ile kesilir; boşsa null. */
export function promptPreview(prompt: string): string | null {
  const text = prompt.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;
}

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
  /**
   * Bellek içi: indirme deneme sayısı + son deneme anı (yalnız yeniden deneme aralığı için). Yeniden
   * başlatmada sıfırlanır → hemen yeniden dener, zararsız. İş zaman aşımı ve 24 sa sayacı DB'den
   * (createdAt / providerCompletedAt) türer, yeniden başlatmaya dayanıklıdır.
   */
  private readonly downloadFails = new Map<string, number>();
  private readonly downloadLastTry = new Map<string, number>();
  /** C14e: arka planda indirilen satır kimlikleri (tur bu satırları atlar) ve bekleme için işler. */
  private readonly inFlight = new Set<string>();
  private readonly tasks = new Set<Promise<void>>();
  private readonly billingNextAt = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private pika: PikaClient,
    private config: ConfigService,
    private recovery: AiVideoRecoveryService,
    private notifications: NotificationsService,
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
      await this.recovery.maybeRecover(now);
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

    if (this.inFlight.has(row.id)) return;
    const downloading = row.providerCompletedAt !== null;
    if (downloading) {
      if (now - row.providerCompletedAt!.getTime() > AI_DOWNLOAD_GIVEUP_MS) {
        return this.fail(row, AiVideoError.DOWNLOAD_FAILED);
      }
      if (!this.retryDue(row.id, now)) return;
    } else if (now - row.createdAt.getTime() > AI_JOB_TIMEOUT_MS) {
      // İş zaman aşımı yalnız Pika queued/running iken işler; indirme aşamasında işlemez.
      return this.fail(row, AiVideoError.TIMEOUT);
    }

    const job = await this.pika.getJob(row.providerJobId!);
    if (job.status === 'completed') return this.complete(row, job, now);
    if (job.status === 'failed') {
      await this.fail(row, mapPikaErrorCode(job.errorCode), this.settledCost(job));
      return;
    }
    const next = job.status === 'running' ? AiVideoStatus.RUNNING : AiVideoStatus.QUEUED;
    if (next !== row.status) {
      await this.prisma.aiVideoGeneration.update({ where: { id: row.id }, data: { status: next } });
    }
  }

  /**
   * C14e: indirme turu bloklamaz; arka planda koşar, `inFlight` aynı satır için ikinci indirmeyi engeller.
   * Maliyet indirmeden bağımsız yazılır; indirme başarısızsa satır RUNNING + DOWNLOAD_PENDING kalır.
   */
  private complete(row: AiVideoGeneration, job: PikaJob, now: number): void {
    const task = this.downloadAndStore(row, job, now)
      .catch((err: Error) => this.logger.warn(`indirme işi hatası: id=${row.id} ${err.message}`))
      .finally(() => {
        this.inFlight.delete(row.id);
        this.tasks.delete(task);
      });
    this.inFlight.add(row.id);
    this.tasks.add(task);
  }

  /** Arka plan işleri bitene dek bekler (yalnız test/kapatma yardımcısı). */
  async whenIdle(): Promise<void> {
    while (this.tasks.size > 0) await Promise.all([...this.tasks]);
  }

  private async downloadAndStore(row: AiVideoGeneration, job: PikaJob, now: number): Promise<void> {
    const cost = this.settledCost(job);
    const costData = cost !== null ? { costMicroUsd: cost } : {};
    const outputKey = `${AI_VIDEO_PREFIX}/${row.userId}/${row.id}.mp4`;
    try {
      if (!job.outputUrl) throw new Error('çıktı adresi yok');
      const bytes = await this.pika.downloadVideo(
        job.outputUrl,
        AI_OUTPUT_MAX_BYTES,
        undefined,
        undefined,
        row.id,
      );
      if (await this.isGone(row.id)) return this.forget(row.id);
      await this.storage.putPrivate(outputKey, bytes, 'video/mp4');
    } catch (err) {
      this.logger.warn(`çıktı indirilemedi: id=${row.id} ${(err as Error).message}`);
      this.downloadFails.set(row.id, (this.downloadFails.get(row.id) ?? 0) + 1);
      this.downloadLastTry.set(row.id, now);
      await this.prisma.aiVideoGeneration.update({
        where: { id: row.id },
        data: {
          status: AiVideoStatus.RUNNING,
          errorCode: AiVideoError.DOWNLOAD_PENDING,
          providerCompletedAt: row.providerCompletedAt ?? new Date(now),
          ...costData,
        },
      });
      return;
    }
    // C49: yalnız satır hâlâ QUEUED/RUNNING ise geçiş bizim; bildirim tam bir kez bu geçişe bağlı.
    const moved = await this.prisma.aiVideoGeneration.updateMany({
      where: { id: row.id, status: { in: ACTIVE_STATUSES } },
      data: {
        status: AiVideoStatus.COMPLETED,
        outputKey,
        errorCode: null,
        completedAt: new Date(now),
        providerCompletedAt: row.providerCompletedAt ?? new Date(now),
        ...costData,
      },
    });
    if (moved.count > 0) await this.notifyDone(row, NotificationType.AI_VIDEO_READY);
    this.forget(row.id);
  }

  /** İndirme sürerken satır silindi mi (deletedAt dolu ya da satır yok)? */
  private async isGone(id: string): Promise<boolean> {
    const cur = await this.prisma.aiVideoGeneration.findUnique({
      where: { id },
      select: { deletedAt: true },
    });
    return cur === null || cur.deletedAt !== null;
  }

  /** Artan aralık (1, 2, 5, 10 dk ...): son deneme bellek içi; kayıt yoksa (yeniden başlatma) hemen. */
  private retryDue(id: string, now: number): boolean {
    const last = this.downloadLastTry.get(id);
    if (last === undefined) return true;
    const delays = AI_DOWNLOAD_RETRY_DELAYS_MS;
    const idx = Math.min((this.downloadFails.get(id) ?? 1) - 1, delays.length - 1);
    return now - last >= delays[idx];
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

  private settledCost(job: PikaJob): number | null {
    return job.billing?.state === 'settled' ? job.billing.chargeMicroUsd : null;
  }

  private async fail(
    row: AiVideoGeneration,
    errorCode: string,
    cost: number | null = null,
  ): Promise<void> {
    const moved = await this.prisma.aiVideoGeneration.updateMany({
      where: { id: row.id, status: { in: ACTIVE_STATUSES } },
      data: {
        status: AiVideoStatus.FAILED,
        errorCode,
        completedAt: new Date(),
        ...(cost !== null && { costMicroUsd: cost }),
      },
    });
    if (moved.count > 0) await this.notifyDone(row, NotificationType.AI_VIDEO_FAILED);
    this.forget(row.id);
  }

  /**
   * C49: arka plan geçişinde kullanıcıya çan + soket + push. Silinmiş satır sessiz kalır; bildirim hatası
   * poller'ı ASLA bozmaz (yutulur, loglanır).
   */
  private async notifyDone(
    row: AiVideoGeneration,
    type: 'AI_VIDEO_READY' | 'AI_VIDEO_FAILED',
  ): Promise<void> {
    try {
      if (row.deletedAt || (await this.isGone(row.id))) return;
      const preview = promptPreview(row.prompt);
      await this.notifications.create(row.userId, {
        type,
        aiVideoId: row.id,
        ...(preview !== null && { preview }),
      });
    } catch (err) {
      this.logger.warn(`bildirim üretilemedi: id=${row.id} ${(err as Error).message}`);
    }
  }

  private forget(id: string): void {
    this.downloadFails.delete(id);
    this.downloadLastTry.delete(id);
    this.pika.discardPartial(id);
  }
}
