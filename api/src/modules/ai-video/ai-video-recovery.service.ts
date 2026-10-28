import { Injectable, Logger } from '@nestjs/common';
import { AiVideoStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_RECOVERY_INTERVAL_MS, AI_RECOVERY_WINDOW_MS, AiVideoError } from './ai-video.constants';
import { PikaClient } from './pika.client';

/**
 * C14c §1.1 kurtarma: yavaş CDN (PROVIDER_ERROR) ya da yavaş kuyruk (TIMEOUT) yüzünden kapanmış ama Pika'da `completed`
 * olan (ücreti ödenmiş) son 7 günün satırlarını indirme döngüsüne geri alır. İlk yoklama turunda ve saatte bir (yoklayıcı yalnız bayrak açıkken çalışır).
 * Tekrar çalıştırmak güvenli: kurtarılan satır artık FAILED değildir.
 */
@Injectable()
export class AiVideoRecoveryService {
  private readonly logger = new Logger(AiVideoRecoveryService.name);

  constructor(
    private prisma: PrismaService,
    private pika: PikaClient,
  ) {}

  private lastRunAt = -Infinity;

  /** Yoklayıcı her turda çağırır; ilk turda (açılış) ve sonra saatte bir çalışır. Son çalışma bellek içi. */
  async maybeRecover(now: number = Date.now()): Promise<void> {
    if (now - this.lastRunAt < AI_RECOVERY_INTERVAL_MS) return;
    this.lastRunAt = now;
    await this.recover(now).catch((err: Error) =>
      this.logger.warn(`kurtarma başarısız: ${err.message}`),
    );
  }

  async recover(now: number = Date.now()): Promise<number> {
    const rows = await this.prisma.aiVideoGeneration.findMany({
      where: {
        status: AiVideoStatus.FAILED,
        errorCode: { in: [AiVideoError.PROVIDER_ERROR, AiVideoError.TIMEOUT] },
        providerJobId: { not: null },
        outputKey: null,
        deletedAt: null,
        createdAt: { gte: new Date(now - AI_RECOVERY_WINDOW_MS) },
      },
    });
    let recovered = 0;
    for (const row of rows) {
      try {
        const job = await this.pika.getJob(row.providerJobId!);
        if (job.status !== 'completed') continue;
        const cost = job.billing?.state === 'settled' ? job.billing.chargeMicroUsd : null;
        await this.prisma.aiVideoGeneration.update({
          where: { id: row.id },
          data: {
            status: AiVideoStatus.RUNNING,
            errorCode: AiVideoError.DOWNLOAD_PENDING,
            completedAt: null,
            providerCompletedAt: new Date(now),
            ...(cost !== null && { costMicroUsd: cost }),
          },
        });
        recovered++;
        this.logger.log(`kurtarıldı: id=${row.id} job=${row.providerJobId}`);
      } catch (err) {
        this.logger.warn(`kurtarma atlandı: id=${row.id} ${(err as Error).message}`);
      }
    }
    this.logger.log(`kurtarma bitti: aday=${rows.length} kurtarılan=${recovered}`);
    return recovered;
  }
}
