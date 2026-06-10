import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '@prisma/client';
import { randomUUID } from 'crypto';


function toUserDto(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    isMinor: user.isMinor,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt.toISOString(),
  };
}

function calculateIsMinor(birthDate: Date): boolean {
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age < 18;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException({ message: 'Bu kullanıcı adı zaten kullanımda.', error: 'USERNAME_TAKEN' });
    }

    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException({ message: 'Bu e-posta adresi zaten kayıtlı.', error: 'EMAIL_TAKEN' });
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const birthDate = new Date(dto.birthDate);
    const isMinor = calculateIsMinor(birthDate);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        birthDate,
        isMinor,
        dmPolicy: isMinor ? 'NONE' : 'FRIENDS',
        mediaPolicy: isMinor ? 'NONE' : 'FRIENDS',
        profileDiscoverable: !isMinor,
      },
    });

    const { accessToken, refreshToken } = await this.createSession(user.id, ip);
    return { user: toUserDto(user), accessToken, refreshToken };
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedException({ message: 'E-posta veya şifre hatalı.', error: 'INVALID_CREDENTIALS' });
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException({ message: 'E-posta veya şifre hatalı.', error: 'INVALID_CREDENTIALS' });
    }

    const { accessToken, refreshToken } = await this.createSession(user.id, ip);
    return { user: toUserDto(user), accessToken, refreshToken };
  }

  async refresh(rawRefreshToken: string, ip?: string) {
    let payload: { sub: string; sessionId: string; family: string };
    try {
      payload = this.jwtService.verify(rawRefreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException({ message: 'Geçersiz yenileme tokeni.', error: 'INVALID_REFRESH' });
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) {
      // Token ailesi yoksa; olası sızdırma
      await this.prisma.session.updateMany({
        where: { tokenFamily: payload.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({ message: 'Yenileme tokeni yeniden kullanımı tespit edildi.', error: 'REFRESH_REUSE_DETECTED' });
    }

    if (session.revokedAt !== null) {
      // Önceden iptal edilmiş — tüm aileyi iptal et (token theft)
      await this.prisma.session.updateMany({
        where: { tokenFamily: session.tokenFamily, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({ message: 'Yenileme tokeni yeniden kullanımı tespit edildi.', error: 'REFRESH_REUSE_DETECTED' });
    }

    const tokenValid = await argon2.verify(session.refreshTokenHash, rawRefreshToken);
    if (!tokenValid) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({ message: 'Geçersiz yenileme tokeni.', error: 'INVALID_REFRESH' });
    }

    // Eski session'ı iptal et
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    // Yeni session aynı aileyle oluştur (rotasyon)
    const { accessToken, refreshToken } = await this.createSession(
      session.userId,
      ip,
      session.tokenFamily,
    );
    return { accessToken, refreshToken };
  }

  async logout(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');
    return toUserDto(user);
  }

  private async createSession(userId: string, ip?: string, existingFamily?: string) {
    const family = existingFamily ?? randomUUID();
    const sessionId = randomUUID();

    const accessToken = this.jwtService.sign(
      { sub: userId, username: '', sessionId },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, sessionId, family },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: '30d',
      },
    );

    const refreshTokenHash = await argon2.hash(refreshToken, { type: argon2.argon2id });

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash,
        tokenFamily: family,
        ip,
        lastActiveAt: new Date(),
      },
    });

    return { accessToken, refreshToken };
  }
}
