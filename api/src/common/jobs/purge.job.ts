import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PurgeJob {
  private readonly logger = new Logger(PurgeJob.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async run() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const candidates = await this.prisma.user.findMany({
      where: { deletionRequestedAt: { lte: thirtyDaysAgo }, deletedAt: null },
      select: { id: true },
    });

    if (candidates.length === 0) return;

    const purgeEnabled = this.config.get<boolean>('purgeEnabled');

    if (!purgeEnabled) {
      // PURGE_ENABLED=false (varsayılan): yalnızca logla, imha etme
      candidates.forEach((u) =>
        this.logger.log(`Purge adayı (PURGE_ENABLED=false, R6 KVKK onayı bekleniyor): ${u.id}`),
      );
      return;
    }

    // PURGE_ENABLED=true: R6 KVKK + hukuk onayından sonra buraya gerçek imha gelecek
    this.logger.warn(
      `Purge GATED — PURGE_ENABLED=true ama kalıcı imha henüz uygulanmadı (R6 bekleniyor). Aday: ${candidates.length}`,
    );
  }
}
