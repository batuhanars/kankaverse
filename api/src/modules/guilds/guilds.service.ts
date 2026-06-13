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
}
