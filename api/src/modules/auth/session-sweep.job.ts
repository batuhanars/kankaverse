import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { E2eeRevocationService } from '../e2ee/e2ee-revocation.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Yenileme tokeni 30 gün geçerli; 1 gün pay. Bundan eski aile yenilenemez, geri gelemez. */
export const SESSION_DEAD_AFTER_DAYS = 31;
const BATCH = 200;

/**
 * 🔴 R7 — C79 §2.3: çıkış yapılmadan bırakılan oturumlar (uygulama kaldırıldı, gizli pencere kapandı) sunucuda
 * açık kalıyor ve E2EE cihazı "etkin" sayılmaya devam ediyordu. Son yenilemesi 31 günden eski aileler, çıkıştaki
 * yolla kapatılır: oturum + cihaz iptali (KeyPackage silme) tek transaction, ardından `e2ee:devices-changed`.
 */
@Injectable()
export class SessionSweepJob {
  private readonly logger = new Logger(SessionSweepJob.name);

  constructor(
    private prisma: PrismaService,
    private e2ee: E2eeRevocationService,
  ) {}

  @Cron('0 4 * * *')
  async run(): Promise<void> {
    try {
      const closed = await this.sweep(new Date());
      if (closed) this.logger.log(`Ölü oturum temizliği: ${closed} aile kapatıldı`);
    } catch (err) {
      this.logger.error(`Ölü oturum temizliği hatası: ${(err as Error).message}`);
    }
  }

  /** Kapatılan aile sayısı. Parti parti: her parti kendi transaction'ı. */
  async sweep(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - SESSION_DEAD_AFTER_DAYS * DAY_MS);
    let total = 0;
    for (;;) {
      const dead = await this.prisma.session.groupBy({
        by: ['tokenFamily'],
        where: { revokedAt: null },
        having: { lastActiveAt: { _max: { lt: cutoff } } },
        orderBy: { tokenFamily: 'asc' },
        take: BATCH,
      });
      if (dead.length === 0) return total;
      const families = dead.map((d) => d.tokenFamily);
      const scope = { families };
      await this.prisma.$transaction([
        this.prisma.session.updateMany({
          where: { tokenFamily: { in: families }, revokedAt: null },
          data: { revokedAt: now },
        }),
        ...(await this.e2ee.revokeOps(scope)),
      ]);
      void this.e2ee.announce(scope);
      total += families.length;
      if (dead.length < BATCH) return total;
    }
  }
}
