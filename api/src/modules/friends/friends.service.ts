import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { FriendPermissionService } from '../../shared/friend-permission/friend-permission.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { SendFriendRequestByUserDto } from './dto/send-friend-request-by-user.dto';

function toFriendCodeUserDto(user: { id: string; username: string; avatarUrl: string | null }) {
  return { id: user.id, username: user.username, avatarUrl: user.avatarUrl };
}

@Injectable()
export class FriendsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private friendPermission: FriendPermissionService,
    private notifications: NotificationsService,
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

  /** G3: hata nedenini HTTP exception'a dönüştür; BLOCKED istemciye dönmez. */
  private throwFromPermissionReason(reason: string | undefined): never {
    switch (reason) {
      case 'CANNOT_FRIEND_SELF':
        throw new BadRequestException({ message: 'Kendinize arkadaşlık isteği gönderemezsiniz.', error: 'CANNOT_FRIEND_SELF' });
      case 'ALREADY_FRIENDS':
        throw new ConflictException({ message: 'Zaten arkadaşsınız.', error: 'ALREADY_FRIENDS' });
      case 'REQUEST_EXISTS':
        throw new ConflictException({ message: 'Bekleyen bir istek zaten mevcut.', error: 'REQUEST_EXISTS' });
      case 'USER_NOT_FOUND':
      default:
        // USER_NOT_FOUND kapsayıcı jenerik: yok / blok / minör / ortam yok — ayırt edilemez (G3)
        throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
    }
  }

  /**
   * İzin alındıktan sonra arkadaşlık kaydını oluştur veya güncelle.
   * - Karşıdan PENDING istek varsa otomatik kabul et.
   * - DECLINED durumu varsa yeniden PENDING yap veya yeni kayıt oluştur.
   * - Hiçbiri yoksa yeni PENDING oluştur.
   */
  private async executeFriendshipCreation(
    senderId: string,
    target: { id: string; username: string; avatarUrl: string | null },
  ) {
    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: senderId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: senderId },
        ],
      },
    });

    // Karşıdan PENDING → otomatik kabul (canSendFriendRequest kural 5'te allowed döndü)
    if (existing?.status === 'PENDING' && existing.addresseeId === senderId) {
      const accepted = await this.prisma.friendship.update({
        where: { id: existing.id },
        data: { status: 'ACCEPTED' },
        include: {
          requester: { select: { id: true, username: true, avatarUrl: true } },
          addressee: { select: { id: true, username: true, avatarUrl: true } },
        },
      });
      this.realtime.emitToUser(accepted.requesterId, 'friend.accept', {
        friendshipId: accepted.id,
        user: toFriendCodeUserDto(accepted.addressee),
        since: accepted.updatedAt.toISOString(),
      });
      // §2 — FRIEND_ACCEPT bildirimi (paralel): istek sahibine, kabul eden = senderId
      await this.notifications.create(accepted.requesterId, {
        type: 'FRIEND_ACCEPT',
        actorId: senderId,
      });
      return {
        type: 'accepted' as const,
        friendshipId: accepted.id,
        user: toFriendCodeUserDto(accepted.requester),
        since: accepted.updatedAt.toISOString(),
      };
    }

    // DECLINED (biz gönderdik) → yeniden PENDING'e çevir
    if (existing?.status === 'DECLINED' && existing.requesterId === senderId) {
      const updated = await this.prisma.friendship.update({
        where: { id: existing.id },
        data: { status: 'PENDING' },
        include: {
          addressee: { select: { id: true, username: true, avatarUrl: true } },
          requester: { select: { id: true, username: true, avatarUrl: true } },
        },
      });
      this.realtime.emitToUser(target.id, 'friend.request', {
        id: updated.id,
        direction: 'incoming',
        user: toFriendCodeUserDto(updated.requester),
        createdAt: updated.createdAt.toISOString(),
      });
      // §2 — FRIEND_REQUEST bildirimi (paralel): hedefe, gönderen = senderId
      await this.notifications.create(target.id, {
        type: 'FRIEND_REQUEST',
        actorId: senderId,
      });
      return {
        type: 'requested' as const,
        id: updated.id,
        direction: 'outgoing' as const,
        user: toFriendCodeUserDto(updated.addressee),
        createdAt: updated.createdAt.toISOString(),
      };
    }

    // Yeni PENDING oluştur
    const request = await this.prisma.friendship.create({
      data: { requesterId: senderId, addresseeId: target.id },
      include: {
        addressee: { select: { id: true, username: true, avatarUrl: true } },
        requester: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
    this.realtime.emitToUser(target.id, 'friend.request', {
      id: request.id,
      direction: 'incoming',
      user: toFriendCodeUserDto(request.requester),
      createdAt: request.createdAt.toISOString(),
    });
    // §2 — FRIEND_REQUEST bildirimi (paralel): hedefe, gönderen = senderId
    await this.notifications.create(target.id, {
      type: 'FRIEND_REQUEST',
      actorId: senderId,
    });
    return {
      type: 'requested' as const,
      id: request.id,
      direction: 'outgoing' as const,
      user: toFriendCodeUserDto(request.addressee),
      createdAt: request.createdAt.toISOString(),
    };
  }

  /** POST /friends/requests — friendCode ile istek (CODE yolu, minör dahil açık). */
  async sendFriendRequest(senderId: string, dto: SendFriendRequestDto) {
    const target = await this.prisma.user.findFirst({
      where: { friendCode: dto.friendCode, deletedAt: null },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!target) {
      throw new NotFoundException({ message: 'Bu kodla kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
    }

    const check = await this.friendPermission.canSendFriendRequest(senderId, target.id, 'CODE');
    if (!check.allowed) {
      this.throwFromPermissionReason(check.reason);
    }

    return this.executeFriendshipCreation(senderId, target);
  }

  /**
   * POST /friends/requests/by-user — userId ile istek (USER_CLICK yolu).
   * G2: tıkla-ekle; ortak ortam zorunlu + her iki taraf yetişkin (G1).
   */
  async sendFriendRequestByUser(senderId: string, dto: SendFriendRequestByUserDto) {
    const check = await this.friendPermission.canSendFriendRequest(senderId, dto.userId, 'USER_CLICK');
    if (!check.allowed) {
      this.throwFromPermissionReason(check.reason);
    }

    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!target) {
      throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
    }

    return this.executeFriendshipCreation(senderId, target);
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
    this.realtime.emitToUser(accepted.requesterId, 'friend.accept', {
      friendshipId: accepted.id,
      user: toFriendCodeUserDto(accepted.addressee),
      since: accepted.updatedAt.toISOString(),
    });
    // §2 — FRIEND_ACCEPT bildirimi (paralel): istek sahibine, kabul eden = userId
    await this.notifications.create(accepted.requesterId, {
      type: 'FRIEND_ACCEPT',
      actorId: userId,
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
