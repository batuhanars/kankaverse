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
import { AddChannelMemberDto } from './dto/add-channel-member.dto';
import { ReorderChannelsDto } from './dto/reorder-channels.dto';
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

  @Patch('guilds/:id/channels/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kanalları toplu sırala/taşı (drag-reorder; OWNER/ADMIN). Dönüş null.' })
  reorderChannels(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: ReorderChannelsDto,
  ) {
    return this.channelsService.reorderChannels(user.id, guildId, dto.items);
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

  @Post('channels/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Üyesi olunan tüm guild kanallarını okundu işaretle (toplu). Dönüş null.' })
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.channelsService.markAllRead(user.id);
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

  // ─── Özel kanal üye yönetimi (Sprint V2 §1) ────────────────────────────────

  @Get('channels/:id/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Özel kanalın üyelerini listele (OWNER/ADMIN); genel kanalda boş []' })
  getChannelMembers(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
  ) {
    return this.channelsService.getChannelMembers(user.id, channelId);
  }

  @Post('channels/:id/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Özel kanala guild üyesi ekle (OWNER/ADMIN; idempotent)' })
  addChannelMember(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Body() dto: AddChannelMemberDto,
  ) {
    return this.channelsService.addChannelMember(user.id, channelId, dto);
  }

  @Delete('channels/:id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Özel kanaldan üye çıkar (OWNER/ADMIN; no-op eğer yoksa)' })
  removeChannelMember(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.channelsService.removeChannelMember(user.id, channelId, targetUserId);
  }
}
