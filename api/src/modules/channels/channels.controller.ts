import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ChannelsController {
  constructor(private channelsService: ChannelsService) {}

  @Post('guilds/:id/channels')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni metin kanalı oluştur (OWNER/ADMIN)' })
  create(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channelsService.create(user.id, guildId, dto);
  }

  @Get('guilds/:id/channels')
  @ApiOperation({ summary: 'Sunucu kanallarını listele (üye)' })
  findByGuild(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
  ) {
    return this.channelsService.findByGuild(user.id, guildId);
  }

  @Patch('channels/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kanal güncelle: ad ve/veya ageGated (OWNER/ADMIN)' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channelsService.update(user.id, channelId, dto);
  }

  @Delete('channels/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kanalı soft-delete et (OWNER/ADMIN); son kanal silinemez → 409 LAST_CHANNEL' })
  remove(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
  ) {
    return this.channelsService.remove(user.id, channelId);
  }

  @Post('channels/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kanalı okundu işaretle — lastReadAt=now upsert' })
  markRead(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
  ) {
    return this.channelsService.markRead(user.id, channelId);
  }
}
