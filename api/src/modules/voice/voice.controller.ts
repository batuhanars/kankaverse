import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { VoiceService } from './voice.service';
import { MoveParticipantDto } from './dto/move-participant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('voice')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels')
export class VoiceController {
  constructor(private voiceService: VoiceService) {}

  // C1 — Katılım token'ı (R7: erişim+yaş+karantina → audio + koşullu video grant)
  // Sprint C4: dönüşe canPublishCamera + canPublishScreen eklendi (BUILD-DARK: bayraklar false → false).
  @Post(':id/voice/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ses kanalına katılım tokeni (LiveKit; audio + koşullu video/ekran, BUILD-DARK)' })
  mintToken(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.voiceService.mintToken(user.id, channelId);
  }

  // C3 — Anlık katılımcılar (LiveKit room state)
  @Get(':id/voice/participants')
  @ApiOperation({ summary: 'Ses kanalındaki anlık katılımcılar' })
  listParticipants(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.voiceService.listParticipants(user.id, channelId);
  }
}

/**
 * R11 — Ses kanalı moderasyonu (sustur + taşı). T&S → R7 incelemesi.
 * Yetki kapıları service'te (MUTE_MEMBERS / MOVE_MEMBERS). Envelope otomatik, data: null.
 */
@ApiTags('voice')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('voice')
export class VoiceModerationController {
  constructor(private voiceService: VoiceService) {}

  // Sustur (kalıcı/server-mute) — MUTE_MEMBERS
  @Post(':channelId/mute/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ses kanalında katılımcıyı kalıcı sustur (MUTE_MEMBERS)' })
  async mute(
    @CurrentUser() user: { id: string },
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
  ) {
    await this.voiceService.muteParticipant(user.id, channelId, userId);
    return null;
  }

  // Susturmayı kaldır — MUTE_MEMBERS
  @Delete(':channelId/mute/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ses kanalında susturmayı kaldır (MUTE_MEMBERS)' })
  async unmute(
    @CurrentUser() user: { id: string },
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
  ) {
    await this.voiceService.unmuteParticipant(user.id, channelId, userId);
    return null;
  }

  // Taşı (tam taşı) — MOVE_MEMBERS
  @Post(':channelId/move/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Katılımcıyı başka ses kanalına taşı (MOVE_MEMBERS)' })
  async move(
    @CurrentUser() user: { id: string },
    @Param('channelId') channelId: string,
    @Param('userId') userId: string,
    @Body() dto: MoveParticipantDto,
  ) {
    await this.voiceService.moveParticipant(user.id, channelId, userId, dto.targetChannelId);
    return null;
  }
}

/**
 * C2 — LiveKit webhook (R7). JwtAuthGuard YOK; LiveKit imza doğrulaması ile korunur.
 * Ham gövde main.ts'te bu route için express.raw ile yakalanır (req.body = Buffer).
 */
@ApiTags('voice')
@Controller('voice')
export class VoiceWebhookController {
  constructor(private voiceService: VoiceService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'LiveKit webhook (imzalı; presence + VoiceSession audit)' })
  async webhook(@Req() req: Request, @Headers('authorization') auth: string | undefined) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    await this.voiceService.handleWebhook(raw, auth);
    return { received: true };
  }
}
