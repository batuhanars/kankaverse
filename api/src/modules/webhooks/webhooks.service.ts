import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, Guild, Webhook } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { MessagesService } from '../messages/messages.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { isReservedWebhookName } from './webhook-name.util';
import { generateWebhookToken } from './webhook-token.util';

/** C35 §4.2: kanal başına en çok 10 etkin webhook. */
const MAX_ACTIVE_PER_CHANNEL = 10;

type WebhookWithCreator = Webhook & { createdBy: { id: string; username: string } };

/** Oluşturan gönderim için hâlâ uygun mu? Sonuç liste ("devre dışı") ve yürütme (403/404) için TEK kaynak. */
export type SenderResolution =
  | { ok: true; channel: Channel & { guild: Guild | null } }
  | { ok: false; reason: 'CHANNEL_GONE' | 'DISABLED' };

@Injectable()
export class WebhooksService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private permissions: PermissionsService,
    private messages: MessagesService,
    private config: ConfigService,
  ) {}

  // ─── Yürütme + liste ortak çekirdeği (R7) ──────────────────────────────────

  /**
   * C35 §3.1-§3.2 — webhook'u çalıştıran kimlik OLUŞTURANDIR; her gönderimde yeniden sınanır:
   *  (a) ortamda üye + (e) kanala erişim → `requireChannelAccess` (yaş/özel kanal kapıları dahil)
   *  (b) MANAGE_WEBHOOKS sahibi (üye değilse fail-closed false)
   *  (c) global ban yok + (d) ortam mute'u yok → mesaj yazma çekirdeği `assertSenderUnrestricted`
   * Kanal silinmiş/başka ortamda/metin değil → CHANNEL_GONE (yürütmede 404). Biri tutmazsa DISABLED (403).
   */
  async resolveSender(
    webhook: Pick<Webhook, 'guildId' | 'channelId' | 'createdById'>,
  ): Promise<SenderResolution> {
    let channel: Channel & { guild: Guild | null };
    try {
      channel = await this.membership.requireChannelAccess(webhook.createdById, webhook.channelId);
    } catch (err) {
      if (err instanceof NotFoundException) return { ok: false, reason: 'CHANNEL_GONE' };
      if (err instanceof ForbiddenException) return { ok: false, reason: 'DISABLED' };
      throw err;
    }
    if (
      channel.guildId !== webhook.guildId ||
      channel.type !== 'GUILD_TEXT' ||
      channel.guild?.deletedAt
    ) {
      return { ok: false, reason: 'CHANNEL_GONE' };
    }

    const canManage = await this.permissions.hasGuildPermission(
      webhook.createdById,
      webhook.guildId,
      'MANAGE_WEBHOOKS',
    );
    if (!canManage) return { ok: false, reason: 'DISABLED' };

    try {
      await this.messages.assertSenderUnrestricted(webhook.createdById, webhook.guildId);
    } catch (err) {
      if (err instanceof ForbiddenException) return { ok: false, reason: 'DISABLED' };
      throw err;
    }
    return { ok: true, channel };
  }

  // ─── Yönetim ───────────────────────────────────────────────────────────────

  async list(userId: string, guildId: string) {
    await this.requireManage(userId, guildId);
    const rows = await this.prisma.webhook.findMany({
      where: { guildId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    // Aynı oluşturan+kanal çifti için tek çözüm (liste küçük, ama aynı sorguyu tekrarlama)
    const cache = new Map<string, Promise<SenderResolution>>();
    return Promise.all(
      rows.map(async (row) => {
        const key = `${row.createdById}:${row.channelId}`;
        if (!cache.has(key)) cache.set(key, this.resolveSender(row));
        const resolution = await cache.get(key)!;
        return this.toDto(row, !resolution.ok);
      }),
    );
  }

  async create(userId: string, guildId: string, dto: CreateWebhookDto) {
    await this.requireManage(userId, guildId);
    this.assertNameAllowed(dto.name);
    await this.requireUsableChannel(userId, guildId, dto.channelId);
    await this.assertChannelCapacity(dto.channelId);

    const { token, tokenHash } = generateWebhookToken();
    const row = await this.prisma.webhook.create({
      data: {
        guildId,
        channelId: dto.channelId,
        name: dto.name,
        tokenHash,
        createdById: userId,
      },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    await this.audit(userId, 'webhook.create', row.id, {
      guildId,
      name: row.name,
      channelId: row.channelId,
    });
    return { ...this.toDto(row, false), url: this.buildUrl(row.id, token) };
  }

  async update(userId: string, guildId: string, id: string, dto: UpdateWebhookDto) {
    await this.requireManage(userId, guildId);
    const existing = await this.findActive(guildId, id);

    if (dto.name !== undefined) this.assertNameAllowed(dto.name);
    const moving = dto.channelId !== undefined && dto.channelId !== existing.channelId;
    if (moving) {
      await this.requireUsableChannel(userId, guildId, dto.channelId!);
      await this.assertChannelCapacity(dto.channelId!);
    }

    const row = await this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(moving ? { channelId: dto.channelId } : {}),
      },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    await this.audit(userId, 'webhook.update', id, {
      guildId,
      name: row.name,
      channelId: row.channelId,
      previousName: existing.name,
      previousChannelId: existing.channelId,
    });
    return this.toDto(row, !(await this.resolveSender(row)).ok);
  }

  /**
   * C35 §4.4 (R7) — token yenileme: eski token ANINDA geçersiz (özet üzerine yazılır) ve webhook'un
   * `createdById`'si ÇAĞIRANA devredilir. Devir, oluşturanı ayrılan/yetkisi alınan (devre dışı)
   * webhook'u yetkili bir yöneticinin üstlenme yoludur. Eski ve yeni sahip AuditLog'a yazılır.
   * Çağıranın MANAGE_WEBHOOKS'i `requireManage` ile sınanır → devir yoluyla yetkisiz sahip olunamaz.
   */
  async resetToken(userId: string, guildId: string, id: string) {
    await this.requireManage(userId, guildId);
    const existing = await this.findActive(guildId, id);

    const { token, tokenHash } = generateWebhookToken();
    const row = await this.prisma.webhook.update({
      where: { id },
      data: { tokenHash, createdById: userId },
      include: { createdBy: { select: { id: true, username: true } } },
    });
    await this.audit(userId, 'webhook.token_reset', id, {
      guildId,
      name: row.name,
      channelId: row.channelId,
      previousOwnerId: existing.createdById,
      newOwnerId: userId,
    });
    return {
      ...this.toDto(row, !(await this.resolveSender(row)).ok),
      url: this.buildUrl(row.id, token),
    };
  }

  async remove(userId: string, guildId: string, id: string): Promise<null> {
    await this.requireManage(userId, guildId);
    const existing = await this.findActive(guildId, id);
    // Yumuşak silme: gönderilmiş mesajlar webhookId/webhookName ile kimliğini korur
    await this.prisma.webhook.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(userId, 'webhook.delete', id, {
      guildId,
      name: existing.name,
      channelId: existing.channelId,
    });
    return null;
  }

  // ─── Yardımcılar ───────────────────────────────────────────────────────────

  private async requireManage(userId: string, guildId: string): Promise<void> {
    const allowed = await this.permissions.hasGuildPermission(userId, guildId, 'MANAGE_WEBHOOKS');
    if (!allowed) {
      throw new ForbiddenException({
        message: 'Webhook yönetmek için yetkiniz yok.',
        error: 'FORBIDDEN',
      });
    }
  }

  private async findActive(guildId: string, id: string): Promise<Webhook> {
    const row = await this.prisma.webhook.findFirst({ where: { id, guildId, deletedAt: null } });
    if (!row) {
      throw new NotFoundException({
        message: 'Webhook bulunamadı.',
        error: 'WEBHOOK_NOT_FOUND',
      });
    }
    return row;
  }

  /** Kanal bu ortamın silinmemiş GUILD_TEXT kanalı olmalı ve çağıranın erişimi olmalı (§4.2). */
  private async requireUsableChannel(
    userId: string,
    guildId: string,
    channelId: string,
  ): Promise<void> {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, guildId, deletedAt: null, type: 'GUILD_TEXT' },
      select: { id: true },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }
    await this.membership.requireChannelAccess(userId, channelId);
  }

  private async assertChannelCapacity(channelId: string): Promise<void> {
    const active = await this.prisma.webhook.count({ where: { channelId, deletedAt: null } });
    if (active >= MAX_ACTIVE_PER_CHANNEL) {
      throw new ConflictException({
        message: `Bir kanalda en fazla ${MAX_ACTIVE_PER_CHANNEL} webhook olabilir.`,
        error: 'WEBHOOK_LIMIT_REACHED',
      });
    }
  }

  /** Ayrılmış ad (§3.5) + automod. Aynı kural gönderimde `username` için de uygulanır. */
  private assertNameAllowed(name: string): void {
    if (isReservedWebhookName(name)) {
      throw new BadRequestException({
        message: 'Bu ad resmî bir hesabı andırdığı için kullanılamaz.',
        error: 'WEBHOOK_NAME_RESERVED',
      });
    }
    this.messages.assertTextsAllowed([name]);
  }

  private async audit(
    actorId: string,
    action: string,
    entityId: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { actorId, action, entityType: 'Webhook', entityId, metadata },
    });
  }

  /** Token ve özet ASLA dönmez; tam adres (`url`) yalnız oluşturma/yenileme cevabına eklenir. */
  private toDto(row: WebhookWithCreator, disabled: boolean) {
    return {
      id: row.id,
      name: row.name,
      channelId: row.channelId,
      createdBy: { id: row.createdBy.id, username: row.createdBy.username },
      disabled,
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Kamu adresi: Caddy `/api` önekini soyar (dev'de Vite proxy aynı yolu API köküne çevirir). */
  private buildUrl(id: string, token: string): string {
    const base = (this.config.get<string>('frontendUrl') ?? 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    return `${base}/api/webhooks/${id}/${token}`;
  }
}
