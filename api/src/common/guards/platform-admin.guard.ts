import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../types/request-user';

/**
 * PlatformAdminGuard — platform-seviyesi admin kapısı (R7 — insan incelemesi zorunlu).
 *
 * User.isModerator = true olanlar geçer. Seed veya manuel DB set ile atanır — UI yok.
 * JwtAuthGuard sonrası kullanılır (request.user dolu olmalı).
 *
 * Karar (PM): isModerator reuse — kapalı-test fazı için yeterli. Ayrı isPlatformAdmin/RBAC → V2 (D16).
 * Jenerik 403: admin yüzeyinin varlığını sızdırma.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user?.isModerator) {
      throw new ForbiddenException({ message: 'Yetersiz yetki.', error: 'FORBIDDEN' });
    }
    return true;
  }
}
