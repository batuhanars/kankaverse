import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  V2_PENDING_TTL_SECONDS,
  V2_READ_MAX_IDS,
  V2CallData,
  CallEndReason,
  V2CallEndData,
  V2MessageData,
  V2ReadData,
  v2PendingKey,
} from './push-v2';

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
  /**
   * Bildirimin sağındaki görsel (sahip kararı 2026-11-08): ortamdan gelen bildirimde ortam simgesi,
   * 1-1 DM'de karşı kullanıcının avatarı. Grup DM'de görsel yok. Herkese açık cdn adresi olmalı,
   * cihaz kendisi indiriyor. 2026-11-09'dan beri Expo mesajına KONMUYOR: `richContent.image` uygulama
   * kapalıyken Firebase'de büyük resim oluyordu. Veri-yalnız push'ta istemci bunu sol avatar olarak çizecek.
   */
  imageUrl?: string | null;
  /**
   * C50 — veri-yalnız mesaj bildirimi. Çağıran v1 alanlarını (title/body/...) VE bunu birlikte verir;
   * token başına hangisinin gideceğini `sendToUsers` seçer (bayrak + token.format + allowlist).
   */
  v2?: V2MessageData | V2CallData;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

interface ExpoMessage {
  to: string;
  title?: string;
  body?: string; // v2 (veri-yalnız) mesajda yok
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
    // C50: opsiyonel; yoksa okundu işareti tutulmaz, v1 yolu etkilenmez.
    @Optional() private redis?: RedisService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<boolean>('expoPushEnabled') === true;
  }

  /** C50 — v2 (veri-yalnız) mesaj push'u bayrağı. Çağıranlar v2 alanlarını yalnız bu açıkken üretir. */
  get v2Enabled(): boolean {
    return this.config.get<boolean>('pushV2Enabled') === true;
  }

  /** v2 bayrağı açık VE (allowlist boş VEYA kullanıcı listede). */
  private v2AllowedFor(userId: string): boolean {
    if (!this.v2Enabled) return false;
    const allow = this.config.get<string[]>('pushV2UserIds') ?? [];
    return allow.length === 0 || allow.includes(userId);
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled) return;

    const targets = [...new Set(userIds)];
    if (targets.length === 0) return;

    try {
      const tokens = await this.liveTokens({ userId: { in: targets } });
      if (tokens.length === 0) return;

      // M4a-3 §9.1 — yeni alanlar undefined kalırsa JSON.stringify onları atar; verilmediğinde
      // gövde bugünküyle birebir aynı kalır (regresyon güvencesi).
      const v2Users = new Set<string>();
      const messages: ExpoMessage[] = tokens.map((t) => {
        // C50 — kural: bayrak ∧ token.format=2 ∧ v2 verilmiş ∧ (allowlist boş ∨ alıcı listede).
        if (payload.v2 && t.format === 2 && this.v2AllowedFor(t.userId)) {
          v2Users.add(t.userId);
          return {
            to: t.token,
            data: payload.v2,
            priority: 'high' as const,
            ttl: payload.ttlSeconds,
          };
        }
        return {
          to: t.token,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          priority: payload.priority,
          channelId: payload.androidChannelId,
          categoryId: payload.categoryId,
          ttl: payload.ttlSeconds,
          tag: payload.tag,
          // imageUrl bilerek richContent'e BAĞLANMIYOR (2026-11-09): uygulama kapalıyken Firebase onu
          // büyük resim olarak başlıkla gövde arasına yayıyor. Avatar veri-yalnız push'ta istemcide çizilecek.
        };
      });

      await this.markPending(
        v2Users,
        payload.v2?.kind === 'message' ? payload.v2.conversationId : undefined,
      );

      for (const batch of chunk(messages, CHUNK_SIZE)) {
        await this.sendBatch(batch);
      }
    } catch (err) {
      // Token sorgusu dahi patlasa ana akış bozulmaz — yalnız logla.
      this.logger.warn(`Push token sorgusu başarısız: ${(err as Error).message}`);
    }
  }

  /** C50 §2.4 — v2 gönderilen kullanıcı/sohbet için işaret; "başka cihazda okundu" push'u buna bakar. */
  private async markPending(userIds: Set<string>, conversationId?: string): Promise<void> {
    if (!this.redis || !conversationId || userIds.size === 0) return;
    const redis = this.redis;
    await Promise.all(
      [...userIds].map((uid) =>
        redis.setMarker(v2PendingKey(uid, conversationId), V2_PENDING_TTL_SECONDS).catch((err) => {
          this.logger.warn(`Push işareti yazılamadı: ${(err as Error).message}`);
        }),
      ),
    );
  }

  /**
   * C50 §2.4 — başka cihazda okundu: işareti olan sohbetler için kullanıcının v2 tokenlarına
   * `{ v:2, kind:'read', conversationIds }` gider, işaret silinir. İşaret yoksa push YOK.
   * Hata ana akışı bozmaz (burada yutulur + loglanır).
   */
  async notifyRead(userId: string, conversationIds: string[]): Promise<void> {
    if (!this.enabled || !this.v2Enabled || !this.redis) return;
    const ids = [...new Set(conversationIds)];
    if (ids.length === 0) return;

    try {
      const taken = await this.redis.takeMarkers(ids.map((id) => v2PendingKey(userId, id)));
      if (taken.length === 0) return;
      const prefix = v2PendingKey(userId, '');
      const pendingIds = taken.map((k) => k.slice(prefix.length));

      const tokens = await this.liveTokens({ userId, format: 2 });
      if (tokens.length === 0) return;

      for (let i = 0; i < pendingIds.length; i += V2_READ_MAX_IDS) {
        const data: V2ReadData = {
          v: 2,
          kind: 'read',
          conversationIds: pendingIds.slice(i, i + V2_READ_MAX_IDS),
        };
        const messages: ExpoMessage[] = tokens.map((t) => ({
          to: t.token,
          data,
          priority: 'high' as const,
        }));
        for (const batch of chunk(messages, CHUNK_SIZE)) {
          await this.sendBatch(batch);
        }
      }
    } catch (err) {
      this.logger.warn(`Okundu push'u başarısız: ${(err as Error).message}`);
    }
  }

  /**
   * C53 §2.2 - arama bitti: kullanicinin YALNIZ v2 tokenlarina `{ v:2, kind:'call_end', callChannelId }`
   * (veri-yalnizca, ttl 30). Bayrak kapaliysa / allowlist disindaysa no-op; v1 cihazlar bugunku davranista kalir.
   */
  async sendCallEnd(userId: string, callChannelId: string, reason: CallEndReason): Promise<void> {
    if (!this.enabled || !this.v2AllowedFor(userId)) return;
    try {
      const tokens = await this.liveTokens({ userId, format: 2 });
      if (tokens.length === 0) return;
      const data: V2CallEndData = { v: 2, kind: 'call_end', callChannelId, reason };
      const messages: ExpoMessage[] = tokens.map((t) => ({
        to: t.token,
        data,
        priority: 'high' as const,
        ttl: 30,
      }));
      for (const batch of chunk(messages, CHUNK_SIZE)) {
        await this.sendBatch(batch);
      }
    } catch (err) {
      this.logger.warn(`Arama bitti push'u başarısız: ${(err as Error).message}`);
    }
  }

  /**
   * C53 §2.5 - grup DM aramasi: YALNIZ v2 tokenlarina `kind:'call'` (v1 cihazlara grup push'u YOK,
   * bugun de yoktu). Bayrak kapaliysa / allowlist disindaysa o alici atlanir. ttl 30.
   */
  async sendCallV2(userIds: string[], data: V2CallData): Promise<void> {
    if (!this.enabled || !this.v2Enabled) return;
    const targets = [...new Set(userIds)].filter((id) => this.v2AllowedFor(id));
    if (targets.length === 0) return;
    try {
      const tokens = await this.liveTokens({ userId: { in: targets }, format: 2 });
      const messages: ExpoMessage[] = tokens.map((t) => ({
        to: t.token,
        data,
        priority: 'high' as const,
        ttl: 30,
      }));
      for (const batch of chunk(messages, CHUNK_SIZE)) {
        await this.sendBatch(batch);
      }
    } catch (err) {
      this.logger.warn(`Grup arama push'u başarısız: ${(err as Error).message}`);
    }
  }

  /**
   * C70: tek token okuma noktası. Canlı oturumu (iptal edilmemiş) olmayan ailenin token'ı
   * kullanılmaz ve silinir: çıkış yapılmış cihaza bildirim (mesaj metni) gitmesin.
   * tokenFamily=null (eski kayıt) geçiş süresince gönderilir (PLAN.md D111).
   */
  private async liveTokens(where: Prisma.PushTokenWhereInput) {
    const tokens = await this.prisma.pushToken.findMany({ where });
    const families = [...new Set(tokens.map((t) => t.tokenFamily).filter((f): f is string => !!f))];
    if (families.length === 0) return tokens;

    const sessions = await this.prisma.session.findMany({
      where: { tokenFamily: { in: families }, revokedAt: null },
      select: { tokenFamily: true },
      distinct: ['tokenFamily'],
    });
    const live = new Set(sessions.map((s) => s.tokenFamily));
    const dead = families.filter((f) => !live.has(f));
    if (dead.length > 0) {
      // Silme hatası gönderimi bozmaz.
      await this.prisma.pushToken
        .deleteMany({ where: { tokenFamily: { in: dead } } })
        .catch((err: Error) => this.logger.warn(`Ölü push token silinemedi: ${err.message}`));
    }
    return tokens.filter((t) => !t.tokenFamily || live.has(t.tokenFamily));
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
