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
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { StorageService } from '../../shared/storage/storage.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { CreateGuildDto } from './dto/create-guild.dto';
import { UpdateGuildDto } from './dto/update-guild.dto';
import { PresignIconDto } from './dto/presign-icon.dto';
import { SetIconDto } from './dto/set-icon.dto';
import { GuildMemberDto } from './dto/guild-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { Guild, GuildRole } from '@prisma/client';
import { DEFAULT_EVERYONE_PERMISSIONS } from '../../common/permissions';

// İkon yüklemesi için izin verilen görsel tipler (allowlist)
const ALLOWED_ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const ICON_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export function toGuildDto(guild: Guild, unreadCount = 0, unreadMentionCount = 0) {
  return {
    id: guild.id,
    name: guild.name,
    ownerId: guild.ownerId,
    adultsOnly: guild.adultsOnly,
    iconUrl: guild.iconUrl,
    rules: guild.rules ?? null,
    createdAt: guild.createdAt.toISOString(),
    unreadCount,
    unreadMentionCount, // REV-4: rail kırmızı rozeti bunu gösterir (generic unread değil)
  };
}

const ROLE_ORDER: Record<GuildRole, number> = {
  OWNER: 0,
  ADMIN: 1,
  MEMBER: 2,
};

/** GuildMember.roleLinks → GuildMemberDto.roles şekli (tek kaynak; @everyone örtük, atanmaz). */
function mapRoleLinks(
  roleLinks?: { role: { id: string; name: string; color: string; position: number; hoist: boolean } }[],
): { id: string; name: string; color: string; position: number; hoist: boolean }[] {
  return (roleLinks ?? []).map((rl) => ({
    id: rl.role.id,
    name: rl.role.name,
    color: rl.role.color,
    position: rl.role.position,
    hoist: rl.role.hoist,
  }));
}

@Injectable()
export class GuildsService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private permissions: PermissionsService,
    private storage: StorageService,
    private config: ConfigService,
    private realtime: RealtimeService,
  ) {}

  /** REV-14: guild'in tüm üyelerinin userId'lerini döner (realtime broadcast hedefi). */
  private async guildMemberIds(guildId: string): Promise<string[]> {
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    return (members ?? []).map((m) => m.userId);
  }

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

      // @everyone taban rolü: tüm üyelere örtük uygulanır (GuildMemberRole bağı gerekmez)
      await tx.role.create({
        data: {
          guildId: guild.id,
          name: '@everyone',
          color: '#99AAB5',
          position: 0,
          hoist: false,
          mentionable: false,
          permissions: DEFAULT_EVERYONE_PERMISSIONS,
          isEveryone: true,
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

    // Her guild'in kanalları için okunmamış mesaj + okunmamış bahsetme sayılarını paralel hesapla
    const guildCounts = await Promise.all(
      activeGuilds.map(async (m) => {
        const channelCounts = await Promise.all(
          m.guild.channels.map(async (ch) => {
            const lastRead = ch.channelReads[0]?.lastReadAt ?? null;
            const base = {
              channelId: ch.id,
              deletedAt: null,
              authorId: { not: userId }, // kendi mesajları sayma
              ...(lastRead !== null && { createdAt: { gt: lastRead } }),
            };
            const [unread, mentions] = await Promise.all([
              this.prisma.message.count({ where: base }),
              this.prisma.message.count({ where: { ...base, mentions: { has: userId } } }),
            ]);
            return { unread, mentions };
          }),
        );
        return {
          unread: channelCounts.reduce((s, c) => s + c.unread, 0),
          mentions: channelCounts.reduce((s, c) => s + c.mentions, 0),
        };
      }),
    );

    return activeGuilds.map((m, i) => toGuildDto(m.guild, guildCounts[i].unread, guildCounts[i].mentions));
  }

  /**
   * PATCH /guilds/:id — MANAGE_GUILD izni gerekir.
   * adultsOnly değişiyorsa YALNIZ OWNER (sözleşme §65 — sahip kararı).
   */
  async update(userId: string, guildId: string, dto: UpdateGuildDto) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId, deletedAt: null },
    });
    if (!guild) {
      throw new NotFoundException({ message: 'Sunucu bulunamadı.', error: 'GUILD_NOT_FOUND' });
    }

    // adultsOnly GERÇEKTEN değişiyorsa → yalnız OWNER (MANAGE_GUILD yetmez).
    // Aynı değer gönderilirse kapı tetiklenmez (MANAGE_GUILD yöneticisi ad/kural düzenleyebilsin).
    if (dto.adultsOnly !== undefined && dto.adultsOnly !== guild.adultsOnly) {
      const membership = await this.prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId, userId } },
      });
      if (!membership || membership.role !== 'OWNER') {
        throw new ForbiddenException({ message: 'Bu ayarı yalnız ortam sahibi değiştirebilir.', error: 'FORBIDDEN' });
      }
    }

    // Genel guild ayar (ad/ikon/kurallar) → MANAGE_GUILD
    await this.membership.requireGuildMembership(userId, guildId);
    const canManage = await this.permissions.hasGuildPermission(userId, guildId, 'MANAGE_GUILD');
    if (!canManage) {
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
        roleLinks: {
          include: { role: true },
          orderBy: { role: { position: 'desc' } },
        },
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
        // @everyone örtük — roleLinks'te isEveryone=true olanlar çıkar (örtük olduğundan atanmaz zaten)
        roles: mapRoleLinks(m.roleLinks),
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
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        roleLinks: { include: { role: true } },
      },
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

    const dto2: GuildMemberDto = {
      userId: updated.user.id,
      username: updated.user.username,
      avatarUrl: updated.user.avatarUrl,
      role: updated.role,
      roles: mapRoleLinks(updated.roleLinks),
    };

    // REV-14 realtime: rol değişimini tüm üyelere yay (üye listesi anlık güncellensin)
    this.realtime.emitToUsers(await this.guildMemberIds(guildId), 'guild.member_updated', {
      guildId,
      member: dto2,
    });

    return dto2;
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
    // 1. Actor erişim + KICK_MEMBERS izin kontrolü — ÖNCE yetki (sızıntı önleme)
    await this.membership.requireGuildMembership(actorId, guildId);
    const canKick = await this.permissions.hasGuildPermission(actorId, guildId, 'KICK_MEMBERS');
    if (!canKick) {
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

    // 5. Üye hiyerarşisi: hedef üyenin en yüksek position < aktörünki (OWNER muaf)
    await this.permissions.requireMemberHierarchy(actorId, guildId, targetUserId);

    // 6. Tx: GuildMember sil + bu guild'in kanallarındaki ChannelMember kayıtlarını sil
    //    (özel kanal erişimi atılanın üzerinde kalmasın)
    const guildChannels = await this.prisma.channel.findMany({
      where: { guildId, deletedAt: null },
      select: { id: true },
    });
    const channelIds = guildChannels.map((ch) => ch.id);

    const kickedMemberId = targetMembership.id;

    // REV-14: silmeden ÖNCE kalan üyeleri al (atılan + mevcutlar bildirilecek)
    const recipientsBeforeKick = await this.guildMemberIds(guildId);

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

    // REV-14 realtime: kalan üyeler listeden düşürsün; atılan kişi ortamı kapatsın.
    this.realtime.emitToUsers(recipientsBeforeKick, 'guild.member_left', {
      guildId,
      userId: targetUserId,
    });

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
        },
      },
    });

    return null;
  }

  // ─── §D: Ortamdan ayrıl (kendi) ──────────────────────────────────────────
  /** POST /guilds/:id/leave — OWNER ayrılamaz (önce devret/sil). Üyelik + ChannelMember temizlenir. */
  async leaveGuild(userId: string, guildId: string): Promise<null> {
    const { membership } = await this.membership.requireGuildMembership(userId, guildId);
    if (membership.role === GuildRole.OWNER) {
      throw new BadRequestException({
        message: 'Ortam sahibi ayrılamaz; önce sahipliği devredin veya ortamı silin.',
        error: 'OWNER_CANNOT_LEAVE',
      });
    }
    const recipients = await this.guildMemberIds(guildId);
    const channelIds = (
      await this.prisma.channel.findMany({ where: { guildId, deletedAt: null }, select: { id: true } })
    ).map((c) => c.id);
    await this.prisma.$transaction([
      this.prisma.channelMember.deleteMany({ where: { userId, channelId: { in: channelIds } } }),
      this.prisma.guildMember.delete({ where: { guildId_userId: { guildId, userId } } }),
    ]);
    this.realtime.emitToUsers(recipients, 'guild.member_left', { guildId, userId });
    return null;
  }

  // ─── §E: Sahiplik devri (R7 — yalnız OWNER) ──────────────────────────────
  /** POST /guilds/:id/members/:userId/transfer — hedef OWNER, eski sahip ADMIN olur (atomik). */
  async transferOwnership(actorId: string, guildId: string, targetUserId: string): Promise<null> {
    await this.requireOwner(actorId, guildId);
    if (actorId === targetUserId) {
      throw new BadRequestException({ message: 'Zaten ortam sahibisiniz.', error: 'ALREADY_OWNER' });
    }
    const target = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: targetUserId } },
    });
    if (!target) {
      throw new NotFoundException({ message: 'Kullanıcı bu sunucunun üyesi değil.', error: 'NOT_GUILD_MEMBER' });
    }

    const result = await this.prisma.$transaction([
      this.prisma.guild.update({ where: { id: guildId }, data: { ownerId: targetUserId } }),
      this.prisma.guildMember.update({
        where: { guildId_userId: { guildId, userId: targetUserId } },
        data: { role: GuildRole.OWNER },
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
          roleLinks: { include: { role: true } },
        },
      }),
      this.prisma.guildMember.update({
        where: { guildId_userId: { guildId, userId: actorId } },
        data: { role: GuildRole.ADMIN },
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
          roleLinks: { include: { role: true } },
        },
      }),
    ]);
    const newOwner = result[1];
    const oldOwner = result[2];

    const recipients = await this.guildMemberIds(guildId);
    for (const m of [newOwner, oldOwner]) {
      this.realtime.emitToUsers(recipients, 'guild.member_updated', {
        guildId,
        member: { userId: m.user.id, username: m.user.username, avatarUrl: m.user.avatarUrl, role: m.role, roles: mapRoleLinks(m.roleLinks) },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'guild.ownership_transferred',
        entityType: 'Guild',
        entityId: guildId,
        metadata: { guildId, targetUserId },
      },
    });
    return null;
  }

  // ─── §F: Ortam-ban (kalıcı; kick + tekrar davetle giremez) ───────────────
  /** POST /guilds/:id/members/:userId/ban — BAN_MEMBERS izni + üye hiyerarşisi + GuildBan kaydı. */
  async banMember(actorId: string, guildId: string, targetUserId: string, reason?: string): Promise<null> {
    await this.membership.requireGuildMembership(actorId, guildId);
    const canBan = await this.permissions.hasGuildPermission(actorId, guildId, 'BAN_MEMBERS');
    if (!canBan) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
    if (actorId === targetUserId) {
      throw new BadRequestException({ message: 'Kendinizi yasaklayamazsınız.', error: 'CANNOT_BAN_SELF' });
    }
    const target = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: targetUserId } },
    });
    if (!target) {
      throw new NotFoundException({ message: 'Kullanıcı bu sunucunun üyesi değil.', error: 'NOT_GUILD_MEMBER' });
    }
    if (target.role === GuildRole.OWNER) {
      throw new BadRequestException({ message: 'Ortam sahibi yasaklanamaz.', error: 'CANNOT_BAN_OWNER' });
    }
    // Üye hiyerarşisi: hedef üyenin en yüksek position < aktörünki (OWNER muaf)
    await this.permissions.requireMemberHierarchy(actorId, guildId, targetUserId);

    const recipients = await this.guildMemberIds(guildId);
    const channelIds = (
      await this.prisma.channel.findMany({ where: { guildId, deletedAt: null }, select: { id: true } })
    ).map((c) => c.id);
    await this.prisma.$transaction([
      this.prisma.channelMember.deleteMany({ where: { userId: targetUserId, channelId: { in: channelIds } } }),
      this.prisma.guildMember.delete({ where: { guildId_userId: { guildId, userId: targetUserId } } }),
      this.prisma.guildBan.upsert({
        where: { guildId_userId: { guildId, userId: targetUserId } },
        update: { bannedById: actorId, reason: reason ?? null },
        create: { guildId, userId: targetUserId, bannedById: actorId, reason: reason ?? null },
      }),
    ]);
    this.realtime.emitToUsers(recipients, 'guild.member_left', { guildId, userId: targetUserId });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'guild.member_banned',
        entityType: 'GuildMember',
        entityId: target.id,
        metadata: { guildId, targetUserId, reason: reason ?? null },
      },
    });
    return null;
  }

  /** GET /guilds/:id/bans — BAN_MEMBERS izni; yasaklı kullanıcılar (username çözülerek). */
  async listBans(userId: string, guildId: string) {
    await this.membership.requireGuildMembership(userId, guildId);
    const canBan = await this.permissions.hasGuildPermission(userId, guildId, 'BAN_MEMBERS');
    if (!canBan) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
    const bans = await this.prisma.guildBan.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } });
    const users = await this.prisma.user.findMany({
      where: { id: { in: bans.map((b) => b.userId) } },
      select: { id: true, username: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return bans.map((b) => ({
      userId: b.userId,
      username: byId.get(b.userId)?.username ?? b.userId,
      avatarUrl: byId.get(b.userId)?.avatarUrl ?? null,
      reason: b.reason,
      bannedAt: b.createdAt.toISOString(),
    }));
  }

  /** DELETE /guilds/:id/bans/:userId — BAN_MEMBERS izni; yasağı kaldır. */
  async unbanMember(actorId: string, guildId: string, targetUserId: string): Promise<null> {
    await this.membership.requireGuildMembership(actorId, guildId);
    const canBan = await this.permissions.hasGuildPermission(actorId, guildId, 'BAN_MEMBERS');
    if (!canBan) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
    await this.prisma.guildBan.deleteMany({ where: { guildId, userId: targetUserId } });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'guild.member_unbanned',
        entityType: 'GuildBan',
        entityId: `${guildId}:${targetUserId}`,
        metadata: { guildId, targetUserId },
      },
    });
    return null;
  }
}
