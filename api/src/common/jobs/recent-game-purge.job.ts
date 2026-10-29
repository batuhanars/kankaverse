import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/** C31f (KVKK m.4): 7 günden eski "son oynanan oyun" satırlarını günde bir siler. */
export const RECENT_GAME_RETENTION_DAYS = 7;

@Injectable()
export class RecentGamePurgeJob {
  private readonly logger = new Logger(RecentGamePurgeJob.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run() {
    const cutoff = new Date(Date.now() - RECENT_GAME_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.recentGame.deleteMany({
      where: { lastPlayedAt: { lt: cutoff } },
    });
    if (count > 0) this.logger.log(`${count} süresi dolan son etkinlik satırı silindi.`);
  }
}
