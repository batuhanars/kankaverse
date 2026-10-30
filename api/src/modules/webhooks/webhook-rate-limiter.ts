import { Injectable } from '@nestjs/common';

export interface RateWindow {
  windowMs: number;
  max: number;
}

/**
 * C35 §2.7 — bellek içi kayan pencere sınırlayıcı (webhook başına 2 sn'de 5 + dakikada 30; IP başına
 * dakikada 60). Anahtar başına son istek zamanları tutulur. Tek API örneği için yeterli; birden çok
 * örnek olursa sınır örnek başına işler (Redis'e taşımak ayrı karar).
 * Reddedilen istek pencereyi DOLDURMAZ (saldırgan kendi sayacını şişirip kapıyı uzatamaz).
 */
@Injectable()
export class WebhookRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private static readonly SWEEP_AT = 5000;
  private static readonly LONGEST_WINDOW_MS = 60_000;

  /** @returns 0 = izin verildi (istek sayıldı); >0 = reddedildi, kaç saniye sonra denenmeli */
  check(key: string, windows: RateWindow[], now = Date.now()): number {
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < WebhookRateLimiter.LONGEST_WINDOW_MS,
    );

    let retryAfterMs = 0;
    for (const w of windows) {
      const inWindow = recent.filter((t) => now - t < w.windowMs);
      if (inWindow.length >= w.max) {
        // pencerede (max). en eski sayılan istek düşünce yer açılır
        const unblockAt = inWindow[inWindow.length - w.max] + w.windowMs;
        retryAfterMs = Math.max(retryAfterMs, unblockAt - now);
      }
    }
    if (retryAfterMs > 0) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil(retryAfterMs / 1000));
    }

    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > WebhookRateLimiter.SWEEP_AT) this.sweep(now);
    return 0;
  }

  private sweep(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= WebhookRateLimiter.LONGEST_WINDOW_MS)) {
        this.hits.delete(key);
      }
    }
  }
}
