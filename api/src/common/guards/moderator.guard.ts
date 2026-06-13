import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ModeratorGuard — platform-seviyesi moderatör kapısı (R7 — insan incelemesi zorunlu).
 *
 * User.isModerator = true olanlar geçer. Seed veya manuel DB set ile atanır — UI yok.
 * JwtAuthGuard sonrası kullanılır (request.user dolu olmalı).
 */
@Injectable()
export class ModeratorGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;

    if (!userId) {
      throw new ForbiddenException({ message: 'Yetersiz yetki.', error: 'FORBIDDEN' });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isModerator: true },
    });

    if (!user?.isModerator) {
      throw new ForbiddenException({ message: 'Bu işlem için moderatör yetkisi gereklidir.', error: 'FORBIDDEN' });
    }

    return true;
  }
}
