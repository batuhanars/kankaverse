import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DmPermissionService } from '../../shared/dm-permission/dm-permission.service';
import { CreateDmChannelDto } from './dto/create-dm-channel.dto';

@Injectable()
export class DmService {
  constructor(
    private prisma: PrismaService,
    private dmPermission: DmPermissionService,
  ) {}

  async getDmChannels(userId: string) {
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      include: {
        channel: {
          include: {
            members: {
              include: { user: { select: { id: true, username: true, avatarUrl: true } } },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { author: { select: { id: true, username: true, avatarUrl: true } } },
            },
          },
        },
      },
    });

    return memberships
      .filter((m) => m.channel.type === 'DM')
      .map((m) => {
        const otherMember = m.channel.members.find((cm) => cm.userId !== userId);
        const lastMsg = m.channel.messages[0] ?? null;
        const unread = lastMsg !== null && (m.lastReadAt === null || lastMsg.createdAt > m.lastReadAt);
        return {
          id: m.channel.id,
          otherUser: otherMember
            ? { id: otherMember.user.id, username: otherMember.user.username, avatarUrl: otherMember.user.avatarUrl }
            : null,
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                channelId: lastMsg.channelId,
                content: lastMsg.content,
                replyToId: lastMsg.replyToId,
                author: { id: lastMsg.author.id, username: lastMsg.author.username, avatarUrl: lastMsg.author.avatarUrl },
                createdAt: lastMsg.createdAt.toISOString(),
              }
            : null,
          unread,
        };
      });
  }

  async getOrCreateDmChannel(senderId: string, dto: CreateDmChannelDto) {
    const targetId = dto.userId;

    const result = await this.dmPermission.canDm(senderId, targetId);
    if (!result.allowed) {
      throw new ForbiddenException({ message: 'DM açılamıyor.', error: result.reason ?? 'DM_NOT_ALLOWED' });
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!target) throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });

    // Mevcut DM kanalını ara
    const existingMembership = await this.prisma.channelMember.findFirst({
      where: {
        userId: senderId,
        channel: {
          type: 'DM',
          members: { some: { userId: targetId } },
        },
      },
      include: { channel: true },
    });

    if (existingMembership) {
      return this.toDmChannelDto(existingMembership.channel.id, target, senderId);
    }

    // Yeni DM kanalı oluştur (atomik transaction)
    const channel = await this.prisma.$transaction(async (tx) => {
      const ch = await tx.channel.create({
        data: { type: 'DM', guildId: null },
      });
      await tx.channelMember.createMany({
        data: [
          { channelId: ch.id, userId: senderId },
          { channelId: ch.id, userId: targetId },
        ],
      });
      return ch;
    });

    return this.toDmChannelDto(channel.id, target, senderId);
  }

  async markRead(userId: string, channelId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) {
      throw new ForbiddenException({ message: 'Bu kanala erişim izniniz yok.', error: 'NOT_CHANNEL_MEMBER' });
    }
    await this.prisma.channelMember.update({
      where: { id: member.id },
      data: { lastReadAt: new Date() },
    });
    return null;
  }

  private async toDmChannelDto(
    channelId: string,
    otherUser: { id: string; username: string; avatarUrl: string | null },
    userId: string,
  ) {
    const [membership, lastMsg] = await Promise.all([
      this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      }),
      this.prisma.message.findFirst({
        where: { channelId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { id: true, username: true, avatarUrl: true } } },
      }),
    ]);

    const unread =
      lastMsg !== null && (membership?.lastReadAt === null || (lastMsg.createdAt > (membership?.lastReadAt ?? new Date(0))));

    return {
      id: channelId,
      otherUser: { id: otherUser.id, username: otherUser.username, avatarUrl: otherUser.avatarUrl },
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            channelId: lastMsg.channelId,
            content: lastMsg.content,
            replyToId: lastMsg.replyToId,
            author: { id: lastMsg.author.id, username: lastMsg.author.username, avatarUrl: lastMsg.author.avatarUrl },
            createdAt: lastMsg.createdAt.toISOString(),
          }
        : null,
      unread,
    };
  }
}
