import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { E2eeNotifyService } from './e2ee-notify.service';

/**
 * 🔴 R7 — E2EE cihaz iptali (§2.6). Auth katmanı yalnız zinciri GERÇEKTEN bitiren noktalarda çağırır;
 * refresh rotasyonu çağırmaz. Kapsam (biri verilir):
 *  - `families`: bu oturum zincirleri
 *  - `sessionId`: bu oturumun zinciri
 *  - `userId` (+ `exceptSessionId`): kullanıcının tüm zincirleri (istisna oturumun zinciri hariç)
 */
export interface RevokeScope {
  families?: string[];
  sessionId?: string;
  userId?: string;
  exceptSessionId?: string;
}

type DeviceWhere = Prisma.E2eeDeviceWhereInput;

/** Cihaz iptali kuralı tek yerde: KeyPackage'lar silinir, cihaz `revokedAt` alır. Sıra önemli (önce paketler). */
export function deviceRevokeOps(
  db: Prisma.TransactionClient,
  where: DeviceWhere,
): Prisma.PrismaPromise<unknown>[] {
  return [
    db.e2eeKeyPackage.deleteMany({ where: { device: where } }),
    db.e2eeDevice.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ];
}

/** Etkileşimli transaction içinde (purge işi gibi) kullanıcının tüm cihazlarını iptal eder. */
export async function revokeUserDevicesInTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  for (const op of deviceRevokeOps(tx, { userId })) await op;
}

@Injectable()
export class E2eeRevocationService {
  constructor(
    private prisma: PrismaService,
    private notify: E2eeNotifyService,
  ) {}

  /** Auth transaction dizisine eklenecek iptal işlemleri (oturum iptaliyle AYNI transaction). */
  async revokeOps(scope: RevokeScope): Promise<Prisma.PrismaPromise<unknown>[]> {
    return deviceRevokeOps(this.prisma, await this.resolveWhere(scope));
  }

  /** Transaction commit'inden SONRA: etkilenen kullanıcıların DM odalarına `e2ee:devices-changed`. */
  async announce(scope: RevokeScope): Promise<void> {
    try {
      const devices = await this.prisma.e2eeDevice.findMany({
        where: await this.resolveWhere(scope),
        select: { userId: true },
        distinct: ['userId'],
      });
      for (const d of devices) await this.notify.devicesChanged(d.userId);
    } catch {
      // yayın kozmetik değil ama iptal zaten commit edildi; çağıranı bozma (notify kendi hatasını loglar)
    }
  }

  private async resolveWhere(scope: RevokeScope): Promise<DeviceWhere> {
    const families = [...(scope.families ?? [])];
    if (scope.sessionId) {
      const family = await this.familyOf(scope.sessionId);
      if (family) families.push(family);
    }
    if (scope.userId) {
      const except = scope.exceptSessionId ? await this.familyOf(scope.exceptSessionId) : null;
      return { userId: scope.userId, ...(except ? { tokenFamily: { not: except } } : {}) };
    }
    return { tokenFamily: { in: families } };
  }

  private async familyOf(sessionId: string): Promise<string | null> {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { tokenFamily: true },
    });
    return s?.tokenFamily ?? null;
  }
}
