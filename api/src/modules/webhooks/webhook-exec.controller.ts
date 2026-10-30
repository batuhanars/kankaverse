import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { WebhookExecService } from './webhook-exec.service';

/**
 * C35 §2.1 — gelen webhook yürütme ucu. Kimlik doğrulama YOK (JwtAuthGuard yok), tek anahtar token.
 * Mevcut `POST /voice/webhook` (LiveKit) ile ilgisi yok. Caddy `/api` önekini soyar → kamu adresi
 * `https://kankaverse.com/api/webhooks/:id/:token`. Token yola gömülü olduğu için hata gövdesindeki
 * `path` GlobalExceptionFilter'da maskelenir (§2.3).
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookExecController {
  constructor(private exec: WebhookExecService) {}

  @Post(':id/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gelen webhook: kanala mesaj yaz (Discord biçimli JSON alt kümesi)' })
  async execute(
    @Param('id') id: string,
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    // Dosya eki bu turda yok (§2.1)
    if ((req.headers['content-type'] ?? '').toLowerCase().startsWith('multipart/form-data')) {
      throw new BadRequestException({
        message: 'Dosya eki desteklenmiyor. Gövde application/json olmalı.',
        error: 'WEBHOOK_UNSUPPORTED_FORMAT',
      });
    }
    // 204: Discord istemci kütüphaneleri (ör. discord-webhook-node) yalnız 204 kabul eder. Gövde yok;
    // Express 204'te gövdeyi zaten atar, envelope muafiyeti YALNIZ bu uç için (PM kararı, sözleşme §2.6).
    await this.exec.execute(id, token, body, req.ip ?? 'unknown');
  }
}
