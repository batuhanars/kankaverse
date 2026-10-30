import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { generateWebhookToken } from '../webhooks/webhook-token.util';
import { PutStreamAnnounceDto } from './dto/integration.dto';
import { STREAM_ANNOUNCE_WEBHOOK_NAME } from './stream-announce.texts';

export interface StreamAnnounceConfigDto {
  channelId: string;
  mentionRoleId: string | null;
  enabled: boolean;
}

export interface AnnounceGuildDto {
  guildId: string;
  name: string;
  iconUrl: string | null;
  optedIn: boolean;
}

function minorNotAllowed(): never {
  throw new ForbiddenException({
    message: 'Bu özellik yaşına uygun değil.',
    error: 'MINOR_NOT_ALLOWED',
  });
}

/**
 * C36 §4 — ortam başına yayın duyurusu ayarı (yönetici) ve üye opt-in'i (çift rıza, §0.4).
 * Duyuru, ortam başına sistem yönetimli `STREAM_ANNOUNCE` webhook'u üzerinden gider; bu webhook'un
 * token'ı rastgele üretilir ve HİÇBİR YERDE gösterilmez (yürütme ucu bu türü 404'ler).
 */
@Injectable()
export class StreamAnnounceConfigService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private permissions: PermissionsService,
  ) {}

  async get(userId: string, guildId: string): Promise<StreamAnnounceConfigDto | null> {
    await this.requireManage(userId, guildId);
    const row = await this.prisma.streamAnnounceConfig.findUnique({ where: { guildId } });
    return row ? this.toDto(row) : null;
  }

  async put(
    userId: string,
    guildId: string,
    dto: PutStreamAnnounceDto,
  ): Promise<StreamAnnounceConfigDto> {
    await this.requireManage(userId, guildId);
    await this.requireUsableChannel(userId, guildId, dto.channelId);
    const mentionRoleId = dto.mentionRoleId ?? null;
    if (mentionRoleId) await this.requireMentionableRole(guildId, mentionRoleId);

    const existing = await this.prisma.streamAnnounceConfig.findUnique({ where: { guildId } });
    const row = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        // Ayarı son değiştiren hesap verebilir kişi olur: C35 kapısı (oluşturan hâlâ yetkili mi)
        // ilk kurucu ayrılsa bile güncel yöneticiyle çalışır.
        await tx.webhook.update({
          where: { id: existing.webhookId },
          data: { channelId: dto.channelId, createdById: userId },
        });
        return tx.streamAnnounceConfig.update({
          where: { guildId },
          data: {
            channelId: dto.channelId,
            mentionRoleId,
            enabled: dto.enabled,
            createdById: userId,
          },
        });
      }
      const { tokenHash } = generateWebhookToken(); // token atılır: bu webhook'a dışarıdan yazılamaz
      const webhook = await tx.webhook.create({
        data: {
          guildId,
          channelId: dto.channelId,
          name: STREAM_ANNOUNCE_WEBHOOK_NAME,
          tokenHash,
          createdById: userId,
          kind: 'STREAM_ANNOUNCE',
        },
      });
      return tx.streamAnnounceConfig.create({
        data: {
          guildId,
          channelId: dto.channelId,
          webhookId: webhook.id,
          mentionRoleId,
          enabled: dto.enabled,
          createdById: userId,
        },
      });
    });
    await this.audit(userId, 'stream_announce.update', guildId, {
      guildId,
      channelId: row.channelId,
      enabled: String(row.enabled),
      // Sorumluluk devri izi: ilk kurulumda önceki sahip yok
      previousOwnerId: existing?.createdById ?? '',
      newOwnerId: userId,
    });
    return this.toDto(row);
  }

  async remove(userId: string, guildId: string): Promise<null> {
    await this.requireManage(userId, guildId);
    const existing = await this.prisma.streamAnnounceConfig.findUnique({ where: { guildId } });
    if (!existing) {
      throw new NotFoundException({ message: 'Ayar bulunamadı.', error: 'NOT_FOUND' });
    }
    await this.prisma.$transaction([
      this.prisma.streamAnnounceConfig.delete({ where: { guildId } }),
      // Yumuşak silme: gönderilmiş duyurular webhookId/webhookName ile kimliğini korur
      this.prisma.webhook.update({
        where: { id: existing.webhookId },
        data: { deletedAt: new Date() },
      }),
    ]);
    await this.audit(userId, 'stream_announce.delete', guildId, {
      guildId,
      channelId: existing.channelId,
    });
    return null;
  }

  // ─── Üye tarafı (§4.3) ─────────────────────────────────────────────────────

  async optIn(userId: string, guildId: string): Promise<null> {
    await this.requireAdultWithAccount(userId);
    await this.membership.requireGuildMembership(userId, guildId);
    await this.prisma.streamAnnounceOptIn.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId },
      update: {},
    });
    return null;
  }

  async optOut(userId: string, guildId: string): Promise<null> {
    await this.prisma.streamAnnounceOptIn.deleteMany({ where: { guildId, userId } });
    return null;
  }

  /** Bağlantılar sayfası: üyesi olduğum, duyurusu AÇIK ortamlar + opt-in durumu. */
  async announceGuilds(userId: string): Promise<AnnounceGuildDto[]> {
    const memberships = await this.prisma.guildMember.findMany({
      where: { userId, guild: { deletedAt: null } },
      select: { guildId: true },
    });
    const guildIds = memberships.map((m) => m.guildId);
    if (guildIds.length === 0) return [];
    const [configs, optIns] = await Promise.all([
      this.prisma.streamAnnounceConfig.findMany({
        where: { guildId: { in: guildIds }, enabled: true },
        select: { guildId: true },
      }),
      this.prisma.streamAnnounceOptIn.findMany({
        where: { userId, guildId: { in: guildIds } },
        select: { guildId: true },
      }),
    ]);
    if (configs.length === 0) return [];
    const optedIn = new Set(optIns.map((o) => o.guildId));
    const guilds = await this.prisma.guild.findMany({
      where: { id: { in: configs.map((c) => c.guildId) } },
      select: { id: true, name: true, iconUrl: true },
      orderBy: { name: 'asc' },
    });
    return guilds.map((g) => ({
      guildId: g.id,
      name: g.name,
      iconUrl: g.iconUrl,
      optedIn: optedIn.has(g.id),
    }));
  }

  // ─── Yardımcılar ───────────────────────────────────────────────────────────

  private async requireAdultWithAccount(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { isMinor: true },
    });
    if (!user || user.isMinor) minorNotAllowed();
    const linked = await this.prisma.externalAccount.count({ where: { userId } });
    if (linked === 0) {
      throw new BadRequestException({
        message: 'Önce bir yayın hesabı bağlamalısın.',
        error: 'NO_LINKED_ACCOUNT',
      });
    }
  }

  private async requireManage(userId: string, guildId: string): Promise<void> {
    const allowed = await this.permissions.hasGuildPermission(userId, guildId, 'MANAGE_WEBHOOKS');
    if (!allowed) {
      throw new ForbiddenException({
        message: 'Yayın duyurusunu yönetmek için yetkiniz yok.',
        error: 'FORBIDDEN',
      });
    }
  }

  /** C35 §4.2 kanal kuralları: bu ortamın silinmemiş GUILD_TEXT kanalı + çağıranın erişimi. */
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

  /** Rol bu ortamın olmalı; @everyone rolü bu ayarla seçilemez (toplu bahsetme yolu açılmaz). */
  private async requireMentionableRole(guildId: string, roleId: string): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, guildId, isEveryone: false },
      select: { id: true },
    });
    if (!role) {
      throw new NotFoundException({ message: 'Rol bulunamadı.', error: 'ROLE_NOT_FOUND' });
    }
  }

  private async audit(
    actorId: string,
    action: string,
    entityId: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { actorId, action, entityType: 'StreamAnnounceConfig', entityId, metadata },
    });
  }

  private toDto(row: {
    channelId: string;
    mentionRoleId: string | null;
    enabled: boolean;
  }): StreamAnnounceConfigDto {
    return { channelId: row.channelId, mentionRoleId: row.mentionRoleId, enabled: row.enabled };
  }
}
