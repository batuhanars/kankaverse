import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const statusCode = context.switchToHttp().getResponse<Response>().statusCode;
    return next.handle().pipe(
      map((data: unknown) => ({
        success: true,
        statusCode,
        data: data ?? null,
      })),
    );
  }
}
