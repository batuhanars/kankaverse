import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DmService } from './dm.service';
import { CreateDmChannelDto } from './dto/create-dm-channel.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('dm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DmController {
  constructor(private dmService: DmService) {}

  @Get('channels')
  @ApiOperation({ summary: 'DM kanalları (son mesaj + unread + canMessage + selfBlocked). G4: temizlenmiş kanallar filtrelenir.' })
  getDmChannels(@CurrentUser() user: { id: string }) {
    return this.dmService.getDmChannels(user.id);
  }

  @Post('channels')
  @Throttle({ default: { ttl: 3600000, limit: 30 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'DM kanalı aç (canDm kontrolü); mevcut kanal varsa döndür' })
  createDmChannel(@CurrentUser() user: { id: string }, @Body() dto: CreateDmChannelDto) {
    return this.dmService.getOrCreateDmChannel(user.id, dto);
  }

  @Delete('channels/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'G4 inbox soft-delete: DM kaydı çağıranın listesinden temizlenir, mesajlar DB\'de durur' })
  clearChannel(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.dmService.clearDmChannel(user.id, channelId);
  }

  @Post('channels/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'DM kanalını okundu işaretle (lastReadAt = now)' })
  markRead(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.dmService.markRead(user.id, channelId);
  }
}
