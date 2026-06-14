import {
  Controller,
  Post,
  Get,
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('voice')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels')
export class VoiceController {
  constructor(private voiceService: VoiceService) {}

  // C1 — Katılım token'ı (R7: erişim+yaş+karantina → audio-only grant)
  @Post(':id/voice/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ses kanalına katılım tokeni (LiveKit, audio-only)' })
  mintToken(@CurrentUser() userId: string, @Param('id') channelId: string) {
    return this.voiceService.mintToken(userId, channelId);
  }

  // C3 — Anlık katılımcılar (LiveKit room state)
  @Get(':id/voice/participants')
  @ApiOperation({ summary: 'Ses kanalındaki anlık katılımcılar' })
  listParticipants(@CurrentUser() userId: string, @Param('id') channelId: string) {
    return this.voiceService.listParticipants(userId, channelId);
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
