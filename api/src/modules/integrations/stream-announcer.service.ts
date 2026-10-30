import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalAccount, StreamAnnounceConfig, Webhook } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../../shared/moderation/moderation.service';
import { MessagesService } from '../messages/messages.service';
import { MessagesGateway } from '../messages/gateway/messages.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { StreamInfo, StreamProvider } from './providers/stream-provider';
import { isRiskyStream } from './stream-risk.util';
import { STREAM_PLATFORM_TEXT, announceContent } from './stream-announce.texts';

/** §5.2 — aynı hesap için iki duyuru arası en az bu kadar süre (kopup yeniden başlayan yayın spam üretmesin). */
export const ANNOUNCE_COOLDOWN_MS = 30 * 60 * 1000;
/**
 * Yayın bilgisi okuma denemeleri arasındaki bekleme (sn): 5 deneme, t = 0, 5, 20, 50, 110 sn (~2 dk).
 * Platform yayın ucu olaydan birkaç saniye (bazen dakika) geç güncellenebilir; kısa bekleme normal
 * yayınları sistematik olarak "riskli" (yalnız 18+ ortam) sayardı. Hâlâ okunamazsa fail-closed riskli.
 */
const READ_RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
const EMBED_TITLE_MAX = 256;

type ConfigWithWebhook = StreamAnnounceConfig & { webhook: Webhook };

/**
 * C36 §5 (R7) — "yayın başladı" olayından ortam duyurularına. Mesaj C35 çekirdeğinden geçer
 * (`resolveSender`, `assertTextsAllowed`, `resolveMentions`, `createWebhookMessage`): kopya kapı yok.
 */
@Injectable()
export class StreamAnnouncerService {
  private readonly logger = new Logger(StreamAnnouncerService.name);
  /** Aynı hesabın eşzamanlı iki olayı çift duyuru üretmesin (tek örnek) */
  private readonly inFlight = new Set<string>();
  /** Testte sıfırlanır */
  retryDelaysMs: number[] = READ_RETRY_DELAYS_MS;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private moderation: ModerationService,
    private webhooks: WebhooksService,
    private messages: MessagesService,
    private gateway: MessagesGateway,
  ) {}

  /** "Yayın bitti" yalnız lastLiveAt'ı günceller (§3.1). */
  async onOffline(provider: StreamProvider, externalId: string): Promise<void> {
    await this.prisma.externalAccount.updateMany({
      where: { provider: provider.db, externalId },
      data: { lastLiveAt: new Date() },
    });
  }

  async onOnline(
    provider: StreamProvider,
    externalId: string,
    titleHint: string | null,
  ): Promise<void> {
    const account = await this.prisma.externalAccount.findUnique({
      where: { provider_externalId: { provider: provider.db, externalId } },
      include: { user: { select: { id: true, isMinor: true, deletedAt: true } } },
    });
    if (!account) return;
    // §5.1 — sahip minörse, silinmişse ya da global banlıysa hiçbir şey yapılmaz
    if (account.user.isMinor || account.user.deletedAt) return;
    if (await this.moderation.hasActiveBan(account.userId)) return;

    if (this.inFlight.has(account.id)) return;
    this.inFlight.add(account.id);
    try {
      await this.announce(provider, account, titleHint);
    } finally {
      this.inFlight.delete(account.id);
    }
  }

  private async announce(
    provider: StreamProvider,
    account: ExternalAccount,
    titleHint: string | null,
  ): Promise<void> {
    const now = new Date();
    // §5.2 — tekrar kapısı
    const cooling =
      account.lastAnnouncedAt !== null &&
      now.getTime() - account.lastAnnouncedAt.getTime() < ANNOUNCE_COOLDOWN_MS;
    if (cooling) {
      await this.prisma.externalAccount.update({
        where: { id: account.id },
        data: { lastLiveAt: now },
      });
      return;
    }

    // §5.4 — hedef ortamlar (opt-in + hâlâ üye + yönetici ayarı açık)
    const targets = await this.targetConfigs(account.userId);
    let announced = false;
    if (targets.length > 0) {
      // §5.3 — içerik kapısı: yayın bilgisi okunamazsa null → riskli (fail-closed)
      const info = await this.readStream(provider, account.externalId);
      const extraIds =
        this.config.get<string[]>(`streamLink.${provider.key}.gamblingCategoryIds`) ?? [];
      const risky = isRiskyStream(provider.key, info, extraIds);
      const allowed = await this.allowedGuildIds(
        targets.map((t) => t.guildId),
        risky,
      );
      for (const target of targets.filter((t) => allowed.has(t.guildId))) {
        const sent = await this.sendToGuild(provider, account, target, info, titleHint);
        announced = announced || sent;
      }
    }
    await this.prisma.externalAccount.update({
      where: { id: account.id },
      data: { lastLiveAt: now, lastAnnouncedAt: now },
    });
    if (!announced) this.logger.debug(`${provider.key} ${account.id}: duyuru gönderilen ortam yok`);
  }

  private async targetConfigs(userId: string): Promise<ConfigWithWebhook[]> {
    const optIns = await this.prisma.streamAnnounceOptIn.findMany({
      where: { userId },
      select: { guildId: true },
    });
    if (optIns.length === 0) return [];
    const guildIds = optIns.map((o) => o.guildId);
    const [configs, memberships] = await Promise.all([
      this.prisma.streamAnnounceConfig.findMany({
        where: { guildId: { in: guildIds }, enabled: true, webhook: { deletedAt: null } },
        include: { webhook: true },
      }),
      this.prisma.guildMember.findMany({
        where: { userId, guildId: { in: guildIds } },
        select: { guildId: true },
      }),
    ]);
    const member = new Set(memberships.map((m) => m.guildId)); // hâlâ üye mi
    return configs.filter((c) => member.has(c.guildId));
  }

  /** Riskli yayın yalnız `adultsOnly` ortamlara; silinmiş ortam her durumda dışarıda. */
  private async allowedGuildIds(guildIds: string[], risky: boolean): Promise<Set<string>> {
    const guilds = await this.prisma.guild.findMany({
      where: { id: { in: guildIds }, deletedAt: null, ...(risky ? { adultsOnly: true } : {}) },
      select: { id: true },
    });
    return new Set(guilds.map((g) => g.id));
  }

  private async readStream(
    provider: StreamProvider,
    externalId: string,
  ): Promise<StreamInfo | null> {
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt++) {
      try {
        const info = await provider.fetchStream(externalId);
        if (info) return info;
      } catch (err) {
        this.logger.warn(`${provider.key} yayın bilgisi okunamadı: ${(err as Error).message}`);
      }
      if (attempt < this.retryDelaysMs.length) {
        await new Promise((r) => setTimeout(r, this.retryDelaysMs[attempt]));
      }
    }
    return null;
  }

  /** @returns mesaj gitti mi. Hiçbir ortamın hatası diğerini engellemez. */
  private async sendToGuild(
    provider: StreamProvider,
    account: ExternalAccount,
    target: ConfigWithWebhook,
    info: StreamInfo | null,
    titleHint: string | null,
  ): Promise<boolean> {
    const label = `${provider.key} ${account.id} ortam ${target.guildId}`;
    try {
      // C35 §3.1: oluşturan hâlâ yetkili mi (üye, MANAGE_WEBHOOKS, ban/mute yok, kanal erişimi)
      const sender = await this.webhooks.resolveSender(target.webhook);
      if (!sender.ok) {
        this.logger.warn(`${label}: duyuru atlandı (${sender.reason})`);
        return false;
      }
      const platform = STREAM_PLATFORM_TEXT[provider.key];
      const title = (info?.title || titleHint || account.username).slice(0, EMBED_TITLE_MAX);
      const description = info?.categoryName ?? undefined;
      const mention = target.mentionRoleId ? ` <@&${target.mentionRoleId}>` : '';
      const content = announceContent(provider.key, account.username) + mention;

      // C35 §3.3: automod; takılırsa o ortama duyuru yok, loglanır
      try {
        this.messages.assertTextsAllowed([content, title, description ?? '']);
      } catch {
        this.logger.warn(`${label}: duyuru atlandı (automod)`);
        return false;
      }

      // C35 §3.4: bahsetme OLUŞTURANIN kimliğiyle; kullanıcı bahsetmesi çözülmez
      const resolved = await this.messages.resolveMentions(
        sender.channel,
        content,
        target.webhook.createdById,
        { resolveUsers: false },
      );
      const embed = {
        title,
        url: provider.channelUrl(info?.channelSlug ?? account.username),
        ...(description ? { description } : {}),
        color: platform.color,
        footer: { text: platform.name },
        timestamp: new Date().toISOString(),
      };
      const message = await this.messages.createWebhookMessage(sender.channel, {
        creatorId: target.webhook.createdById,
        webhookId: target.webhook.id,
        webhookName: target.webhook.name,
        content,
        embeds: [embed],
        mentionsEveryone: false,
        mentionRoles: resolved.mentionRoles,
      });
      this.gateway.broadcastMessage(sender.channel.id, message);
      void this.notifyAfterSend(sender.channel.id, message).catch((err: unknown) =>
        this.logger.error(`${label}: bildirim hatası`, err),
      );
      return true;
    } catch (err) {
      this.logger.error(`${label}: duyuru gönderilemedi`, err);
      return false;
    }
  }

  private async notifyAfterSend(channelId: string, message: Record<string, unknown>) {
    await this.gateway.notifyChannelActivity(channelId, message);
    await this.gateway.notifyMentions(channelId, message);
  }
}
