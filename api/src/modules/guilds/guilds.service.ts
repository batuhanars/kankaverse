import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { StorageService } from '../../shared/storage/storage.service';
import { CreateGuildDto } from './dto/create-guild.dto';
import { UpdateGuildDto } from './dto/update-guild.dto';
import { PresignIconDto } from './dto/presign-icon.dto';
import { SetIconDto } from './dto/set-icon.dto';
import { GuildMemberDto } from './dto/guild-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { Guild, GuildRole } from '@prisma/client';

// İkon yüklemesi için izin verilen görsel tipler (allowlist)
const ALLOWED_ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const ICON_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export function toGuildDto(guild: Guild, unreadCount = 0) {
  return {
    id: guild.id,
    name: guild.name,
    ownerId: guild.ownerId,
    adultsOnly: guild.adultsOnly,
    iconUrl: guild.iconUrl,
    rules: guild.rules ?? null,
    createdAt: guild.createdAt.toISOString(),
    unreadCount,
  };
}

const ROLE_ORDER: Record<GuildRole, number> = {
  OWNER: 0,
  ADMIN: 1,
  MEMBER: 2,
};

@Injectable()
export class GuildsService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  async create(userId: string, dto: CreateGuildDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const guild = await tx.guild.create({
        data: {
          name: dto.name,
          ownerId: userId,
        },
      });

      await tx.guildMember.create({
        data: {
          guildId: guild.id,
          userId,
          role: 'OWNER',
        },
      });

      // Varsayılan kategori: "Metin Kanalları" (yalnız tek kategori; "Ses Kanalları" LiveKit gelince)
      const defaultCategory = await tx.channelCategory.create({
        data: {
          guildId: guild.id,
          name: 'Metin Kanalları',
          position: 0,
        },
      });

      // Varsayılan kanal, oluşturulan kategoriye bağlı
      await tx.channel.create({
        data: {
          guildId: guild.id,
          type: 'GUILD_TEXT',
          name: 'genel-sohbet',
          position: 0,
          categoryId: defaultCategory.id,
        },
      });

      return guild;
    });

    return toGuildDto(result);
  }

  async findMyGuilds(userId: string) {
    const memberships = await this.prisma.guildMember.findMany({
      where: { userId },
      include: {
        guild: {
          include: {
            channels: {
              where: { deletedAt: null },
              include: {
                channelReads: {
                  where: { userId },
                  select: { lastReadAt: true },
                },
              },
            },
          },
        },
      },
    });

    const activeGuilds = memberships.filter((m) => m.guild.deletedAt === null);

    // Her guild'in kanalları için okunmamış sayılarını paralel hesapla
    const guildUnreadCounts = await Promise.all(
      activeGuilds.map(async (m) => {
        const channelCounts = await Promise.all(
          m.guild.channels.map((ch) => {
            const lastRead = ch.channelReads[0]?.lastReadAt ?? null;
            return this.prisma.message.count({
              where: {
                channelId: ch.id,
                deletedAt: null,
                authorId: { not: userId }, // kendi mesajları sayma
                ...(lastRead !== null && { createdAt: { gt: lastRead } }),
              },
            });
          }),
        );
        return channelCounts.reduce((sum, n) => sum + n, 0);
      }),
    );

    return activeGuilds.map((m, i) => toGuildDto(m.guild, guildUnreadCounts[i]));
  }

  /** PATCH /guilds/:id — yalnız OWNER */
  async update(userId: string, guildId: string, dto: UpdateGuildDto) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId, deletedAt: null },
    });
    if (!guild) {
      throw new NotFoundException({ message: 'Sunucu bulunamadı.', error: 'GUILD_NOT_FOUND' });
    }

    const membership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    const updated = await this.prisma.guild.update({
      where: { id: guildId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.adultsOnly !== undefined && { adultsOnly: dto.adultsOnly }),
        ...(dto.rules !== undefined && { rules: dto.rules }),
      },
    });

    return toGuildDto(updated);
  }

  /** POST /guilds/:id/icon/presign — yalnız OWNER */
  async presignIcon(userId: string, guildId: string, dto: PresignIconDto) {
    if (!this.config.get<boolean>('uploadsEnabled')) {
      throw new ForbiddenException({
        message: 'Dosya yükleme şu an kapalı.',
        error: 'UPLOADS_DISABLED',
      });
    }

    if (!ALLOWED_ICON_TYPES.has(dto.contentType)) {
      throw new BadRequestException({
        message: 'Bu dosya türü ikon olarak desteklenmiyor. PNG, JPEG, GIF veya WebP kullanın.',
        error: 'UNSUPPORTED_TYPE',
      });
    }

    await this.requireOwner(userId, guildId);

    const ext = ICON_EXT[dto.contentType];
    const storageKey = `icons/${guildId}/${randomUUID()}.${ext}`;
    const uploadUrl = await this.storage.presignPut(storageKey, dto.contentType);

    return { uploadUrl, storageKey };
  }

  /** PATCH /guilds/:id/icon — yalnız OWNER */
  async setIcon(userId: string, guildId: string, dto: SetIconDto) {
    await this.requireOwner(userId, guildId);

    let iconUrl: string | null = null;

    if (dto.storageKey != null) {
      // Güvenlik: yalnız bu guild'e ait icons/ prefix'i kabul edilir
      if (!dto.storageKey.startsWith(`icons/${guildId}/`)) {
        throw new BadRequestException({
          message: 'Geçersiz storage anahtarı.',
          error: 'INVALID_STORAGE_KEY',
        });
      }

      const publicBase = this.config.get<string>('s3.publicUrl')!;
      iconUrl = `${publicBase}/${dto.storageKey}`;
    }

    const updated = await this.prisma.guild.update({
      where: { id: guildId },
      data: { iconUrl },
    });

    return toGuildDto(updated);
  }

  /** Ortak yardımcı: guild var mı + OWNER mı doğrular; değilse exception fırlatır */
  private async requireOwner(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId, deletedAt: null },
    });
    if (!guild) {
      throw new NotFoundException({ message: 'Sunucu bulunamadı.', error: 'GUILD_NOT_FOUND' });
    }

    const membership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
  }

  async getMembers(userId: string, guildId: string): Promise<GuildMemberDto[]> {
    await this.membership.requireGuildMembership(userId, guildId);

    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    return members
      .sort((a, b) => {
        const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
        if (roleDiff !== 0) return roleDiff;
        return a.user.username.localeCompare(b.user.username, 'tr');
      })
      .map((m) => ({
        userId: m.user.id,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
      }));
  }

  // ─── §A: Ortam silme — yalnız OWNER, soft-delete ──────────────────────────

  /** DELETE /guilds/:id — yalnız OWNER; soft-delete (deletedAt = now). Dönüş null. */
  async deleteGuild(userId: string, guildId: string): Promise<null> {
    await this.requireOwner(userId, guildId);

    await this.prisma.guild.update({
      where: { id: guildId },
      data: { deletedAt: new Date() },
    });

    return null;
  }

  // ─── §B: Rol değiştir — yalnız OWNER (R7) ─────────────────────────────────

  /**
   * PATCH /guilds/:id/members/:userId/role — yalnız OWNER.
   *
   * R7 yetki hiyerarşisi (satır satır incelenecek):
   *  1. Actor OWNER kontrolü — ADMIN/MEMBER → 403 FORBIDDEN.
   *  2. Hedef guild üyesi mi? → 404 NOT_GUILD_MEMBER.
   *  3. Hedef OWNER mı? (kendi dahil) → 400 CANNOT_MODIFY_OWNER.
   *  4. GuildMember.role güncelle (idempotent). AuditLog yaz. Dönüş: güncel üye DTO.
   */
  async updateMemberRole(
    actorId: string,
    guildId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<GuildMemberDto> {
    // 1. Actor OWNER kontrolü (requireOwner guild var mı + OWNER rolü garantiler)
    await this.requireOwner(actorId, guildId);

    // 2. Hedef guild üyesi mi?
    const targetMembership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: targetUserId } },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
    if (!targetMembership) {
      throw new NotFoundException({
        message: 'Kullanıcı bu sunucunun üyesi değil.',
        error: 'NOT_GUILD_MEMBER',
      });
    }

    // 3. Hedef OWNER mı? (actor=OWNER, targetUserId=actor ya da başka OWNER)
    if (targetMembership.role === GuildRole.OWNER) {
      throw new BadRequestException({
        message: "Ortam sahibinin rolü değiştirilemez.",
        error: 'CANNOT_MODIFY_OWNER',
      });
    }

    // 4. Güncelle (idempotent — zaten o rolse no-op, update çalışır ama fark yok)
    const updated = await this.prisma.guildMember.update({
      where: { guildId_userId: { guildId, userId: targetUserId } },
      data: { role: dto.role as GuildRole },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    // AuditLog
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'guild.member_role_updated',
        entityType: 'GuildMember',
        entityId: updated.id,
        metadata: {
          guildId,
          targetUserId,
          newRole: dto.role,
        },
      },
    });

    return {
      userId: updated.user.id,
      username: updated.user.username,
      avatarUrl: updated.user.avatarUrl,
      role: updated.role,
    };
  }

  // ─── §C: Üye at (kick) — OWNER/ADMIN hiyerarşi (R7) ──────────────────────

  /**
   * DELETE /guilds/:id/members/:userId — OWNER veya ADMIN at yetkisi (R7).
   *
   * R7 yetki hiyerarşisi — yetki sızıntısı önlemek için sıra ÖNEMLİ:
   *  1. Actor guild üyesi mi + rolü ne? (requireGuildMembership → {guild, membership})
   *     Actor OWNER veya ADMIN değilse → 403 FORBIDDEN.
   *  2. Actor kendini mi atmaya çalışıyor? → 400 CANNOT_KICK_SELF.
   *  3. Hedef GuildMember kaydı var mı? → 404 NOT_GUILD_MEMBER.
   *  4. Hedef OWNER mı? → 400 CANNOT_KICK_OWNER.
   *  5. Actor ADMIN ise ve hedef ADMIN → 403 FORBIDDEN
   *     (ADMIN yalnız MEMBER atabilir; OWNER her rolü atabilir).
   *  6. Tx: GuildMember sil + bu guild kanallarındaki ChannelMember kayıtlarını sil.
   *     AuditLog yaz. Dönüş null.
   */
  async kickMember(
    actorId: string,
    guildId: string,
    targetUserId: string,
  ): Promise<null> {
    // 1. Actor erişim + rol kontrolü — ÖNCE yetki (sızıntı önleme)
    const { membership: actorMembership } = await this.membership.requireGuildMembership(actorId, guildId);

    if (actorMembership.role !== GuildRole.OWNER && actorMembership.role !== GuildRole.ADMIN) {
      throw new ForbiddenException({
        message: 'Bu işlem için yetkiniz yok.',
        error: 'FORBIDDEN',
      });
    }

    // 2. Kendini atma reddi
    if (actorId === targetUserId) {
      throw new BadRequestException({
        message: 'Kendinizi ortamdan atamazsınız.',
        error: 'CANNOT_KICK_SELF',
      });
    }

    // 3. Hedef GuildMember kaydı var mı?
    const targetMembership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: targetUserId } },
    });
    if (!targetMembership) {
      throw new NotFoundException({
        message: 'Kullanıcı bu sunucunun üyesi değil.',
        error: 'NOT_GUILD_MEMBER',
      });
    }

    // 4. Hedef OWNER mı? Hiçbir aktör owner'ı atamaz
    if (targetMembership.role === GuildRole.OWNER) {
      throw new BadRequestException({
        message: 'Ortam sahibi sunucudan atılamaz.',
        error: 'CANNOT_KICK_OWNER',
      });
    }

    // 5. ADMIN yalnız MEMBER atabilir — hedef ADMIN ise FORBIDDEN
    if (actorMembership.role === GuildRole.ADMIN && targetMembership.role === GuildRole.ADMIN) {
      throw new ForbiddenException({
        message: 'Yöneticiler başka yöneticileri atamaz.',
        error: 'FORBIDDEN',
      });
    }

    // 6. Tx: GuildMember sil + bu guild'in kanallarındaki ChannelMember kayıtlarını sil
    //    (özel kanal erişimi atılanın üzerinde kalmasın)
    const guildChannels = await this.prisma.channel.findMany({
      where: { guildId, deletedAt: null },
      select: { id: true },
    });
    const channelIds = guildChannels.map((ch) => ch.id);

    const kickedMemberId = targetMembership.id;

    await this.prisma.$transaction([
      this.prisma.channelMember.deleteMany({
        where: {
          userId: targetUserId,
          channelId: { in: channelIds },
        },
      }),
      this.prisma.guildMember.delete({
        where: { guildId_userId: { guildId, userId: targetUserId } },
      }),
    ]);

    // AuditLog (tx dışı — başarılı tx'ten sonra)
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'guild.member_kicked',
        entityType: 'GuildMember',
        entityId: kickedMemberId,
        metadata: {
          guildId,
          targetUserId,
          actorRole: actorMembership.role,
        },
      },
    });

    return null;
  }
}
