import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from '@prisma/client';
import { requireAdminRole } from '../../common/utils/guild-role.utils';

export function toChannelDto(channel: Channel, unreadCount = 0) {
  return {
    id: channel.id,
    type: channel.type,
    guildId: channel.guildId,
    categoryId: channel.categoryId,
    name: channel.name,
    ageGated: channel.ageGated,
    isPrivate: channel.isPrivate,
    position: channel.position,
    slowModeSeconds: channel.slowModeSeconds,
    unreadCount,
  };
}

@Injectable()
export class ChannelsService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
  ) {}

  async create(userId: string, guildId: string, dto: CreateChannelDto) {
    const { membership } = await this.membership.requireGuildMembership(userId, guildId);
    requireAdminRole(membership.role);

    if (dto.categoryId) {
      await this.validateCategoryBelongsToGuild(dto.categoryId, guildId);
    }

    const maxPosition = await this.prisma.channel.aggregate({
      where: { guildId, deletedAt: null },
      _max: { position: true },
    });

    const channel = await this.prisma.channel.create({
      data: {
        guildId,
        type: 'GUILD_TEXT',
        name: dto.name,
        ageGated: dto.ageGated ?? false,
        isPrivate: dto.isPrivate ?? false,
        position: (maxPosition._max.position ?? -1) + 1,
        slowModeSeconds: dto.slowModeSeconds ?? 0,
        categoryId: dto.categoryId ?? null,
      },
    });

    return toChannelDto(channel);
  }

  async findByGuild(userId: string, guildId: string) {
    const { membership } = await this.membership.requireGuildMembership(userId, guildId);

    // Kanalları ve kullanıcının okuma kayıtlarını çek
    const channels = await this.prisma.channel.findMany({
      where: { guildId, deletedAt: null },
      orderBy: { position: 'asc' },
      include: {
        channelReads: {
          where: { userId },
          select: { lastReadAt: true },
        },
      },
    });

    // B4/B5 (R7): özel kanal filtresi — OWNER/ADMIN tüm kanalları görür;
    // MEMBER yalnız genel kanallar + üyesi olduğu özel kanalları görür.
    const isPrivileged = membership.role === 'OWNER' || membership.role === 'ADMIN';
    let visibleChannels = channels;
    if (!isPrivileged) {
      // Kullanıcının ChannelMember olduğu kanalların id kümesini tek sorguyla al
      const channelMemberships = await this.prisma.channelMember.findMany({
        where: { userId, channelId: { in: channels.map((ch) => ch.id) } },
        select: { channelId: true },
      });
      const memberChannelIds = new Set(channelMemberships.map((cm) => cm.channelId));

      visibleChannels = channels.filter(
        (ch) => !ch.isPrivate || memberChannelIds.has(ch.id),
      );
    }

    // Her görünür kanal için okunmamış mesaj sayısını paralel olarak hesapla
    const unreadCounts = await Promise.all(
      visibleChannels.map((ch) => {
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

    return visibleChannels.map((ch, i) => toChannelDto(ch, unreadCounts[i]));
  }

  /** POST /channels/:id/read — kanaldaki son mesajı okundu işaretle */
  async markRead(userId: string, channelId: string) {
    await this.membership.requireChannelAccess(userId, channelId);

    await this.prisma.channelRead.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { lastReadAt: new Date() },
      create: { userId, channelId, lastReadAt: new Date() },
    });

    return null;
  }

  async update(userId: string, channelId: string, dto: UpdateChannelDto) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    const { membership } = await this.membership.requireGuildMembership(userId, channel.guildId!);
    requireAdminRole(membership.role);

    // categoryId: null → kategorisiz; string → doğrula; undefined → dokunma
    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      await this.validateCategoryBelongsToGuild(dto.categoryId, channel.guildId!);
    }

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.ageGated !== undefined && { ageGated: dto.ageGated }),
        ...(dto.isPrivate !== undefined && { isPrivate: dto.isPrivate }),
        ...(dto.slowModeSeconds !== undefined && { slowModeSeconds: dto.slowModeSeconds }),
        ...('categoryId' in dto && { categoryId: dto.categoryId ?? null }),
      },
    });

    return toChannelDto(updated);
  }

  /** Kategori var mı, aynı guild'e ait mi, silinmemiş mi — değilse 400 INVALID_CATEGORY */
  private async validateCategoryBelongsToGuild(categoryId: string, guildId: string) {
    const category = await this.prisma.channelCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.deletedAt !== null || category.guildId !== guildId) {
      throw new BadRequestException({ message: 'Geçersiz kategori.', error: 'INVALID_CATEGORY' });
    }
  }

  async remove(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    const { membership } = await this.membership.requireGuildMembership(userId, channel.guildId!);
    requireAdminRole(membership.role);

    // Son kanal koruması: guild'in en az 1 aktif kanalı kalmalı
    const activeCount = await this.prisma.channel.count({
      where: { guildId: channel.guildId!, deletedAt: null },
    });
    if (activeCount <= 1) {
      throw new ConflictException({ message: 'Son kanal silinemez; ortamda en az bir kanal olmalıdır.', error: 'LAST_CHANNEL' });
    }

    await this.prisma.channel.update({
      where: { id: channelId },
      data: { deletedAt: new Date() },
    });

    return null;
  }
}
