import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { E2eeParkedService } from './e2ee-parked.service';

/** C69: saatte bir, süresi (E2EE_PARKED_RETENTION_DAYS) dolan park cihazlarını iptal eder. */
@Injectable()
export class E2eeParkedJob {
  private readonly logger = new Logger(E2eeParkedJob.name);

  constructor(private parked: E2eeParkedService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    try {
      const { revoked } = await this.parked.sweep(new Date());
      if (revoked) this.logger.log(`Park temizliği: ${revoked} cihaz iptal edildi`);
    } catch (err) {
      this.logger.error(`Park temizlik işi hatası: ${(err as Error).message}`);
    }
  }
}
