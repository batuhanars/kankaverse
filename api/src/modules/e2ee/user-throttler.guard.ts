import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Hız sınırı izleyicisi IP yerine kullanıcı kimliği. JwtAuthGuard'dan SONRA çalışmalı (req.user dolu). */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    return Promise.resolve(user?.id ?? (req.ip as string));
  }
}
