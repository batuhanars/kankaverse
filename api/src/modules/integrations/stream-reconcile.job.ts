import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StreamProvider } from './providers/stream-provider';
import { StreamProvidersRegistry } from './stream-providers.registry';

/**
 * C36 §3 (PM 2026-10-30: saatlik) — uzlaştırma: bağlı hesapların abonelikleri platformda listelenir, eksik/bozuk olanlar
 * yeniden açılır, bağlı olmayanlarınki kapatılır. Hesap silme/kopar sırasında kapatılamayanlar da burada temizlenir.
 */
@Injectable()
export class StreamReconcileJob {
  private readonly logger = new Logger(StreamReconcileJob.name);

  constructor(
    private prisma: PrismaService,
    private providers: StreamProvidersRegistry,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    for (const provider of this.providers.enabled()) {
      try {
        await this.reconcile(provider);
      } catch (err) {
        this.logger.error(`${provider.key} uzlaştırma hatası: ${(err as Error).message}`);
      }
    }
  }

  async reconcile(provider: StreamProvider): Promise<{ opened: number; closed: number }> {
    const accounts = await this.prisma.externalAccount.findMany({
      where: { provider: provider.db },
      select: { externalId: true },
    });
    const wanted = new Set(accounts.map((a) => a.externalId));
    const remote = await provider.listSubscriptions();

    const healthy = new Set(remote.filter((s) => s.healthy).map((s) => s.externalId));
    let closed = 0;
    // Bağlı olmayan ya da bozuk abonelikler kapatılır (bozuk olan aşağıda yeniden açılır)
    for (const sub of remote) {
      if (wanted.has(sub.externalId) && sub.healthy) continue;
      try {
        await provider.unsubscribe(sub.id);
        closed++;
      } catch (err) {
        this.logger.warn(`${provider.key} abonelik kapatılamadı: ${(err as Error).message}`);
      }
    }
    let opened = 0;
    for (const externalId of wanted) {
      if (healthy.has(externalId)) continue;
      try {
        await provider.subscribe(externalId);
        opened++;
      } catch (err) {
        this.logger.warn(`${provider.key} abonelik açılamadı: ${(err as Error).message}`);
      }
    }
    this.logger.log(
      `${provider.key} uzlaştırma: ${wanted.size} hesap, ${opened} abonelik açıldı, ${closed} kapatıldı`,
    );
    return { opened, closed };
  }
}
