import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from '@prisma/client';

function toChannelDto(channel: Channel, hasUnread = false) {
  return {
    id: channel.id,
    type: channel.type,
    guildId: channel.guildId,
    name: channel.name,
    ageGated: channel.ageGated,
    position: channel.position,
    slowModeSeconds: channel.slowModeSeconds,
    hasUnread,
  };
}

/** OWNER veya ADMIN rolü gerektirir, aksi hâlde 403 FORBIDDEN */
function requireAdminRole(role: string) {
  if (role !== 'OWNER' && role !== 'ADMIN') {
    throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
  }
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
        position: (maxPosition._max.position ?? -1) + 1,
        slowModeSeconds: dto.slowModeSeconds ?? 0,
      },
    });

    return toChannelDto(channel);
  }

  async findByGuild(userId: string, guildId: string) {
    await this.membership.requireGuildMembership(userId, guildId);

    // Kanalları, her kanalın son mesajını ve kullanıcının okuma kaydını tek sorguda çek
    const channels = await this.prisma.channel.findMany({
      where: { guildId, deletedAt: null },
      orderBy: { position: 'asc' },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { authorId: true, createdAt: true },
        },
        channelReads: {
          where: { userId },
          select: { lastReadAt: true },
        },
      },
    });

    return channels.map((ch) => {
      const lastMsg = ch.messages[0] ?? null;
      const lastRead = ch.channelReads[0]?.lastReadAt ?? null;

      let hasUnread = false;
      if (lastMsg) {
        // Kendi son mesajın okunmamış sayılmaz
        if (lastMsg.authorId === userId) {
          hasUnread = false;
        } else if (lastRead === null) {
          // Hiç okuma kaydı yok + mesaj var → okunmamış
          hasUnread = true;
        } else {
          hasUnread = lastMsg.createdAt > lastRead;
        }
      }

      return toChannelDto(ch, hasUnread);
    });
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

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.ageGated !== undefined && { ageGated: dto.ageGated }),
        ...(dto.slowModeSeconds !== undefined && { slowModeSeconds: dto.slowModeSeconds }),
      },
    });

    return toChannelDto(updated);
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
