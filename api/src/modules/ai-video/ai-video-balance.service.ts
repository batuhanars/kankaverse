import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiVideoError } from './ai-video.constants';
import {
  AI_VIDEO_MESSAGES,
  DEFAULT_CREDIT_MICRO_USD,
  floorCredits,
  toCredits,
  usd,
} from './ai-video.mapper';
import { AiVideoGrantsService } from './ai-video-grants.service';
import { PikaClient } from './pika.client';

export const AI_BALANCE_TTL_MS = 60_000;

export interface AiVideoBalanceDto {
  balanceUsd: number;
  balanceCredits: number;
  outstandingCredits: number;
  fetchedAt: string;
}

/** C45 — admin için Pika bakiyesi (salt okuma, 60 sn bellek önbelleği; hata önbelleğe alınmaz). */
@Injectable()
export class AiVideoBalanceService {
  private readonly logger = new Logger(AiVideoBalanceService.name);
  private cache: { body: AiVideoBalanceDto; expiresAt: number } | null = null;

  constructor(
    private pika: PikaClient,
    private grants: AiVideoGrantsService,
    private config: ConfigService,
  ) {}

  async get(): Promise<AiVideoBalanceDto> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.body;
    const credit = this.config.get<number>('aiVideo.creditMicroUsd') ?? DEFAULT_CREDIT_MICRO_USD;
    let balanceMicroUsd: number;
    try {
      ({ balanceMicroUsd } = await this.pika.getBalance());
    } catch (err) {
      this.logger.warn(`Pika bakiye çağrısı başarısız: ${(err as Error).message}`);
      throw new ServiceUnavailableException({
        message: AI_VIDEO_MESSAGES[AiVideoError.PROVIDER_ERROR],
        error: AiVideoError.PROVIDER_ERROR,
      });
    }
    const body: AiVideoBalanceDto = {
      balanceUsd: usd(balanceMicroUsd),
      balanceCredits: floorCredits(balanceMicroUsd, credit),
      outstandingCredits: toCredits(await this.grants.outstandingMicro(), credit),
      fetchedAt: new Date().toISOString(),
    };
    this.cache = { body, expiresAt: Date.now() + AI_BALANCE_TTL_MS };
    return body;
  }
}
