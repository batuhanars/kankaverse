import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

// Expo Push API — sözleşme §2.3: https://exp.host/--/api/v2/push/send, ≤100 mesaj/istek.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

export interface PushPayload {
  title?: string;
  body: string;
  // §2.4 — data: { type, guildId, channelId, messageId } (istemci yönlendirme için).
  data: {
    type: string;
    guildId?: string | null;
    channelId?: string | null;
    messageId?: string | null;
    callerId?: string | null; // M4a-3 §9.1 — yalnız type='incoming_call'
    callerName?: string | null; // M4a-3 §9.1 — yalnız type='incoming_call'
  };
  // M4a-3 §9.1 — YENİ, hepsi opsiyonel: verilmezse bugünkü davranış birebir korunur
  // (mesaj push'ı DEĞİŞMEZ). `androidChannelId` bilerek `channelId` DEĞİL: Expo mesajının
  // kendi `channelId` alanı ile `data.channelId` (bizim DM kanalımız) aynı kelimeyi taşıyor,
  // iki farklı şey — burada map'lenirken ayrışır (aşağıda `sendToUsers`).
  priority?: 'default' | 'high';
  androidChannelId?: string;
  categoryId?: string;
  ttlSeconds?: number; // Expo `ttl`
  /**
   * Expo `tag` (Android'e özel) — "An identifier for replacing notifications already displayed
   * on the device" (https://docs.expo.dev/push-notifications/sending-notifications/).
   *
   * Neden var: canlı kullanıcı geri bildirimi 2026-08-11 — yedi mesaj gölgede yedi ayrı bildirim
   * satırı üretiyordu. Aynı sohbetin bildirimi öncekinin ÜSTÜNE yazılmalı (WhatsApp davranışı).
   * İstemci tarafı bunu JS canlıyken zaten taklit ediyor (`mobile/.../push.ts`
   * `dismissStaleChannelNotifications`) ama uygulama TAMAMEN kapalıyken FCM bildirimi JS'e hiç
   * uğramadan gösterir; o boşluğu yalnız bu sunucu alanı kapatır.
   *
   * `collapseId` DEĞİL: o, iletim sırasında birleştirir; `tag` ise cihazda GÖRÜNEN bildirimin
   * yerine geçer. Bize gereken ikincisi.
   */
  tag?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

interface ExpoMessage {
  to: string;
  title?: string;
  body: string;
  data: unknown;
  priority?: 'default' | 'high';
  channelId?: string;
  categoryId?: string;
  ttl?: number;
  tag?: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * §2.3/§2.4 — Expo Push API ile gönderim.
 *
 * `sendToUsers` YENİ bir "kime gitsin" kararı vermez: alıcı listesi çağıran tarafından
 * (`NotificationsService.create`/`createMany`) zaten T&S + tercih-süzülmüş olarak gelir.
 * Burada yalnız o kümenin token'larına dağıtım yapılır (§2.4 — süzgeç kopyası yasağı).
 *
 * Yeni bağımlılık yok: global `fetch` (Node ≥18) yeterli.
 * Gönderim ana akışı ASLA bloke etmez/bozmaz: her hata sessizce yutulur + loglanır.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<boolean>('expoPushEnabled') === true;
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled) return;

    const targets = [...new Set(userIds)];
    if (targets.length === 0) return;

    try {
      const tokens = await this.prisma.pushToken.findMany({
        where: { userId: { in: targets } },
      });
      if (tokens.length === 0) return;

      // M4a-3 §9.1 — yeni alanlar undefined kalırsa JSON.stringify onları atar; verilmediğinde
      // gövde bugünküyle birebir aynı kalır (regresyon güvencesi).
      const messages: ExpoMessage[] = tokens.map((t) => ({
        to: t.token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        priority: payload.priority,
        channelId: payload.androidChannelId,
        categoryId: payload.categoryId,
        ttl: payload.ttlSeconds,
        tag: payload.tag,
      }));

      for (const batch of chunk(messages, CHUNK_SIZE)) {
        await this.sendBatch(batch);
      }
    } catch (err) {
      // Token sorgusu dahi patlasa ana akış bozulmaz — yalnız logla.
      this.logger.warn(`Push token sorgusu başarısız: ${(err as Error).message}`);
    }
  }

  private async sendBatch(batch: ExpoMessage[]): Promise<void> {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        this.logger.warn(`Expo push isteği başarısız: HTTP ${res.status}`);
        return;
      }

      const json = (await res.json()) as { data?: ExpoTicket[] };
      await this.handleTickets(batch, json?.data ?? []);
    } catch (err) {
      // Ağ hatası/5xx → sessiz yut + logla (§2.3)
      this.logger.warn(`Expo push isteği atılamadı: ${(err as Error).message}`);
    }
  }

  /** DeviceNotRegistered dönen token'lar silinir — ölü token birikmesin (§2.3). */
  private async handleTickets(batch: ExpoMessage[], tickets: ExpoTicket[]): Promise<void> {
    const deadTokens = tickets
      .map((ticket, i) => ({ ticket, token: batch[i]?.to }))
      .filter(
        ({ ticket }) =>
          ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered',
      )
      .map(({ token }) => token)
      .filter((t): t is string => !!t);

    if (deadTokens.length > 0) {
      await this.prisma.pushToken.deleteMany({ where: { token: { in: deadTokens } } });
    }
  }
}
