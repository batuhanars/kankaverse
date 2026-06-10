import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  UnprocessableEntityException,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '@prisma/client';
import { randomUUID } from 'crypto';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2 } as const;
const MIN_AGE = 13;
const MAX_AGE = 120;

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

function calculateAge(birthDate: Date): number {
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

function calculateIsMinor(birthDate: Date): boolean {
  return calculateAge(birthDate) < 18;
}

function validateBirthDate(raw: string): Date {
  const birthDate = new Date(raw);
  if (isNaN(birthDate.getTime())) {
    throw new UnprocessableEntityException({ message: 'Geçersiz doğum tarihi.', error: 'INVALID_BIRTHDATE' });
  }
  if (birthDate >= new Date()) {
    throw new UnprocessableEntityException({ message: 'Doğum tarihi geçmişte olmalıdır.', error: 'INVALID_BIRTHDATE' });
  }
  const age = calculateAge(birthDate);
  if (age > MAX_AGE) {
    throw new UnprocessableEntityException({ message: 'Geçersiz doğum tarihi.', error: 'INVALID_BIRTHDATE' });
  }
  if (age < MIN_AGE) {
    throw new UnprocessableEntityException({ message: 'Kayıt için en az 13 yaşında olmalısın.', error: 'UNDERAGE' });
  }
  return birthDate;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    // Timing saldırısına karşı: kullanıcı bulunamadığında harcanan süre eşitleniyor
    this.dummyHash = await argon2.hash('dummy-timing-placeholder', ARGON2_OPTIONS);
  }

  async register(dto: RegisterDto, ip?: string) {
    const email = dto.email.toLowerCase().trim();
    const birthDate = validateBirthDate(dto.birthDate);

    const [existingUsername, existingEmail] = await Promise.all([
      this.prisma.user.findUnique({ where: { username: dto.username } }),
      this.prisma.user.findUnique({ where: { email } }),
    ]);

    if (existingUsername) {
      throw new ConflictException({ message: 'Bu kullanıcı adı zaten kullanımda.', error: 'USERNAME_TAKEN' });
    }
    if (existingEmail) {
      throw new ConflictException({ message: 'Bu e-posta adresi zaten kayıtlı.', error: 'EMAIL_TAKEN' });
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);
    const isMinor = calculateIsMinor(birthDate);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email,
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
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    if (!user) {
      // Kullanıcı bulunamasa bile argon2 maliyeti harcayarak timing farkını kapatıyoruz
      await argon2.verify(this.dummyHash, dto.password).catch(() => {});
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
    if (!rawRefreshToken) {
      throw new UnauthorizedException({ message: 'Yenileme tokeni bulunamadı.', error: 'INVALID_REFRESH' });
    }

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
      // Session hiç yok — yine de aile iptal dene (race/leaked token)
      await this.prisma.session.updateMany({
        where: { tokenFamily: payload.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({ message: 'Yenileme tokeni yeniden kullanımı tespit edildi.', error: 'REFRESH_REUSE_DETECTED' });
    }

    if (session.revokedAt !== null) {
      // İptal edilmiş session tekrar kullanıldı → tüm aileyi iptal et
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

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

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
      { sub: userId, sessionId },
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

    const refreshTokenHash = await argon2.hash(refreshToken, ARGON2_OPTIONS);

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
