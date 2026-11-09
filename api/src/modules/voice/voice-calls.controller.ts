import { Controller, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CallSignalService } from '../../shared/call-signal/call-signal.service';

/**
 * C53 §2.3 — kapalı uygulamadan (bildirim düğmesi) arama reddi. Kapı WS `voice:call_reject` ile AYNI:
 * `CallSignalService.reject` (kanal üyeliği). Üye değil / kanal yok → 200 `{ ok: false }`, olay yok.
 */
@ApiTags('voice')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('voice/calls')
export class VoiceCallsController {
  constructor(private callSignal: CallSignalService) {}

  @Post(':channelId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gelen 1-1 aramayı reddet (WS voice:call_reject ile aynı kapı)' })
  async reject(@CurrentUser() user: { id: string }, @Param('channelId') channelId: string) {
    const ok = await this.callSignal.reject(channelId, user.id);
    return { ok };
  }
}
