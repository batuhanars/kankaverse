import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * E4 §3.4 — şikâyet kapandıktan `REPORT_EVIDENCE_RETENTION_DAYS` gün sonra (`Report.evidencePurgeAt`)
 * kanıt satırları kalıcı silinir. Rapor satırı kalır (referans/karar geçmişi); yalnız içerik gider.
 * 🔴 R7: yalnız SAYI loglanır, içerik ASLA.
 */
@Injectable()
export class ReportEvidencePurgeJob {
  private readonly logger = new Logger(ReportEvidencePurgeJob.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    try {
      const count = await this.purge(new Date());
      this.logger.log(`Süresi dolan şikâyet kanıtı silindi: ${count} satır`);
    } catch (err) {
      this.logger.error(`Kanıt silme işi hatası: ${(err as Error).message}`);
    }
  }

  /** `evidencePurgeAt < now` olan raporların kanıt satırlarını siler; dolmayana ve boş tarihe dokunmaz. */
  async purge(now: Date): Promise<number> {
    const { count } = await this.prisma.reportEvidence.deleteMany({
      where: { report: { evidencePurgeAt: { lt: now } } },
    });
    return count;
  }
}
