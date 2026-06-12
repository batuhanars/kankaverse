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

  /**
   * GET /dm/channels — DM kanalları.
   *
   * G4: clearedAt olan ve sonrasında YENİ MESAJ OLMAYAN kanallar listede gösterilmez.
   * Yeni mesaj gelince kanal otomatik geri döner (yeni mesaj createdAt > clearedAt).
   *
   * G3: canMessage + selfBlocked hesaplanır (blok durumu).
   * selfBlocked = yalnız "ben onu engelledim"; "o beni engelledi" ASLA dönmez.
   */
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

    const dmMemberships = memberships.filter((m) => m.channel.type === 'DM');

    // G3: tüm bloklarımı tek sorguda çek (batch)
    const otherUserIds = dmMemberships
      .map((m) => m.channel.members.find((cm) => cm.userId !== userId)?.userId)
      .filter((id): id is string => !!id);

    const [blockedByMeRecords, blockedByOtherRecords] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: { blockerId: userId, blockedId: { in: otherUserIds } },
        select: { blockedId: true },
      }),
      this.prisma.userBlock.findMany({
        where: { blockedId: userId, blockerId: { in: otherUserIds } },
        select: { blockerId: true },
      }),
    ]);

    const selfBlockedSet = new Set(blockedByMeRecords.map((b) => b.blockedId));
    const blockedMeSet = new Set(blockedByOtherRecords.map((b) => b.blockerId));

    const result: Array<{
      id: string;
      otherUser: { id: string; username: string; avatarUrl: string | null } | null;
      lastMessage: { id: string; channelId: string; content: string; replyToId: string | null; author: { id: string; username: string; avatarUrl: string | null }; createdAt: string } | null;
      unread: boolean;
      canMessage: boolean;
      selfBlocked: boolean;
    }> = [];

    for (const m of dmMemberships) {
      const otherMember = m.channel.members.find((cm) => cm.userId !== userId);
      const lastMsg = m.channel.messages[0] ?? null;

      // G4: clearedAt filtresi — temizlendi ve sonrasında mesaj yok → listeye alma
      if (m.clearedAt !== null) {
        const hasNewMessage = lastMsg !== null && lastMsg.createdAt > m.clearedAt;
        if (!hasNewMessage) continue;
      }

      const unread = lastMsg !== null && (m.lastReadAt === null || lastMsg.createdAt > m.lastReadAt);
      const otherId = otherMember?.user.id;
      const selfBlocked = otherId ? selfBlockedSet.has(otherId) : false;
      const anyBlock = otherId ? (selfBlockedSet.has(otherId) || blockedMeSet.has(otherId)) : false;
      const canMessage = !anyBlock;

      result.push({
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
        canMessage,
        selfBlocked,
      });
    }

    return result;
  }

  async getOrCreateDmChannel(senderId: string, dto: CreateDmChannelDto) {
    const targetId = dto.userId;

    const result = await this.dmPermission.canDm(senderId, targetId);
    if (!result.allowed) {
      // G3: blok dahil tüm ret nedenleri jenerik DM_NOT_ALLOWED (BLOCKED istemciye dönmez)
      throw new ForbiddenException({ message: 'Bu kullanıcıya mesaj gönderemezsiniz.', error: 'DM_NOT_ALLOWED' });
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

  /**
   * DELETE /dm/channels/:id — G4 inbox soft-delete.
   *
   * Çağıranın ChannelMember.clearedAt = now. Mesaj DB'de durur; karşı taraf etkilenmez.
   * Yeni mesaj gelince kanal tekrar listede görünür (getDmChannels filtresi).
   * Event YOK — lokal etki.
   */
  async clearDmChannel(userId: string, channelId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) {
      throw new ForbiddenException({ message: 'Bu kanala erişim izniniz yok.', error: 'NOT_CHANNEL_MEMBER' });
    }
    await this.prisma.channelMember.update({
      where: { id: member.id },
      data: { clearedAt: new Date() },
    });
    return null;
  }

  private async toDmChannelDto(
    channelId: string,
    otherUser: { id: string; username: string; avatarUrl: string | null },
    userId: string,
  ) {
    const [membership, lastMsg, selfBlockRecord, otherBlockRecord] = await Promise.all([
      this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      }),
      this.prisma.message.findFirst({
        where: { channelId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { id: true, username: true, avatarUrl: true } } },
      }),
      // G3: selfBlocked = yalnız "ben onu engelledim"
      this.prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: otherUser.id } },
        select: { id: true },
      }),
      // canMessage için "o beni engelledi mi" — DTO'da açığa ÇIKMAZ, yalnız canMessage hesabında kullanılır
      this.prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: otherUser.id, blockedId: userId } },
        select: { id: true },
      }),
    ]);

    const unread =
      lastMsg !== null && (membership?.lastReadAt === null || (lastMsg.createdAt > (membership?.lastReadAt ?? new Date(0))));

    const selfBlocked = !!selfBlockRecord;
    const canMessage = !selfBlocked && !otherBlockRecord;

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
      canMessage,
      selfBlocked,
    };
  }
}
