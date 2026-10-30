import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { MessagesGateway } from '../messages/gateway/messages.gateway';
import { WebhooksService } from './webhooks.service';
import { WebhookRateLimiter } from './webhook-rate-limiter';
import { parseEmbeds } from './webhook-embed.util';
import { isReservedWebhookName } from './webhook-name.util';
import { webhookTokenMatches } from './webhook-token.util';

const CONTENT_MAX = 2000;
const USERNAME_MAX = 32;
/** lastUsedAt dakikada en çok bir kez yazılır (§2.8). */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

const WEBHOOK_WINDOWS = [
  { windowMs: 2_000, max: 5 },
  { windowMs: 60_000, max: 30 },
];
const IP_WINDOWS = [{ windowMs: 60_000, max: 60 }];

function badBody(message: string): never {
  throw new BadRequestException({ message, error: 'INVALID_BODY' });
}

function rateLimited(retryAfter: number): never {
  throw new HttpException(
    {
      message: `Çok fazla istek. ${retryAfter} saniye sonra tekrar deneyin.`,
      error: 'WEBHOOK_RATE_LIMITED',
      retryAfter,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * C35 §2-§3 (R7) — gelen webhook yürütmesi. Kimlik doğrulama YOK; tek anahtar URL'deki token.
 * Gövde Discord'un alt kümesidir: bilinmeyen alanlar sessizce yok sayılır (`avatar_url`, `tts`,
 * `flags`, `components`, ... hiç okunmaz). Kapılar MessagesService/WebhooksService çekirdeğinden gelir.
 */
@Injectable()
export class WebhookExecService {
  private readonly logger = new Logger(WebhookExecService.name);

  constructor(
    private prisma: PrismaService,
    private webhooks: WebhooksService,
    private messages: MessagesService,
    private gateway: MessagesGateway,
    private limiter: WebhookRateLimiter,
  ) {}

  async execute(
    webhookId: string,
    token: string,
    body: unknown,
    clientIp: string,
  ): Promise<{ id: string }> {
    // 1) IP sınırı: token aramadan ÖNCE (tahmin denemesi de sayılır)
    const ipWait = this.limiter.check(`ip:${clientIp}`, IP_WINDOWS);
    if (ipWait > 0) rateLimited(ipWait);

    // 2) Token: yok / silinmiş / uyuşmuyor → HEPSİ AYNI 404 (var-yok sızdırılmaz)
    const webhook = await this.authenticate(webhookId, token);

    // 3) Webhook başına sınır: yalnız doğrulanmış çağrı sayılır (başkasının kovasını yakamaz)
    const whWait = this.limiter.check(`wh:${webhook.id}`, WEBHOOK_WINDOWS);
    if (whWait > 0) rateLimited(whWait);

    // 4) Gövde (Discord alt kümesi)
    const payload = this.parseBody(body, webhook.name);

    // 5) Oluşturan hâlâ yetkili mi (§3.1) + kanal (§3.2)
    const sender = await this.webhooks.resolveSender(webhook);
    if (!sender.ok) {
      if (sender.reason === 'CHANNEL_GONE') this.notFound();
      throw new ForbiddenException({
        message: 'Bu webhook devre dışı. Oluşturanın yetkisi kalmadı.',
        error: 'WEBHOOK_DISABLED',
      });
    }
    const channel = sender.channel;

    // 6) Automod: content + username + tüm embed metinleri tek tek (§3.3)
    this.messages.assertTextsAllowed([
      payload.content,
      payload.username ?? '',
      ...payload.embedTexts,
    ]);

    // 7) Bahsetme (§3.4): OLUŞTURANIN kimliğiyle çözülür; kullanıcı bahsetmesi çözülmez
    const resolved = await this.messages.resolveMentions(
      channel,
      payload.content,
      webhook.createdById,
      // §3.4: kullanıcı bahsetmesi çözülmez; düz metin `@everyone` yalnız webhook yolunda çözülür
      { resolveUsers: false, plainEveryone: true },
    );
    const mentionsEveryone = resolved.mentionsEveryone && payload.parse.everyone;
    const mentionRoles = payload.parse.roles ? resolved.mentionRoles : [];

    // 8) Yaz + yay (normal gönderimle aynı olaylar)
    const message = await this.messages.createWebhookMessage(channel, {
      creatorId: webhook.createdById,
      webhookId: webhook.id,
      webhookName: payload.username ?? webhook.name,
      content: payload.content,
      embeds:
        payload.embeds.length > 0 ? (payload.embeds as unknown as Prisma.InputJsonValue) : null,
      mentionsEveryone,
      mentionRoles,
    });
    this.gateway.broadcastMessage(channel.id, message);
    void this.notifyAfterSend(channel.id, message).catch((err: unknown) =>
      this.logger.error(`Webhook sonrası bildirim hatası (kanal ${channel.id})`, err),
    );
    void this.touchLastUsed(webhook.id).catch((err: unknown) =>
      this.logger.error(`Webhook lastUsedAt yazılamadı (${webhook.id})`, err),
    );

    return { id: message.id };
  }

  /**
   * §2.2 — token doğrulama. Silinmiş ya da olmayan webhook için de sabit zamanlı karşılaştırma
   * çalıştırılır (`webhookTokenMatches` sahte özetle) ve üç durum da aynı 404'ü verir.
   */
  private async authenticate(webhookId: string, token: string) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    const live = webhook && webhook.deletedAt === null ? webhook : null;
    const matches = webhookTokenMatches(token, live ? live.tokenHash : null);
    if (!live || !matches) this.notFound();
    return live;
  }

  private notFound(): never {
    throw new NotFoundException({ message: 'Webhook bulunamadı.', error: 'WEBHOOK_NOT_FOUND' });
  }

  private parseBody(body: unknown, defaultName: string) {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      badBody('Gövde bir JSON nesnesi olmalı.');
    }
    const raw = body as Record<string, unknown>;

    let content = '';
    if (raw.content !== undefined && raw.content !== null) {
      if (typeof raw.content !== 'string') badBody('content metin olmalı.');
      if (raw.content.length > CONTENT_MAX) {
        badBody(`content en fazla ${CONTENT_MAX} karakter olabilir.`);
      }
      content = raw.content;
    }

    let username: string | undefined;
    if (raw.username !== undefined && raw.username !== null) {
      if (typeof raw.username !== 'string') badBody('username metin olmalı.');
      const trimmed = raw.username.trim();
      if (trimmed.length > USERNAME_MAX) {
        badBody(`username en fazla ${USERNAME_MAX} karakter olabilir.`);
      }
      // Discord boş username'i yok sayar → webhook adı kullanılır
      if (trimmed.length > 0) username = trimmed;
    }
    if (isReservedWebhookName(username ?? defaultName)) {
      throw new BadRequestException({
        message: 'Bu ad resmî bir hesabı andırdığı için kullanılamaz.',
        error: 'WEBHOOK_NAME_RESERVED',
      });
    }

    const { embeds, texts } = parseEmbeds(raw.embeds);
    if (content.trim().length === 0 && embeds.length === 0) {
      throw new BadRequestException({
        message: 'Mesaj içeriği veya en az bir embed gereklidir.',
        error: 'EMPTY_MESSAGE',
      });
    }

    return {
      content,
      username,
      embeds: embeds,
      embedTexts: texts,
      parse: this.parseAllowedMentions(raw.allowed_mentions),
    };
  }

  /**
   * §3.4 — `allowed_mentions.parse` yalnız DARALTIR. Alan yoksa izin Discord varsayılanı gibi açık;
   * alan var ama `parse` yoksa/geçersizse hiçbir toplu bahsetme çözülmez (daraltma yönünde güvenli).
   */
  private parseAllowedMentions(raw: unknown): { everyone: boolean; roles: boolean } {
    if (raw === undefined || raw === null) return { everyone: true, roles: true };
    if (typeof raw !== 'object' || Array.isArray(raw)) return { everyone: false, roles: false };
    const parse = (raw as Record<string, unknown>).parse;
    const list = Array.isArray(parse) ? parse : [];
    return { everyone: list.includes('everyone'), roles: list.includes('roles') };
  }

  /** Davranış `MessagesController.notifyAfterSend` ile aynı (kim ne bildirim alır). */
  private async notifyAfterSend(
    channelId: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    await this.gateway.notifyChannelActivity(channelId, message);
    await this.gateway.notifyMentions(channelId, message);
  }

  private async touchLastUsed(webhookId: string): Promise<void> {
    const staleBefore = new Date(Date.now() - LAST_USED_WRITE_INTERVAL_MS);
    await this.prisma.webhook.updateMany({
      where: { id: webhookId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: staleBefore } }] },
      data: { lastUsedAt: new Date() },
    });
  }
}
