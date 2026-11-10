import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { maskWebhookPath } from '../utils/webhook-path.util';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Sunucu hatası oluştu.';
    let error = 'INTERNAL_ERROR';
    let retryAfter: number | undefined;
    let currentEpoch: number | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        // ThrottlerException message is an array; flatten to string
        const raw = r.message;
        message = Array.isArray(raw) ? raw.join(', ') : ((raw as string) ?? message);
        error = (r.error as string) ?? this.defaultError(statusCode);
        if (error === 'WEBHOOK_RATE_LIMITED' && typeof r.retryAfter === 'number') {
          retryAfter = r.retryAfter;
        }
        // E1: epoch çakışmasında istemci eksik commit'leri çekebilsin diye güncel epoch döner
        if (error === 'E2EE_EPOCH_CONFLICT' && typeof r.currentEpoch === 'number') {
          currentEpoch = r.currentEpoch;
        }
      } else {
        message = res;
        error = this.defaultError(statusCode);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        statusCode = HttpStatus.CONFLICT;
        message = 'Bu kayıt zaten mevcut.';
        error = 'CONFLICT';
      }
    }

    if (retryAfter !== undefined) response.setHeader('Retry-After', String(retryAfter));

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      error,
      // C35 §2.7: Discord biçimi `retry_after` (saniye, sayı) + `retryAfter`; yalnız webhook hız sınırında
      ...(retryAfter !== undefined ? { retryAfter, retry_after: retryAfter } : {}),
      ...(currentEpoch !== undefined ? { currentEpoch } : {}),
      timestamp: new Date().toISOString(),
      // C35 §2.3: gelen webhook adresindeki gizli token hata gövdesinde asla yansımaz
      path: maskWebhookPath(request.url),
    });
  }

  private defaultError(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_FAILED',
      429: 'TOO_MANY_REQUESTS',
    };
    return map[status] ?? 'INTERNAL_ERROR';
  }
}
