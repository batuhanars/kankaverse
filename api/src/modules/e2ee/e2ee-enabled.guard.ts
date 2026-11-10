import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2EE_ERRORS } from './e2ee.util';

/**
 * Tüm /e2ee uçlarının kapısı (JwtAuthGuard'dan sonra):
 *  - kullanıcı uygun değilse (bayrak kapalı / listede yok) → 404 E2EE_DISABLED
 *  - çağıranın zincirinde cihaz var ve iptal edilmişse → 403 E2EE_DEVICE_REQUIRED (§2.6)
 * `GET /e2ee/status` bu guard'ı KULLANMAZ (istemci kapalıyken de "kapalı" cevabını almalı).
 */
@Injectable()
export class E2eeEnabledGuard implements CanActivate {
  constructor(
    private flag: E2eeFlagService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !this.flag.isEligible(user.id)) throw E2EE_ERRORS.disabled();

    const device = await this.prisma.e2eeDevice.findUnique({
      where: { tokenFamily: user.tokenFamily },
      select: { revokedAt: true },
    });
    if (device?.revokedAt) throw E2EE_ERRORS.deviceRequired();
    return true;
  }
}
