import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GuildsService } from './guilds.service';
import { AdminGuildDto } from './dto/admin-guild.dto';

/** C48 (R7) — platform yöneticisinin ortam listesi, katılımı ve silmesi; yalnız platform admini. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/guilds')
export class AdminGuildsController {
  constructor(private guildsService: GuildsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Silinmemiş tüm ortamlar, en yeni önce (en çok 500).' })
  @ApiOkResponse({ type: [AdminGuildDto] })
  listGuilds(): Promise<AdminGuildDto[]> {
    return this.guildsService.adminListGuilds();
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '[Admin] Ortama katıl (discoverable şartı yok; yaş/ban/üyelik kapıları geçerli). GuildDto.',
  })
  joinGuild(@CurrentUser() admin: { id: string }, @Param('id') guildId: string) {
    return this.guildsService.adminJoinGuild(admin.id, guildId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Ortamı sil (soft-delete, OWNER şartı yok). Dönüş null.' })
  deleteGuild(@CurrentUser() admin: { id: string }, @Param('id') guildId: string) {
    return this.guildsService.adminDeleteGuild(admin.id, guildId);
  }
}
