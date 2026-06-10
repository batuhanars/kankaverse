import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guilds/:id/channels')
export class ChannelsController {
  constructor(private channelsService: ChannelsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni metin kanalı oluştur (OWNER/ADMIN)' })
  create(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channelsService.create(user.id, guildId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Sunucu kanallarını listele (üye)' })
  findByGuild(
    @CurrentUser() user: { id: string },
    @Param('id') guildId: string,
  ) {
    return this.channelsService.findByGuild(user.id, guildId);
  }
}
