import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GuildsService } from './guilds.service';
import { DiscordImportService } from './discord-import.service';
import { ImportDiscordTemplateDto } from './dto/import-discord-template.dto';
import { CreateGuildDto } from './dto/create-guild.dto';
import { UpdateGuildDto } from './dto/update-guild.dto';
import { PresignIconDto } from './dto/presign-icon.dto';
import { SetIconDto } from './dto/set-icon.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { BanMemberDto } from './dto/ban-member.dto';
import { KickMemberDto } from './dto/kick-member.dto';
import { InviteFriendDto } from './dto/invite-friend.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../../common/guards/verified-email.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('guilds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guilds')
export class GuildsController {
  constructor(
    private guildsService: GuildsService,
    private discordImport: DiscordImportService,
    private config: ConfigService,
  ) {}

  @Post()
  @UseGuards(VerifiedEmailGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni sunucu oluştur (guild + owner member + #genel-sohbet); e-posta doğrulanmış gerekir' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateGuildDto) {
    return this.guildsService.create(user.id, dto);
  }

  // Statik yol — :id param route'larından ÖNCE (çakışmaması için)
  @Get('import/discord-template')
  @ApiOperation({ summary: 'Discord şablon göçü açık mı (UI gating)' })
  discordImportStatus() {
    return { enabled: this.config.get<boolean>('discordImportEnabled') === true };
  }

  @Post('import/discord-template')
  @UseGuards(VerifiedEmailGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Discord sunucu şablonundan Ortam oluştur (yalnız yapı; bayrak arkasında)' })
  importDiscordTemplate(@CurrentUser() user: { id: string }, @Body() dto: ImportDiscordTemplateDto) {
    if (this.config.get<boolean>('discordImportEnabled') !== true) {
      throw new ForbiddenException({ message: 'Discord göçü şu anda kapalı.', error: 'FEATURE_DISABLED' });
    }
    return this.discordImport.importTemplate(user.id, dto.template, dto.name);
  }

  @Get()
  @ApiOperation({ summary: 'Üye olunan sunucuları listele' })
  findMyGuilds(@CurrentUser() user: { id: string }) {
    return this.guildsService.findMyGuilds(user.id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Ortam üye listesini getir (yalnız üyeler görebilir); rol önceliği OWNER>ADMIN>MEMBER, sonra username' })
  getMembers(@CurrentUser() user: { id: string }, @Param('id') guildId: string) {
    return this.guildsService.getMembers(user.id, guildId);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ortam ayarlarını güncelle: ad ve/veya adultsOnly (yalnız OWNER)' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: UpdateGuildDto,
  ) {
    return this.guildsService.update(user.id, guildId, dto);
  }

  @Post(':id/icon/presign')
  @UseGuards(VerifiedEmailGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ortam ikonu yüklemek için presigned PUT URL al (yalnız OWNER)' })
  presignIcon(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: PresignIconDto,
  ) {
    return this.guildsService.presignIcon(user.id, guildId, dto);
  }

  @Patch(':id/icon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ortam ikonunu güncelle veya kaldır (yalnız OWNER). storageKey: null → ikon siler.' })
  setIcon(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: SetIconDto,
  ) {
    return this.guildsService.setIcon(user.id, guildId, dto);
  }

  @Post(':id/join-discovery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Keşfet üzerinden ortama katıl (discoverable zorunlu + Sprint 7A yaş/ban/üyelik kapısı).' })
  joinDiscovery(@CurrentUser() user: { id: string }, @Param('id') guildId: string) {
    return this.guildsService.joinDiscovery(user.id, guildId);
  }

  // ─── §A: Ortam silme ──────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ortamı sil (soft-delete; yalnız OWNER). Dönüş null.' })
  deleteGuild(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
  ) {
    return this.guildsService.deleteGuild(user.id, guildId);
  }

  // ─── §B: Rol değiştir ─────────────────────────────────────────────────────

  @Patch(':id/members/:userId/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Üye rolünü değiştir (yalnız OWNER; ADMIN|MEMBER; OWNER rolü atılamaz).' })
  updateMemberRole(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.guildsService.updateMemberRole(user.id, guildId, targetUserId, dto);
  }

  // ─── §C: Üye at (kick) ───────────────────────────────────────────────────

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Üyeyi ortamdan at (OWNER: ADMIN/MEMBER; ADMIN: yalnız MEMBER). Dönüş null.' })
  kickMember(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: KickMemberDto,
  ) {
    return this.guildsService.kickMember(user.id, guildId, targetUserId, dto.reason);
  }

  // ─── §D: Ortamdan ayrıl ───────────────────────────────────────────────────

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ortamdan ayrıl (OWNER ayrılamaz; önce devret/sil). Dönüş null.' })
  leaveGuild(@CurrentUser() user: { id: string }, @Param('id') guildId: string) {
    return this.guildsService.leaveGuild(user.id, guildId);
  }

  // ─── §E: Sahiplik devri ───────────────────────────────────────────────────

  @Post(':id/members/:userId/transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ortam sahipliğini devret (yalnız OWNER; hedef OWNER, eski sahip ADMIN olur). Dönüş null.' })
  transferOwnership(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.guildsService.transferOwnership(user.id, guildId, targetUserId);
  }

  // ─── §F: Ortam-ban ────────────────────────────────────────────────────────

  @Post(':id/members/:userId/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Üyeyi kalıcı yasakla (kick + tekrar davetle giremez). Hiyerarşi kick ile aynı. Dönüş null.' })
  banMember(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: BanMemberDto,
  ) {
    return this.guildsService.banMember(user.id, guildId, targetUserId, dto.reason);
  }

  @Get(':id/bans')
  @ApiOperation({ summary: 'Yasaklı kullanıcılar listesi (OWNER/ADMIN).' })
  listBans(@CurrentUser() user: { id: string }, @Param('id') guildId: string) {
    return this.guildsService.listBans(user.id, guildId);
  }

  @Delete(':id/bans/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yasağı kaldır (OWNER/ADMIN). Dönüş null.' })
  unbanMember(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.guildsService.unbanMember(user.id, guildId, targetUserId);
  }

  // ─── §H: Kankayı ortama davet (kalıcı GUILD_INVITE bildirimi) ─────────────

  @Post(':id/invite-friend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kankayı ortama davet et: hedefe kalıcı GUILD_INVITE bildirimi düşer (CREATE_INVITE + arkadaşlık şart). Dönüş null.' })
  inviteFriend(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: InviteFriendDto,
  ) {
    return this.guildsService.inviteFriend(user.id, guildId, dto);
  }

  // ─── §G: Denetim kaydı okuma ──────────────────────────────────────────────

  @Get(':id/audit-logs')
  @ApiOperation({ summary: 'Ortam denetim kaydını getir (owner veya MANAGE_GUILD). limit varsayılan 50, max 100; before = cursor (auditLog id).' })
  getAuditLogs(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('before') before?: string,
  ) {
    return this.guildsService.getAuditLogs(user.id, guildId, { limit, before });
  }
}
