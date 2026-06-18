import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  sessionId: string;
  twoFactorChallenge?: never; // challenge token'lar access olarak kabul edilmez (R7)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') as string,
    });
  }

  async validate(payload: JwtPayload & { twoFactorChallenge?: boolean }) {
    // 2FA challenge token'ı access token olarak kullanmayı reddet (R7 §5.2)
    if (payload.twoFactorChallenge) {
      throw new UnauthorizedException('2FA challenge token access olarak kabul edilmiyor.');
    }

    const session = await this.prisma.session.findFirst({
      where: { id: payload.sessionId, revokedAt: null },
    });
    if (!session) throw new UnauthorizedException('Oturum geçersiz veya sona ermiş.');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');

    return {
      id: user.id,
      username: user.username,
      sessionId: payload.sessionId,
      emailVerifiedAt: user.emailVerifiedAt,
      isModerator: user.isModerator,
    };
  }
}
