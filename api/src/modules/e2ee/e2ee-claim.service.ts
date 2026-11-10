import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { E2eeChannelService } from './e2ee-channel.service';
import { e2eeError, toB64 } from './e2ee.util';

/**
 * 🔴 R7 — KeyPackage claim (§2.3). Yetki: çağıran kanal üyesi + hedef cihazlar kanal üyelerinin.
 * Tüketim ATOMİK: tek koşullu UPDATE; eşzamanlı iki claim aynı paketi alamaz.
 */
@Injectable()
export class E2eeClaimService {
  constructor(
    private prisma: PrismaService,
    private channels: E2eeChannelService,
  ) {}

  async claim(userId: string, channelId: string, deviceIds: string[]) {
    const memberIds = await this.channels.requireDmMembers(userId, channelId);
    this.channels.assertAllEligible(memberIds);

    const unique = [...new Set(deviceIds)];
    const devices = await this.prisma.e2eeDevice.findMany({
      where: { id: { in: unique } },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (devices.length !== unique.length || devices.some((d) => !memberIds.includes(d.userId))) {
      throw e2eeError(
        HttpStatus.FORBIDDEN,
        'Hedef cihazlar bu sohbetin üyelerine ait değil.',
        'E2EE_DEVICE_NOT_IN_CHANNEL',
      );
    }

    const result: { deviceId: string; keyPackage: string }[] = [];
    for (const device of devices.filter((d) => d.revokedAt === null)) {
      const data = await this.consumeOne(device.id);
      if (data) result.push({ deviceId: device.id, keyPackage: toB64(data) });
    }
    return result;
  }

  /** Önce tek-kullanımlık paket (atomik), yoksa son çare (tüketilmez), yoksa null. */
  private async consumeOne(deviceId: string): Promise<Uint8Array | null> {
    // Alt sorgu + SKIP LOCKED: eşzamanlı claim'ler farklı satırlara düşer; dış koşul (consumedAt IS NULL)
    // kilit sonrası yeniden doğrulanır → bir paket iki kez dönemez.
    const rows = await this.prisma.$queryRaw<{ data: Uint8Array }[]>`
      UPDATE "E2eeKeyPackage" SET "consumedAt" = now()
      WHERE "id" = (
        SELECT "id" FROM "E2eeKeyPackage"
        WHERE "deviceId" = ${deviceId} AND "consumedAt" IS NULL AND "lastResort" = false
        ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      ) AND "consumedAt" IS NULL
      RETURNING "data"`;
    if (rows.length > 0) return rows[0].data;

    const lastResort = await this.prisma.e2eeKeyPackage.findFirst({
      where: { deviceId, lastResort: true },
      select: { data: true },
    });
    return lastResort?.data ?? null;
  }
}
