import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PresignAvatarDto } from '../../shared/media/dto/presign-avatar.dto';
import { PresignBannerDto } from '../../shared/media/dto/presign-banner.dto';
import { SetMediaDto } from '../../shared/media/dto/set-media.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Kendi profil/gizlilik güncelle (bio, dmPolicy)' })
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get(':id/card')
  @ApiOperation({ summary: 'Kullanıcı detay kartı (ortak ortam veya ilişki zorunlu, aksi hâlde 404). guildId → rol rozetleri.' })
  getUserCard(
    @CurrentUser() user: { id: string },
    @Param('id') targetId: string,
    @Query('guildId') guildId?: string,
  ) {
    return this.usersService.getUserCard(user.id, targetId, guildId);
  }

  // ─── C8: Avatar (self) ────────────────────────────────────────────────────

  @Post('me/avatar/presign')
  @UseGuards(VerifiedEmailGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Avatar yüklemek için presigned PUT URL al (e-posta doğrulanmış gerekir)' })
  presignAvatar(@CurrentUser() user: { id: string }, @Body() dto: PresignAvatarDto) {
    return this.usersService.presignAvatar(user.id, dto.contentType);
  }

  @Patch('me/avatar')
  @UseGuards(VerifiedEmailGuard)
  @ApiOperation({ summary: 'Avatarı güncelle veya kaldır. storageKey: null → avatar siler.' })
  setAvatar(@CurrentUser() user: { id: string }, @Body() dto: SetMediaDto) {
    return this.usersService.setAvatar(user.id, dto);
  }

  // ─── C8: Profil afişi (self) ──────────────────────────────────────────────

  @Post('me/banner/presign')
  @UseGuards(VerifiedEmailGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Profil afişi yüklemek için presigned PUT URL al (e-posta doğrulanmış gerekir)' })
  presignBanner(@CurrentUser() user: { id: string }, @Body() dto: PresignBannerDto) {
    return this.usersService.presignBanner(user.id, dto.contentType);
  }

  @Patch('me/banner')
  @UseGuards(VerifiedEmailGuard)
  @ApiOperation({ summary: 'Profil afişini güncelle veya kaldır. storageKey: null → afiş siler.' })
  setBanner(@CurrentUser() user: { id: string }, @Body() dto: SetMediaDto) {
    return this.usersService.setBanner(user.id, dto);
  }
}
