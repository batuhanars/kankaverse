import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AgeCheckJob {
  private readonly logger = new Logger(AgeCheckJob.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async run() {
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

    const result = await this.prisma.user.updateMany({
      where: { isMinor: true, birthDate: { lte: eighteenYearsAgo }, deletedAt: null },
      data: { isMinor: false },
    });

    if (result.count > 0) {
      this.logger.log(`isMinor güncellemesi: ${result.count} kullanıcı 18 yaşına ulaştı.`);
    }
  }
}
