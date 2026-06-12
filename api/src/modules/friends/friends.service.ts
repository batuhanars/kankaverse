import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';

const HANDLE_REGEX = /^[a-zA-Z0-9_.]{3,32}#\d{4}$/;

function toFriendCodeUserDto(user: { id: string; username: string; avatarUrl: string | null }) {
  return { id: user.id, username: user.username, avatarUrl: user.avatarUrl };
}

@Injectable()
export class FriendsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  async getFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: { id: true, username: true, avatarUrl: true } },
        addressee: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return friendships.map((f) => {
      const friend = f.requesterId === userId ? f.addressee : f.requester;
      return {
        friendshipId: f.id,
        user: toFriendCodeUserDto(friend),
        since: f.updatedAt.toISOString(),
      };
    });
  }

  async getFriendRequests(userId: string) {
    const requests = await this.prisma.friendship.findMany({
      where: {
        status: 'PENDING',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: { id: true, username: true, avatarUrl: true } },
        addressee: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.id,
      direction: r.requesterId === userId ? ('outgoing' as const) : ('incoming' as const),
      user: toFriendCodeUserDto(r.requesterId === userId ? r.addressee : r.requester),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async sendFriendRequest(senderId: string, dto: SendFriendRequestDto) {
    if (!HANDLE_REGEX.test(dto.handle)) {
      throw new BadRequestException({ message: 'Geçersiz kullanıcı tanımlayıcısı.', error: 'INVALID_HANDLE' });
    }

    const hashIndex = dto.handle.lastIndexOf('#');
    const username = dto.handle.slice(0, hashIndex);
    const tag = dto.handle.slice(hashIndex + 1);

    const target = await this.prisma.user.findFirst({
      where: { username, friendTag: tag, deletedAt: null },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!target) {
      throw new NotFoundException({ message: 'Bu handle ile kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
    }

    if (target.id === senderId) {
      throw new BadRequestException({ message: 'Kendinize arkadaşlık isteği gönderemezsiniz.', error: 'CANNOT_FRIEND_SELF' });
    }

    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: target.id },
          { blockerId: target.id, blockedId: senderId },
        ],
      },
    });
    if (block) {
      throw new ForbiddenException({ message: 'Bu kullanıcıya istek gönderemezsiniz.', error: 'BLOCKED' });
    }

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: senderId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: senderId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw new ConflictException({ message: 'Zaten arkadaşsınız.', error: 'ALREADY_FRIENDS' });
      }
      if (existing.status === 'PENDING') {
        // Karşı taraftan bekleyen istek varsa otomatik kabul et
        if (existing.addresseeId === senderId) {
          const accepted = await this.prisma.friendship.update({
            where: { id: existing.id },
            data: { status: 'ACCEPTED' },
            include: {
              requester: { select: { id: true, username: true, avatarUrl: true } },
              addressee: { select: { id: true, username: true, avatarUrl: true } },
            },
          });
          const result = {
            type: 'accepted' as const,
            friendshipId: accepted.id,
            user: toFriendCodeUserDto(accepted.requester),
            since: accepted.updatedAt.toISOString(),
          };
          // Özgün requester'a friend.accept yay
          this.realtime.emitToUser(accepted.requesterId, 'friend.accept', {
            friendshipId: accepted.id,
            user: toFriendCodeUserDto(accepted.addressee),
            since: accepted.updatedAt.toISOString(),
          });
          return result;
        }
        throw new ConflictException({ message: 'Bekleyen bir istek zaten mevcut.', error: 'REQUEST_EXISTS' });
      }
      // DECLINED → izin ver, yeni istek olarak güncelle
      if (existing.requesterId === senderId) {
        const updated = await this.prisma.friendship.update({
          where: { id: existing.id },
          data: { status: 'PENDING', requesterId: senderId, addresseeId: target.id },
          include: {
            addressee: { select: { id: true, username: true, avatarUrl: true } },
            requester: { select: { id: true, username: true, avatarUrl: true } },
          },
        });
        const result = {
          type: 'requested' as const,
          id: updated.id,
          direction: 'outgoing' as const,
          user: toFriendCodeUserDto(updated.addressee),
          createdAt: updated.createdAt.toISOString(),
        };
        this.realtime.emitToUser(target.id, 'friend.request', {
          id: updated.id,
          direction: 'incoming',
          user: toFriendCodeUserDto(updated.requester),
          createdAt: updated.createdAt.toISOString(),
        });
        return result;
      }
      // Eski declined isteği gönderen hedef; yeni istek
    }

    const request = await this.prisma.friendship.create({
      data: { requesterId: senderId, addresseeId: target.id },
      include: {
        addressee: { select: { id: true, username: true, avatarUrl: true } },
        requester: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
    const result = {
      type: 'requested' as const,
      id: request.id,
      direction: 'outgoing' as const,
      user: toFriendCodeUserDto(request.addressee),
      createdAt: request.createdAt.toISOString(),
    };
    this.realtime.emitToUser(target.id, 'friend.request', {
      id: request.id,
      direction: 'incoming',
      user: toFriendCodeUserDto(request.requester),
      createdAt: request.createdAt.toISOString(),
    });
    return result;
  }

  async acceptFriendRequest(userId: string, requestId: string) {
    const request = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!request || request.status !== 'PENDING') {
      throw new NotFoundException({ message: 'İstek bulunamadı.', error: 'REQUEST_NOT_FOUND' });
    }
    if (request.addresseeId !== userId) {
      throw new ForbiddenException({ message: 'Bu isteği kabul etme yetkiniz yok.', error: 'FORBIDDEN' });
    }

    const accepted = await this.prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' },
      include: {
        requester: { select: { id: true, username: true, avatarUrl: true } },
        addressee: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
    const result = {
      friendshipId: accepted.id,
      user: toFriendCodeUserDto(accepted.requester),
      since: accepted.updatedAt.toISOString(),
    };
    // Özgün requester'a friend.accept yay
    this.realtime.emitToUser(accepted.requesterId, 'friend.accept', {
      friendshipId: accepted.id,
      user: toFriendCodeUserDto(accepted.addressee),
      since: accepted.updatedAt.toISOString(),
    });
    return result;
  }

  async declineFriendRequest(userId: string, requestId: string) {
    const request = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!request || request.status !== 'PENDING') {
      throw new NotFoundException({ message: 'İstek bulunamadı.', error: 'REQUEST_NOT_FOUND' });
    }
    if (request.addresseeId !== userId) {
      throw new ForbiddenException({ message: 'Bu isteği reddetme yetkiniz yok.', error: 'FORBIDDEN' });
    }

    await this.prisma.friendship.update({ where: { id: requestId }, data: { status: 'DECLINED' } });
    // Reddetme → event yok (Discord da bildirmez; gönderene "reddedildi" sızdırma)
    return null;
  }

  async removeFriend(userId: string, targetUserId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userId, addresseeId: targetUserId },
          { requesterId: targetUserId, addresseeId: userId },
        ],
      },
    });
    if (!friendship) {
      throw new NotFoundException({ message: 'Arkadaşlık bulunamadı.', error: 'FRIENDSHIP_NOT_FOUND' });
    }

    await this.prisma.friendship.delete({ where: { id: friendship.id } });
    this.realtime.emitToUser(targetUserId, 'friend.remove', { userId });
    return null;
  }
}
