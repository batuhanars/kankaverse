import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StreamProvidersRegistry } from './stream-providers.registry';
import { StreamAnnouncerService } from './stream-announcer.service';

/** Mesaj kimliği tekilleştirme süresi (§3): platformlar en az bir kez teslim eder. */
export const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_AT = 5000;

export type WebhookOutcome = { kind: 'challenge'; challenge: string } | { kind: 'accepted' };

/**
 * C36 §3 (R7) — Kick/Twitch olay alıcısı. Sıra: imza + zaman damgası (adaptör) → tekilleştirme → HIZLI
 * 2xx; iş arka planda. Tekilleştirme imzadan SONRA yapılır: sahte istek kimlik havuzunu zehirleyemez.
 * Bellek içi (tek API örneği); yeniden başlatmada kayıp, 30 dk duyuru kapısı (§5.2) tekrarı yine keser.
 */
@Injectable()
export class StreamEventsService {
  private readonly logger = new Logger(StreamEventsService.name);
  private readonly seen = new Map<string, number>();

  constructor(
    private providers: StreamProvidersRegistry,
    private announcer: StreamAnnouncerService,
  ) {}

  async handle(
    providerKey: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | null,
  ): Promise<WebhookOutcome> {
    const provider = this.providers.find(providerKey);
    if (!provider || !provider.isEnabled()) {
      throw new NotFoundException({ message: 'Bağlantı bulunamadı.', error: 'PROVIDER_NOT_FOUND' });
    }
    // Ham gövde yoksa imza doğrulanamaz: adaptör boş gövdede de imzayı reddeder
    const event = await provider.verifyWebhook(headers, rawBody ?? Buffer.alloc(0));

    if (event.type === 'challenge') return { kind: 'challenge', challenge: event.challenge };
    if (this.isDuplicate(`${provider.key}:${event.messageId}`)) return { kind: 'accepted' };

    switch (event.type) {
      case 'online':
        void this.announcer
          .onOnline(provider, event.externalId, event.title)
          .catch((err: unknown) => this.logger.error(`${provider.key} duyuru işi hatası`, err));
        break;
      case 'offline':
        void this.announcer
          .onOffline(provider, event.externalId)
          .catch((err: unknown) => this.logger.error(`${provider.key} bitiş işi hatası`, err));
        break;
      case 'revocation':
        // Yeniden açmayı günlük uzlaştırma işi dener (§3)
        this.logger.warn(`${provider.key} aboneliği platform tarafından iptal edildi`);
        break;
      default:
        break;
    }
    return { kind: 'accepted' };
  }

  private isDuplicate(key: string, now = Date.now()): boolean {
    const expiry = this.seen.get(key);
    if (expiry !== undefined && expiry > now) return true;
    this.seen.set(key, now + DEDUPE_TTL_MS);
    if (this.seen.size > SWEEP_AT) {
      for (const [k, exp] of this.seen) if (exp <= now) this.seen.delete(k);
    }
    return false;
  }
}
