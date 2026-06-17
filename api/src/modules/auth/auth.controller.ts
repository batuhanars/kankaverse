import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Login2faDto } from './dto/login-2fa.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Setup2faDto } from './dto/setup-2fa.dto';
import { Enable2faDto } from './dto/enable-2fa.dto';
import { Disable2faDto } from './dto/disable-2fa.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangeUsernameDto } from './dto/change-username.dto';
import { ConfirmTokenDto } from './dto/confirm-token.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const REFRESH_COOKIE = 'refresh_token';
// Cookie SameSite stratejisi deploy topolojisine bağlı (R7 — auth/oturum yüzeyi):
//  - Aynı-site (subdomain: app./api.kankaverse.com) → 'lax' (varsayılan), Secure yalnız prod.
//  - Çapraz-site (düz *.vercel.app + *.railway.app) → COOKIE_SAMESITE=none; tarayıcı 'none' için Secure ZORUNLU kılar.
// Topoloji değişince (subdomain'e geçiş) yalnız env kaldırılır — kod değişmez.
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE as 'lax' | 'none' | 'strict' | undefined) ?? 'lax';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || COOKIE_SAMESITE === 'none',
  sameSite: COOKIE_SAMESITE,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

type AuthUser = { id: string; sessionId: string; emailVerifiedAt: Date | null };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ── Temel auth ─────────────────────────────────────────────────────────────

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Yeni kullanıcı kaydı (3/dk/IP)' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.authService.register(dto, req.ip);
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
    return { user, accessToken };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Kullanıcı girişi; 2FA etkinse challenge döner (5/dk/IP)' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, req.ip);
    if (result.type === 'challenge') {
      return { twoFactorRequired: true, challengeToken: result.challengeToken };
    }
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: '2FA doğrulama (TOTP veya kurtarma kodu) (5/dk/IP)' })
  async login2fa(
    @Body() dto: Login2faDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.authService.login2fa(dto, req.ip);
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
    return { user, accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Access token yenileme (refresh cookie)' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken: string = req.cookies?.[REFRESH_COOKIE];
    const { accessToken, refreshToken } = await this.authService.refresh(rawToken, req.ip);
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
    return { accessToken };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Oturumu kapat' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.sessionId);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return null;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mevcut kullanıcı bilgisi' })
  async me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  // ── E-posta doğrulama ──────────────────────────────────────────────────────

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: 'E-posta doğrulama (10/saat/IP)' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Doğrulama e-postasını yeniden gönder (5/saat)' })
  async resendVerification(@CurrentUser() user: AuthUser) {
    return this.authService.resendVerification(user.id);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Şifre sıfırlama linki gönder — sızdırmaz (3/saat/IP)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: 'Şifre sıfırla + tüm oturumları düşür (10/saat/IP)' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ── 2FA ────────────────────────────────────────────────────────────────────

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: '2FA kurulumu başlat (QR + secret) — reauth (10/saat)' })
  async setup2fa(@CurrentUser() user: AuthUser, @Body() dto: Setup2faDto) {
    return this.authService.setup2fa(user.id, dto);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: '2FA etkinleştir (TOTP kodu doğrula → kurtarma kodları döner)' })
  async enable2fa(@CurrentUser() user: AuthUser, @Body() dto: Enable2faDto) {
    return this.authService.enable2fa(user.id, dto);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: '2FA kapat — reauth (şifre + TOTP) zorunlu (10/saat)' })
  async disable2fa(@CurrentUser() user: AuthUser, @Body() dto: Disable2faDto) {
    return this.authService.disable2fa(user.id, dto);
  }

  // ── Oturumlar ──────────────────────────────────────────────────────────────

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aktif oturumları listele (current işaretli)' })
  async getSessions(@CurrentUser() user: AuthUser) {
    return this.authService.getSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Belirli bir oturumu kapat' })
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id') sessionId: string) {
    return this.authService.revokeSession(user.id, sessionId);
  }

  @Post('sessions/revoke-others')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mevcut oturum hariç tüm oturumları kapat' })
  async revokeOtherSessions(@CurrentUser() user: AuthUser) {
    return this.authService.revokeOtherSessions(user.id, user.sessionId);
  }

  // ── Şifre / E-posta değişimi ───────────────────────────────────────────────

  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Şifre değiştir — reauth; diğer oturumlar düşer (5/saat)' })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, user.sessionId, dto);
  }

  @Post('email/change')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'E-posta değiştir — reauth; yeni adrese doğrulama + eski adrese geri-al (5/saat)' })
  async changeEmail(@CurrentUser() user: AuthUser, @Body() dto: ChangeEmailDto) {
    return this.authService.changeEmail(user.id, dto);
  }

  @Post('username/change')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Kullanıcı adı değiştir — reauth (mevcut şifre + opsiyonel TOTP) (5/saat)' })
  async changeUsername(@CurrentUser() user: AuthUser, @Body() dto: ChangeUsernameDto) {
    return this.authService.changeUsername(user.id, dto);
  }

  @Post('email/change/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: 'Yeni e-postayı doğrula (10/saat/IP)' })
  async confirmEmailChange(@Body() dto: ConfirmTokenDto) {
    return this.authService.confirmEmailChange(dto.token);
  }

  @Post('email/change/undo')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: 'E-posta değişimini geri al + tüm oturumları düşür (10/saat/IP)' })
  async undoEmailChange(@Body() dto: ConfirmTokenDto) {
    return this.authService.undoEmailChange(dto.token);
  }

  // ── Hesap silme ────────────────────────────────────────────────────────────

  @Post('account/delete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Hesap silme talebi — reauth; 30 gün grace (3/saat)' })
  async deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.authService.deleteAccount(user.id, dto);
  }

  @Post('account/delete/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hesap silme talebini iptal et (deaktif oturum istisnası)' })
  async cancelAccountDeletion(@CurrentUser() user: AuthUser) {
    return this.authService.cancelAccountDeletion(user.id);
  }
}
