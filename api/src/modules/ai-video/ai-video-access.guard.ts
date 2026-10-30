import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../../common/types/request-user';
import { canPreviewAiVideo, canUseAiVideo } from './ai-video-access';

/** C33 ek: işaretli uç kilitli tanıtım gören yetişkine de açılır (yalnız `options`; para harcamaz, Pika'yı çağırmaz). */
export const AI_VIDEO_PREVIEW_OK = 'aiVideoPreviewOk';
export const AiVideoPreviewOk = () => SetMetadata(AI_VIDEO_PREVIEW_OK, true);

/** Guard'ın isteğe bıraktığı bayrak: kullanıcı gerçekten `canUseAiVideo` mi (tutar alanlarını sıfırlamak için). */
export type AiVideoRequest = AuthenticatedRequest & { aiVideoAllowed?: boolean };

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
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AiVideoRequest>();
    const reqUser = req.user;
    const user = reqUser
      ? await this.prisma.user.findUnique({
          where: { id: reqUser.id },
          select: { id: true, isMinor: true },
        })
      : null;
    const allowed = !!user && (await canUseAiVideo(this.config, this.prisma, user));
    const previewOk =
      !!user &&
      this.reflector.get<boolean>(AI_VIDEO_PREVIEW_OK, context.getHandler()) === true &&
      canPreviewAiVideo(this.config, user);
    if (!user || (!allowed && !previewOk)) {
      throw new ForbiddenException({ message: 'Yetersiz yetki.', error: 'FORBIDDEN' });
    }
    req.aiVideoAllowed = allowed;
    return true;
  }
}
