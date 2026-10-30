import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StreamAnnounceConfigService } from './stream-announce-config.service';
import { PutStreamAnnounceDto } from './dto/integration.dto';

/** C36 §4 — ortam yayın duyurusu ayarı (MANAGE_WEBHOOKS) ve üye opt-in'i. */
@ApiTags('stream-announce')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guilds/:guildId/stream-announce')
export class StreamAnnounceController {
  constructor(private config: StreamAnnounceConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Duyuru ayarı (yoksa null)' })
  get(@CurrentUser() user: { id: string }, @Param('guildId') guildId: string) {
    return this.config.get(user.id, guildId);
  }

  @Put()
  @ApiOperation({ summary: 'Duyuru ayarını oluştur / güncelle' })
  put(
    @CurrentUser() user: { id: string },
    @Param('guildId') guildId: string,
    @Body() dto: PutStreamAnnounceDto,
  ) {
    return this.config.put(user.id, guildId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Duyuru ayarını kaldır (webhook yumuşak silinir)' })
  remove(@CurrentUser() user: { id: string }, @Param('guildId') guildId: string) {
    return this.config.remove(user.id, guildId);
  }

  @Put('opt-in')
  @ApiOperation({ summary: 'Bu ortamda yayınlarım duyurulsun' })
  optIn(@CurrentUser() user: { id: string }, @Param('guildId') guildId: string) {
    return this.config.optIn(user.id, guildId);
  }

  @Delete('opt-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bu ortamda yayınlarım duyurulmasın' })
  optOut(@CurrentUser() user: { id: string }, @Param('guildId') guildId: string) {
    return this.config.optOut(user.id, guildId);
  }
}
