import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SetNotificationPrefDto } from './dto/notification-pref.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Bildirim listesi (createdAt azalan, cursor sayfalama, limit ≤50)' })
  list(
    @CurrentUser() user: { id: string },
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.notificationsService.list(user.id, cursor, limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Okunmamış bildirim sayısı' })
  unreadCount(@CurrentUser() user: { id: string }) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Get('prefs')
  @ApiOperation({ summary: 'Bildirim tercihleri (kullanıcının tüm kayıtları; varsayılandan sapanlar)' })
  getPrefs(@CurrentUser() user: { id: string }) {
    return this.notificationsService.getPrefs(user.id);
  }

  @Put('prefs')
  @ApiOperation({ summary: 'Bildirim tercihi upsert (sustur + seviye; kısmi update)' })
  setPref(@CurrentUser() user: { id: string }, @Body() dto: SetNotificationPrefDto) {
    return this.notificationsService.setPref(user.id, dto);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tüm bildirimleri okundu işaretle' })
  markAll(@CurrentUser() user: { id: string }) {
    return this.notificationsService.markAll(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tek bildirimi okundu işaretle (sahiplik; başkasınınki → 404)' })
  markOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.notificationsService.markOne(user.id, id);
  }
}
