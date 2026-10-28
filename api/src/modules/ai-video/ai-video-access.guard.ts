import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../../common/types/request-user';
import { canUseAiVideo } from './ai-video-access';

/**
 * AiVideoAccessGuard (R7 — insan incelemesi zorunlu). JwtAuthGuard + VerifiedEmailGuard sonrası.
 * Kapı mantığı `canUseAiVideo`'da; burada yalnız isMinor'u DB'den okuyup uygular (JWT kullanıcısında yok).
 * Jenerik 403: yüzeyin varlığını sızdırma (PlatformAdminGuard deseni).
 */
@Injectable()
export class AiVideoAccessGuard implements CanActivate {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reqUser = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    const user = reqUser
      ? await this.prisma.user.findUnique({
          where: { id: reqUser.id },
          select: { id: true, isMinor: true },
        })
      : null;
    if (!user || !canUseAiVideo(this.config, user)) {
      throw new ForbiddenException({ message: 'Yetersiz yetki.', error: 'FORBIDDEN' });
    }
    return true;
  }
}
