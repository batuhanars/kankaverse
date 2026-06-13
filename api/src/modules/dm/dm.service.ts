import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DmPermissionService } from '../../shared/dm-permission/dm-permission.service';
import { CreateDmChannelDto } from './dto/create-dm-channel.dto';
import { CreateGroupDmDto } from './dto/create-group-dm.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { RenameGroupDmDto } from './dto/rename-group-dm.dto';

@Injectable()
export class DmService {
  constructor(
    private prisma: PrismaService,
    private dmPermission: DmPermissionService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // T&S yardımcısı: karşılıklı arkadaşlık kontrolü
  // ACCEPTED friendship: her iki yönde kontrol (requester veya addressee olabilir)
  // ─────────────────────────────────────────────────────────────────────────────
  async isMutualFriend(aId: string, bId: string): Promise<boolean> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: aId, addresseeId: bId },
          { requesterId: bId, addresseeId: aId },
        ],
      },
      select: { id: true },
    });
    return friendship !== null;
  }

  /**
   * GET /dm/channels — DM kanalları (1-1 + GROUP_DM).
   *
   * G4: clearedAt olan ve sonrasında YENİ MESAJ OLMAYAN 1-1 kanallar listede gösterilmez.
   * G3: canMessage + selfBlocked hesaplanır (blok durumu) — yalnız 1-1 için.
   *
   * Discriminated union dönüşü:
   *  - 1-1 DM: type='DM', otherUser, canMessage, selfBlocked
   *  - GROUP_DM: type='GROUP_DM', name, ownerId, members[{id,username,avatarUrl}]
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

    // Silinmiş kanalları filtrele (kanal silinmişse üyelik hâlâ olabilir)
    const activeMemberships = memberships.filter((m) => m.channel.deletedAt === null);

    const dmMemberships = activeMemberships.filter((m) => m.channel.type === 'DM');
    const groupMemberships = activeMemberships.filter((m) => m.channel.type === 'GROUP_DM');

    // G3: 1-1 DM blok kontrolü (batch)
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

    const result: Array<Record<string, unknown>> = [];

    // 1-1 DM kanalları
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
        type: 'DM' as const,
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

    // GROUP_DM kanalları
    for (const m of groupMemberships) {
      const lastMsg = m.channel.messages[0] ?? null;
      const unread = lastMsg !== null && (m.lastReadAt === null || lastMsg.createdAt > m.lastReadAt);

      result.push({
        id: m.channel.id,
        type: 'GROUP_DM' as const,
        name: m.channel.name ?? null,
        ownerId: m.channel.ownerId ?? null,
        members: m.channel.members.map((cm) => ({
          id: cm.user.id,
          username: cm.user.username,
          avatarUrl: cm.user.avatarUrl,
        })),
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

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /dm/groups
  // [R7] T&S kapı sırası (insan incelemesi zorunlu):
  //   1. creator isMinor → 403 GROUP_MINOR_FORBIDDEN
  //   2. her memberId: isMutualFriend değilse → 400 NOT_FRIEND (jenerik)
  //      member.isMinor → 403 GROUP_MINOR_FORBIDDEN (jenerik; statü sızdırılmaz)
  //   3. $transaction: Channel{GROUP_DM} + ChannelMember (creator + members) → 201
  // ─────────────────────────────────────────────────────────────────────────────
  async createGroupDm(creatorId: string, dto: CreateGroupDmDto) {
    // Benzersizlik + kendini içermez
    const uniqueIds = [...new Set(dto.memberIds)].filter((id) => id !== creatorId);
    if (uniqueIds.length === 0 || uniqueIds.length > 9) {
      throw new BadRequestException({ message: 'Geçersiz üye listesi.', error: 'INVALID_MEMBER_LIST' });
    }

    // Kapı 1: creator isMinor?
    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId, deletedAt: null },
      select: { isMinor: true },
    });
    if (!creator) throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
    if (creator.isMinor) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'GROUP_MINOR_FORBIDDEN' });
    }

    // Kapı 2: her üye — karşılıklı arkadaş + minör değil
    const members = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, isMinor: true, username: true, avatarUrl: true },
    });

    // Statü sızdırma engeli: eksik kullanıcı = jenerik NOT_FRIEND (bulunamadı veya arkadaş değil farkı yok)
    for (const memberId of uniqueIds) {
      const member = members.find((m) => m.id === memberId);
      if (!member) {
        throw new BadRequestException({ message: 'Kullanıcı eklenemedi.', error: 'NOT_FRIEND' });
      }
      // G1: minör hedef → jenerik NOT_FRIEND (statü sızdırılmaz; arkadaş-olmayan ile ayırt edilemez)
      const mutual = await this.isMutualFriend(creatorId, memberId);
      if (member.isMinor || !mutual) {
        throw new BadRequestException({ message: 'Kullanıcı eklenemedi.', error: 'NOT_FRIEND' });
      }
    }

    // Kapı 3: transaction — kanal + üyeler
    const channel = await this.prisma.$transaction(async (tx) => {
      const ch = await tx.channel.create({
        data: {
          type: 'GROUP_DM',
          guildId: null,
          ownerId: creatorId,
          name: dto.name ?? null,
        },
        include: { members: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } } },
      });
      await tx.channelMember.createMany({
        data: [
          { channelId: ch.id, userId: creatorId },
          ...uniqueIds.map((id) => ({ channelId: ch.id, userId: id })),
        ],
      });
      return ch;
    });

    // Üye listesini taze çek (createMany sonrası include çalışmaz)
    const freshMembers = await this.prisma.channelMember.findMany({
      where: { channelId: channel.id },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    return {
      id: channel.id,
      type: 'GROUP_DM' as const,
      name: channel.name ?? null,
      ownerId: creatorId,
      members: freshMembers.map((cm) => ({
        id: cm.user.id,
        username: cm.user.username,
        avatarUrl: cm.user.avatarUrl,
      })),
      lastMessage: null,
      unread: false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /dm/groups/:id/members
  // [R7] ekleyenin arkadaşı + minör değil + zaten üye değil
  // ─────────────────────────────────────────────────────────────────────────────
  async addGroupMember(callerId: string, groupId: string, dto: AddGroupMemberDto) {
    const channel = await this.requireGroupChannel(groupId);
    await this.requireGroupMember(callerId, groupId);

    const targetId = dto.userId;
    if (targetId === callerId) {
      throw new BadRequestException({ message: 'Kendinizi ekleyemezsiniz.', error: 'CANNOT_ADD_SELF' });
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: { id: true, isMinor: true, username: true, avatarUrl: true },
    });
    if (!target) {
      throw new BadRequestException({ message: 'Kullanıcı eklenemedi.', error: 'NOT_FRIEND' });
    }
    // G1: minör hedef → jenerik NOT_FRIEND (statü sızdırılmaz; arkadaş-olmayan ile ayırt edilemez)
    const mutual = await this.isMutualFriend(callerId, targetId);
    if (target.isMinor || !mutual) {
      throw new BadRequestException({ message: 'Kullanıcı eklenemedi.', error: 'NOT_FRIEND' });
    }

    const existing = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId: targetId } },
    });
    if (existing) {
      throw new ConflictException({ message: 'Kullanıcı zaten grupta.', error: 'ALREADY_MEMBER' });
    }

    await this.prisma.channelMember.create({
      data: { channelId: groupId, userId: targetId },
    });

    return {
      id: target.id,
      username: target.username,
      avatarUrl: target.avatarUrl,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /dm/groups/:id/members/me
  // Çağıran ayrılır; kalan < 2 → kanal soft-delete
  // ─────────────────────────────────────────────────────────────────────────────
  async leaveGroupDm(userId: string, groupId: string) {
    await this.requireGroupChannel(groupId);
    const membership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException({ message: 'Bu grubun üyesi değilsiniz.', error: 'NOT_CHANNEL_MEMBER' });
    }

    await this.prisma.channelMember.delete({ where: { id: membership.id } });

    const remaining = await this.prisma.channelMember.count({ where: { channelId: groupId } });
    if (remaining < 2) {
      await this.prisma.channel.update({
        where: { id: groupId },
        data: { deletedAt: new Date() },
      });
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /dm/groups/:id/members/:userId — yalnız owner; hedef üyeyi çıkar
  // ─────────────────────────────────────────────────────────────────────────────
  async removeGroupMember(callerId: string, groupId: string, targetUserId: string) {
    const channel = await this.requireGroupChannel(groupId);

    if (channel.ownerId !== callerId) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    if (targetUserId === callerId) {
      throw new BadRequestException({
        message: 'Kendinizi gruptan çıkaramazsınız. Gruptan ayrılmak için ayrılma seçeneğini kullanın.',
        error: 'CANNOT_REMOVE_SELF',
      });
    }

    const membership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId: targetUserId } },
    });
    if (!membership) {
      throw new NotFoundException({ message: 'Kullanıcı bu grubun üyesi değil.', error: 'MEMBER_NOT_FOUND' });
    }

    await this.prisma.channelMember.delete({ where: { id: membership.id } });

    const remaining = await this.prisma.channelMember.count({ where: { channelId: groupId } });
    if (remaining < 2) {
      await this.prisma.channel.update({
        where: { id: groupId },
        data: { deletedAt: new Date() },
      });
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE /dm/groups/:id — yalnız owner
  // ─────────────────────────────────────────────────────────────────────────────
  async deleteGroupDm(userId: string, groupId: string) {
    const channel = await this.requireGroupChannel(groupId);

    if (channel.ownerId !== userId) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    await this.prisma.channel.update({
      where: { id: groupId },
      data: { deletedAt: new Date() },
    });

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /dm/groups/:id — yalnız owner; grup adı güncelle
  // ─────────────────────────────────────────────────────────────────────────────
  async renameGroupDm(userId: string, groupId: string, dto: RenameGroupDmDto) {
    const channel = await this.requireGroupChannel(groupId);

    if (channel.ownerId !== userId) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    const updated = await this.prisma.channel.update({
      where: { id: groupId },
      data: { name: dto.name },
    });

    return { id: updated.id, name: updated.name };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1-1 DM yardımcıları
  // ─────────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Özel yardımcılar
  // ─────────────────────────────────────────────────────────────────────────────

  /** GROUP_DM kanalı var mı + silinmemiş mi? */
  private async requireGroupChannel(groupId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: groupId, deletedAt: null },
    });
    if (!channel || channel.type !== 'GROUP_DM') {
      throw new NotFoundException({ message: 'Grup bulunamadı.', error: 'GROUP_NOT_FOUND' });
    }
    return channel;
  }

  /** Çağıran grup üyesi mi? */
  private async requireGroupMember(userId: string, groupId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId } },
    });
    if (!member) {
      throw new ForbiddenException({ message: 'Bu grubun üyesi değilsiniz.', error: 'NOT_CHANNEL_MEMBER' });
    }
    return member;
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
      type: 'DM' as const,
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
