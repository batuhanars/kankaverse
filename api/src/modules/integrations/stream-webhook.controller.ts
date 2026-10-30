import { Controller, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { StreamEventsService } from './stream-events.service';

/**
 * C36 §3 — Kick/Twitch olay alıcısı (kimliksiz; yetki = imza). Ham gövde `main.ts`'te yalnız bu iki yol
 * için Buffer olarak bırakılır. `@Res()` ile yanıt elle verilir: Twitch `challenge` düz metin ister
 * (envelope olmaz), olaylar için hızlı 2xx (gövdesiz).
 */
@ApiTags('integrations')
@SkipThrottle()
@Controller('integrations')
export class StreamWebhookController {
  constructor(private events: StreamEventsService) {}

  @Post(':provider/webhook')
  @ApiOperation({ summary: 'Sağlayıcı olay alıcısı (imza doğrulanır, geçersiz imza 401)' })
  async receive(@Param('provider') provider: string, @Req() req: Request, @Res() res: Response) {
    const raw: unknown = req.body;
    const outcome = await this.events.handle(
      provider,
      req.headers,
      Buffer.isBuffer(raw) ? raw : null,
    );
    if (outcome.kind === 'challenge') {
      res.status(HttpStatus.OK).type('text/plain').send(outcome.challenge);
      return;
    }
    res.status(HttpStatus.NO_CONTENT).end();
  }
}
