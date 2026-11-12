import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { E2eeTransferService } from './e2ee-transfer.service';

/** E5b §3.2: dakikada bir süresi dolan aktarımları kapatır ve nesnelerini siler; eski bitmiş satırları temizler. */
@Injectable()
export class E2eeTransferJob {
  private readonly logger = new Logger(E2eeTransferJob.name);

  constructor(private transfer: E2eeTransferService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    try {
      const { expired, deleted } = await this.transfer.sweep(new Date());
      if (expired || deleted)
        this.logger.log(
          `Aktarım temizliği: ${expired} süresi doldu, ${deleted} eski satır silindi`,
        );
    } catch (err) {
      this.logger.error(`Aktarım temizlik işi hatası: ${(err as Error).message}`);
    }
  }
}
