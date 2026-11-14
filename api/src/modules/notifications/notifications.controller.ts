import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { CreatePushTokenDto } from './dto/push-token.dto';
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
  @ApiOperation({
    summary: 'Bildirim tercihleri (kullanıcının tüm kayıtları; varsayılandan sapanlar)',
  })
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

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tüm bildirimleri temizle (yalnız kendi bildirimleri silinir)' })
  clearAll(@CurrentUser() user: { id: string }) {
    return this.notificationsService.clearAll(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tek bildirimi okundu işaretle (sahiplik; başkasınınki → 404)' })
  markOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.notificationsService.markOne(user.id, id);
  }

  // ── M3 — Mobil push token kaydı (Expo) ─────────────────────────────────────

  @Post('push-tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Push token kaydet/güncelle (upsert; token unique, userId çağırandan taşınır)',
  })
  registerPushToken(@CurrentUser() user: { id: string }, @Body() dto: CreatePushTokenDto) {
    return this.notificationsService.registerPushToken(user.id, dto);
  }

  @Delete('push-tokens/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Kendi push token'ını sil (başkasınınki/yok → 404, varlık sızdırma yok)",
  })
  deletePushToken(@CurrentUser() user: { id: string }, @Param('token') token: string) {
    return this.notificationsService.deletePushToken(user.id, token);
  }
}
