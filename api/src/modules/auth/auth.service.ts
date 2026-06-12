import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  verifySync as totpVerifySync,
  generateSecret as totpGenerateSecret,
  generateURI as totpGenerateURI,
} from 'otplib';
import * as QRCode from 'qrcode';
import { AuthTokenType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../shared/email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Login2faDto } from './dto/login-2fa.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Setup2faDto } from './dto/setup-2fa.dto';
import { Enable2faDto } from './dto/enable-2fa.dto';
import { Disable2faDto } from './dto/disable-2fa.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { User } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  generateAuthToken,
  hashAuthToken,
  generateRecoveryCode,
  hashRecoveryCode,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  EMAIL_CHANGE_TTL_MS,
} from './utils/auth-token.util';
import { validateBirthDate, calculateIsMinor } from './utils/birthdate.util';
import { toUserDto } from './utils/user-dto.util';
import { encryptSecret, decryptSecret } from '../../common/utils/crypto.util';
import { generateFriendTag } from './utils/friend-tag.util';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2 } as const;
const RECOVERY_CODE_COUNT = 10;
// Eşzamanlı refresh yarışında iyi huylu çakışmayı reuse olarak saymamak için grace penceresi.
const REFRESH_RACE_GRACE_MS = 10_000;

const TOTP_OPTS = { algorithm: 'sha1' as const, digits: 6, period: 30 };
const TOTP_VERIFY_OPTS = { ...TOTP_OPTS, epochTolerance: 30 };

// ─── Dönüş tipleri ──────────────────────────────────────────────────────────

type LoginResult =
  | { type: 'session'; user: ReturnType<typeof toUserDto>; accessToken: string; refreshToken: string }
  | { type: 'challenge'; challengeToken: string };

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash!: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('dummy-timing-placeholder', ARGON2_OPTIONS);
  }

  // ── Temel auth ─────────────────────────────────────────────────────────────

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
        friendTag: generateFriendTag(),
        dmPolicy: isMinor ? 'NONE' : 'FRIENDS',
        mediaPolicy: isMinor ? 'NONE' : 'FRIENDS',
        profileDiscoverable: !isMinor,
      },
    });

    this.sendVerificationEmailSilent(user.id, user.email);

    const { accessToken, refreshToken } = await this.createSession(user.id, ip, undefined, user.email);
    return { user: toUserDto(user), accessToken, refreshToken };
  }

  async login(dto: LoginDto, ip?: string): Promise<LoginResult> {
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    if (!user) {
      await argon2.verify(this.dummyHash, dto.password).catch(() => {});
      throw new UnauthorizedException({ message: 'E-posta veya şifre hatalı.', error: 'INVALID_CREDENTIALS' });
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException({ message: 'E-posta veya şifre hatalı.', error: 'INVALID_CREDENTIALS' });
    }

    // 2FA etkinse challenge döndür, session açma. Silme iptali ancak tam giriş
    // tamamlanınca yapılır (login2fa) — başarısız 2FA bekleyen silmeyi iptal etmesin (#2).
    if (user.twoFactorEnabled) {
      const challengeToken = this.jwtService.sign(
        { sub: user.id, twoFactorChallenge: true },
        { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: '5m' },
      );
      return { type: 'challenge', challengeToken };
    }

    // Tam giriş (2FA'sız) tamamlandı → bekleyen silme talebini iptal et
    await this.cancelPendingDeletionOnLogin(user);

    const { accessToken, refreshToken } = await this.createSession(user.id, ip, undefined, user.email);
    return { type: 'session', user: toUserDto(user), accessToken, refreshToken };
  }

  async login2fa(dto: Login2faDto, ip?: string) {
    let payload: { sub: string; twoFactorChallenge: boolean };
    try {
      payload = this.jwtService.verify(dto.challengeToken, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException({ message: 'Challenge süresi dolmuş veya geçersiz.', error: 'INVALID_REFRESH' });
    }

    if (!payload.twoFactorChallenge) {
      throw new UnauthorizedException({ message: 'Geçersiz challenge token.', error: 'INVALID_REFRESH' });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException({ message: 'Kullanıcı bulunamadı.', error: 'INVALID_CREDENTIALS' });

    // TOTP veya kurtarma kodu doğrula
    const codeValid = await this.verifyTotpOrRecoveryCode(user, dto.code);
    if (!codeValid) {
      throw new BadRequestException({ message: 'Geçersiz 2FA kodu.', error: 'INVALID_TWO_FACTOR_CODE' });
    }

    // Tam giriş tamamlandı (şifre + 2FA) → bekleyen silme talebini iptal et
    await this.cancelPendingDeletionOnLogin(user);

    const { accessToken, refreshToken } = await this.createSession(user.id, ip, undefined, user.email);
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

    const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId } });

    if (!session) {
      await this.prisma.session.updateMany({
        where: { tokenFamily: payload.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({ message: 'Yenileme tokeni yeniden kullanımı tespit edildi.', error: 'REFRESH_REUSE_DETECTED' });
    }

    const tokenValid = await argon2.verify(session.refreshTokenHash, rawRefreshToken);

    if (session.revokedAt !== null) {
      const withinGrace = Date.now() - session.revokedAt.getTime() < REFRESH_RACE_GRACE_MS;
      if (tokenValid && withinGrace) {
        throw new UnauthorizedException({ message: 'Oturum az önce yenilendi, tekrar dene.', error: 'INVALID_REFRESH' });
      }
      await this.prisma.session.updateMany({
        where: { tokenFamily: session.tokenFamily, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({ message: 'Yenileme tokeni yeniden kullanımı tespit edildi.', error: 'REFRESH_REUSE_DETECTED' });
    }

    if (!tokenValid) {
      await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException({ message: 'Geçersiz yenileme tokeni.', error: 'INVALID_REFRESH' });
    }

    const claim = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new UnauthorizedException({ message: 'Oturum az önce yenilendi, tekrar dene.', error: 'INVALID_REFRESH' });
    }

    const { accessToken, refreshToken } = await this.createSession(session.userId, ip, session.tokenFamily);
    return { accessToken, refreshToken };
  }

  async logout(sessionId: string) {
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');
    if (user.deletionRequestedAt) {
      throw new ForbiddenException({ message: 'Hesap silme talebi bekliyor.', error: 'ACCOUNT_DELETION_PENDING' });
    }
    return toUserDto(user);
  }

  // ── E-posta doğrulama (2A) ─────────────────────────────────────────────────

  async verifyEmail(rawToken: string) {
    const token = await this.consumeAuthToken(rawToken, AuthTokenType.EMAIL_VERIFICATION);
    const user = await this.prisma.user.findUnique({ where: { id: token.userId } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');

    if (user.emailVerifiedAt !== null) {
      throw new ConflictException({ message: 'E-posta adresi zaten doğrulanmış.', error: 'EMAIL_ALREADY_VERIFIED' });
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    return { user: toUserDto(updated) };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');

    if (user.emailVerifiedAt !== null) {
      throw new ConflictException({ message: 'E-posta adresi zaten doğrulanmış.', error: 'EMAIL_ALREADY_VERIFIED' });
    }

    const rawToken = await this.createAuthToken(userId, AuthTokenType.EMAIL_VERIFICATION, EMAIL_VERIFICATION_TTL_MS);
    await this.emailService.sendVerificationEmail(user.email, rawToken);
    return null;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email, deletedAt: null } });

    if (user) {
      this.sendPasswordResetEmailSilent(user.id, user.email);
    }
    return null;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const token = await this.consumeAuthToken(dto.token, AuthTokenType.PASSWORD_RESET);
    const newHash = await argon2.hash(dto.newPassword, ARGON2_OPTIONS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash: newHash, emailVerifiedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return null;
  }

  // ── 2FA ────────────────────────────────────────────────────────────────────

  async setup2fa(userId: string, dto: Setup2faDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');

    if (user.twoFactorEnabled) {
      throw new ConflictException({ message: '2FA zaten etkin.', error: 'TWO_FACTOR_ALREADY_ENABLED' });
    }

    await this.verifyReauth(user, dto.currentPassword, dto.totpCode);

    const secret = totpGenerateSecret({ length: 20 });
    const appName = this.config.get<string>('totp.appName') ?? 'Kankaverse';
    const otpauthUrl = totpGenerateURI({
      label: user.email,
      issuer: appName,
      secret,
      ...TOTP_OPTS,
    });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    const encKey = this.getTotpEncKey();
    const encryptedSecret = encryptSecret(secret, encKey);

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptedSecret },
    });

    return { otpauthUrl, qrDataUrl, secret };
  }

  async enable2fa(userId: string, dto: Enable2faDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');

    if (user.twoFactorEnabled) {
      throw new ConflictException({ message: '2FA zaten etkin.', error: 'TWO_FACTOR_ALREADY_ENABLED' });
    }
    if (!user.totpSecret) {
      throw new BadRequestException({ message: 'Önce 2FA kurulumunu tamamla.', error: 'TWO_FACTOR_NOT_ENABLED' });
    }

    const encKey = this.getTotpEncKey();
    const secret = decryptSecret(user.totpSecret, encKey);
    const valid = totpVerifySync({ token: dto.code, secret, ...TOTP_VERIFY_OPTS }).valid;

    if (!valid) {
      throw new BadRequestException({ message: 'Geçersiz 2FA kodu.', error: 'INVALID_TWO_FACTOR_CODE' });
    }

    // Önceki kurtarma kodlarını temizle + yenilerini üret
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
    const codeHashes = codes.map(hashRecoveryCode);

    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      ...codeHashes.map((codeHash) =>
        this.prisma.recoveryCode.create({ data: { userId, codeHash } }),
      ),
      this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } }),
    ]);

    return { codes };
  }

  async disable2fa(userId: string, dto: Disable2faDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');

    if (!user.twoFactorEnabled) {
      throw new ConflictException({ message: '2FA zaten kapalı.', error: 'TWO_FACTOR_NOT_ENABLED' });
    }

    await this.verifyReauth(user, dto.currentPassword, dto.totpCode);

    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, totpSecret: null },
      }),
    ]);

    this.logger.log(`2FA devre dışı bırakıldı (kullanıcı: ${userId})`);
    return null;
  }

  // ── Oturumlar ──────────────────────────────────────────────────────────────

  async getSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      device: s.device,
      ip: s.ip,
      lastActiveAt: s.lastActiveAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });

    if (!session) {
      throw new NotFoundException({ message: 'Oturum bulunamadı.', error: 'SESSION_NOT_FOUND' });
    }

    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    return null;
  }

  async revokeOtherSessions(userId: string, currentSessionId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  // ── Şifre / E-posta değişimi ───────────────────────────────────────────────

  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');

    await this.verifyReauth(user, dto.currentPassword, dto.totpCode);

    const newHash = await argon2.hash(dto.newPassword, ARGON2_OPTIONS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } }),
      // Mevcut oturum korunur, diğerleri düşer
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    return null;
  }

  async changeEmail(userId: string, dto: ChangeEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');

    await this.verifyReauth(user, dto.currentPassword, dto.totpCode);

    const newEmail = dto.newEmail.toLowerCase().trim();
    const taken = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (taken) {
      throw new ConflictException({ message: 'Bu e-posta adresi zaten kullanımda.', error: 'EMAIL_TAKEN' });
    }

    // Yeni adrese doğrulama + eski adrese geri-al tokenleri oluştur (fire-and-forget)
    this.sendEmailChangeTokensSilent(userId, user.email, newEmail);
    return null;
  }

  async confirmEmailChange(rawToken: string) {
    const token = await this.consumeAuthToken(rawToken, AuthTokenType.EMAIL_CHANGE);

    if (!token.payload) {
      throw new BadRequestException({ message: 'Geçersiz token.', error: 'INVALID_TOKEN' });
    }

    const taken = await this.prisma.user.findFirst({ where: { email: token.payload, id: { not: token.userId } } });
    if (taken) {
      throw new ConflictException({ message: 'Bu e-posta adresi artık kullanımda.', error: 'EMAIL_TAKEN' });
    }

    const updated = await this.prisma.user.update({
      where: { id: token.userId },
      data: { email: token.payload, emailVerifiedAt: new Date() },
    });
    return { user: toUserDto(updated) };
  }

  async undoEmailChange(rawToken: string) {
    const token = await this.consumeAuthToken(rawToken, AuthTokenType.EMAIL_CHANGE_UNDO);

    if (!token.payload) {
      throw new BadRequestException({ message: 'Geçersiz token.', error: 'INVALID_TOKEN' });
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { email: token.payload },
      }),
      // Ele geçirme senaryosuna karşı tüm oturumları düşür
      this.prisma.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      // Bekleyen EMAIL_CHANGE tokenını da iptal et
      this.prisma.authToken.updateMany({
        where: { userId: token.userId, type: AuthTokenType.EMAIL_CHANGE, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    return null;
  }

  // ── Hesap silme (gated) ────────────────────────────────────────────────────

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');

    await this.verifyReauth(user, dto.currentPassword, dto.totpCode);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return null;
  }

  async cancelAccountDeletion(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null },
    });
    return null;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Tam giriş tamamlandığında bekleyen hesap silme talebini iptal eder (brief §8: giriş = iptal). */
  private async cancelPendingDeletionOnLogin(user: User): Promise<void> {
    if (user.deletionRequestedAt !== null) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { deletionRequestedAt: null },
      });
      this.logger.log(`Hesap silme talebi login ile iptal edildi (kullanıcı: ${user.id})`);
    }
  }

  private async verifyReauth(user: User, password: string, totpCode?: string): Promise<void> {
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException({ message: 'Şifre hatalı.', error: 'INVALID_CREDENTIALS' });
    }

    if (user.twoFactorEnabled) {
      if (!totpCode) {
        throw new UnauthorizedException({ message: '2FA kodu gerekli.', error: 'INVALID_CREDENTIALS' });
      }
      const encKey = this.getTotpEncKey();
      const secret = decryptSecret(user.totpSecret!, encKey);
      const valid2fa = totpVerifySync({ token: totpCode, secret, ...TOTP_VERIFY_OPTS }).valid;
      if (!valid2fa) {
        throw new UnauthorizedException({ message: 'Geçersiz 2FA kodu.', error: 'INVALID_CREDENTIALS' });
      }
    }
  }

  private async verifyTotpOrRecoveryCode(user: User, code: string): Promise<boolean> {
    // Kurtarma kodu formatı: XXXX-XXXX-XXXX-XXXX (dashes içerir veya 16 harf)
    const isRecoveryFormat = /^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/i.test(code)
      || /^[A-Z2-7]{16}$/i.test(code);

    if (!isRecoveryFormat && user.totpSecret) {
      const encKey = this.getTotpEncKey();
      const secret = decryptSecret(user.totpSecret, encKey);
      if (totpVerifySync({ token: code, secret, ...TOTP_VERIFY_OPTS }).valid) return true;
    }

    // Kurtarma kodu dene
    const hash = hashRecoveryCode(code);
    const rc = await this.prisma.recoveryCode.findFirst({
      where: { userId: user.id, codeHash: hash, usedAt: null },
    });
    if (!rc) return false;

    // Atomik tek-kullanım
    const claim = await this.prisma.recoveryCode.updateMany({
      where: { id: rc.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return claim.count > 0;
  }

  private getTotpEncKey(): string {
    const key = this.config.get<string>('totp.encKey');
    if (!key) throw new Error('TOTP_ENC_KEY tanımlı değil — 2FA kullanılamaz.');
    return key;
  }

  async createAuthToken(userId: string, type: AuthTokenType, ttlMs: number, payload?: string): Promise<string> {
    const { raw, hash } = generateAuthToken();
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.prisma.authToken.create({
      data: { userId, type, tokenHash: hash, expiresAt, payload },
    });

    return raw;
  }

  private async consumeAuthToken(rawToken: string, type: AuthTokenType) {
    const hash = hashAuthToken(rawToken);
    const token = await this.prisma.authToken.findFirst({ where: { tokenHash: hash, type } });

    if (!token || token.usedAt !== null || token.expiresAt < new Date()) {
      throw new BadRequestException({ message: 'Geçersiz veya süresi dolmuş bağlantı.', error: 'INVALID_TOKEN' });
    }

    const claim = await this.prisma.authToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new BadRequestException({ message: 'Geçersiz veya süresi dolmuş bağlantı.', error: 'INVALID_TOKEN' });
    }

    return token;
  }

  private async createSession(userId: string, ip?: string, existingFamily?: string, userEmail?: string) {
    // Yeni cihaz tespiti: kullanıcının ilk oturumu değilse ve bu IP daha önce görülmemişse bildir
    if (ip && userEmail) {
      const existingSessions = await this.prisma.session.findMany({
        where: { userId, revokedAt: null },
        select: { ip: true },
      });
      const isKnownIp = existingSessions.some((s) => s.ip === ip);
      if (existingSessions.length > 0 && !isKnownIp) {
        this.emailService.sendNewDeviceEmail(userEmail, ip).catch((err) => {
          this.logger.error(`Yeni cihaz bildirimi gönderilemedi: ${String(err)}`);
        });
      }
    }

    const family = existingFamily ?? randomUUID();
    const sessionId = randomUUID();

    const accessToken = this.jwtService.sign(
      { sub: userId, sessionId },
      { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, sessionId, family },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: '30d' },
    );

    const refreshTokenHash = await argon2.hash(refreshToken, ARGON2_OPTIONS);

    await this.prisma.session.create({
      data: { id: sessionId, userId, refreshTokenHash, tokenFamily: family, ip, lastActiveAt: new Date() },
    });

    return { accessToken, refreshToken };
  }

  private sendVerificationEmailSilent(userId: string, email: string): void {
    this.createAuthToken(userId, AuthTokenType.EMAIL_VERIFICATION, EMAIL_VERIFICATION_TTL_MS)
      .then((rawToken) => this.emailService.sendVerificationEmail(email, rawToken))
      .catch((err) => {
        this.logger.error(`Doğrulama e-postası gönderilemedi (kullanıcı: ${userId}): ${String(err)}`);
      });
  }

  private sendPasswordResetEmailSilent(userId: string, email: string): void {
    this.createAuthToken(userId, AuthTokenType.PASSWORD_RESET, PASSWORD_RESET_TTL_MS)
      .then((rawToken) => this.emailService.sendPasswordResetEmail(email, rawToken))
      .catch((err) => {
        this.logger.error(`Şifre sıfırlama e-postası gönderilemedi (kullanıcı: ${userId}): ${String(err)}`);
      });
  }

  private sendEmailChangeTokensSilent(userId: string, oldEmail: string, newEmail: string): void {
    Promise.all([
      this.createAuthToken(userId, AuthTokenType.EMAIL_CHANGE, EMAIL_CHANGE_TTL_MS, newEmail),
      this.createAuthToken(userId, AuthTokenType.EMAIL_CHANGE_UNDO, EMAIL_CHANGE_TTL_MS, oldEmail),
    ])
      .then(([changeToken, undoToken]) =>
        Promise.all([
          this.emailService.sendEmailChangeVerification(newEmail, changeToken),
          this.emailService.sendEmailChangeUndo(oldEmail, undoToken),
        ]),
      )
      .catch((err) => {
        this.logger.error(`E-posta değişim tokenleri gönderilemedi (kullanıcı: ${userId}): ${String(err)}`);
      });
  }
}
