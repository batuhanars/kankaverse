import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { E2EE_PARKED_RETENTION_DAYS } from './e2ee.constants';
import { E2eeNotifyService } from './e2ee-notify.service';
import { deviceRevokeOps } from './e2ee-revocation.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 🔴 R7 — C69: park edilmiş (çıkış yapılmış) cihazların listesi, kullanıcı kaldırması ve 30 gün temizliği.
 * İptal kuralı tek yerde (`deviceRevokeOps`): KeyPackage'lar silinir, cihaz `revokedAt` alır.
 */
@Injectable()
export class E2eeParkedService {
  constructor(
    private prisma: PrismaService,
    private notify: E2eeNotifyService,
  ) {}

  /** Çağıranın park cihazları (Oturumlarım). Başkasınınki asla. */
  async list(userId: string) {
    const rows = await this.prisma.e2eeDevice.findMany({
      where: { userId, revokedAt: null, parkedAt: { not: null } },
      orderBy: { parkedAt: 'desc' },
      select: { id: true, platform: true, lastSeenAt: true, parkedAt: true },
    });
    return rows.map((d) => ({
      id: d.id,
      platform: d.platform,
      lastSeenAt: d.lastSeenAt.toISOString(),
      parkedAt: (d.parkedAt as Date).toISOString(),
    }));
  }

  /** Kendi park cihazını iptal et. Yok/başkasının/park değil → 404 (varlık sızdırmaz). */
  async revoke(userId: string, deviceId: string): Promise<null> {
    const device = await this.prisma.e2eeDevice.findFirst({
      where: { id: deviceId, userId, revokedAt: null, parkedAt: { not: null } },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException({
        message: 'Çıkış yapılmış cihaz bulunamadı.',
        error: 'E2EE_PARKED_DEVICE_NOT_FOUND',
      });
    }
    await this.prisma.$transaction([
      ...deviceRevokeOps(this.prisma, { id: device.id, userId }),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'e2ee.device.revoke-parked',
          entityType: 'E2eeDevice',
          entityId: device.id,
        },
      }),
    ]);
    await this.notify.devicesChanged(userId);
    return null;
  }

  /** `E2EE_PARKED_RETENTION_DAYS` günü aşan park cihazları iptal eder; süresi dolmuş rebind nonce'larını siler. */
  async sweep(now: Date): Promise<{ revoked: number }> {
    const cutoff = new Date(now.getTime() - E2EE_PARKED_RETENTION_DAYS * DAY_MS);
    const stale = await this.prisma.e2eeDevice.findMany({
      where: { revokedAt: null, parkedAt: { lt: cutoff } },
      select: { id: true, userId: true },
    });
    if (stale.length > 0) {
      await this.prisma.$transaction(
        deviceRevokeOps(this.prisma, { id: { in: stale.map((d) => d.id) } }),
      );
      for (const userId of new Set(stale.map((d) => d.userId)))
        await this.notify.devicesChanged(userId);
    }
    await this.prisma.e2eeRebindNonce.deleteMany({ where: { expiresAt: { lt: now } } });
    return { revoked: stale.length };
  }
}
