import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

/** Yalnız kullandığımız yüzey (node-redis'in genel tip karmaşasından kaçınmak için). */
interface Client {
  set(key: string, value: string, options: { NX: true; EX: number }): Promise<string | null>;
  quit(): Promise<unknown>;
}

/**
 * Küçük, tembel Redis istemcisi (uygulama verisi için; Socket.IO adapter'ının kendi bağlantısı ayrı).
 * Şimdilik tek iş: "bu anahtarı ilk kez mi koyuyorum" (süzgeç/tekrar önleme). Bağlantı ilk kullanımda kurulur.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private config: ConfigService) {}

  /** `SET key 1 NX EX ttl`: anahtar yoksa koyar ve true döner; zaten varsa false. Redis hatası fırlatır. */
  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    const client = await this.getClient();
    const res = await client.set(key, '1', { NX: true, EX: ttlSeconds });
    return res === 'OK';
  }

  private getClient(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client);
    this.connecting ??= this.connect().catch((err: unknown) => {
      this.connecting = null; // bir sonraki çağrı yeniden dener
      throw err;
    });
    return this.connecting;
  }

  private async connect(): Promise<Client> {
    const url = this.config.get<string>('redis.url') ?? 'redis://localhost:6379';
    const raw = createClient({ url });
    raw.on('error', (err: unknown) => this.logger.warn(`Redis hatası: ${String(err)}`));
    await raw.connect();
    this.client = raw;
    return raw;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
