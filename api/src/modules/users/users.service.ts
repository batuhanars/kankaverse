import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UserProfileCardDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  friendStatus: 'none' | 'friends' | 'pending_in' | 'pending_out' | 'self';
  selfBlocked: boolean;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /users/:id/card — Kullanıcı detay kartı (mesaj yazarına/avatarına tıkla → popover).
   *
   * Erişim kuralı (§6, R7 inceleme noktası): çağıran + hedef aynı ortamda VEYA aralarında
   * arkadaşlık/blok ilişkisi varsa görüntülenir. Aksi hâlde 404 (rastgele ID profil tarama yüzeyi kapatır).
   *
   * selfBlocked = yalnız "ben onu engelledim" (güvenli). "O beni engelledi" ASLA dönmez (G3).
   */
  async getUserCard(callerId: string, targetId: string): Promise<UserProfileCardDto> {
    if (callerId === targetId) {
      const me = await this.prisma.user.findUnique({
        where: { id: callerId, deletedAt: null },
        select: { id: true, username: true, avatarUrl: true },
      });
      if (!me) throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
      return { id: me.id, username: me.username, avatarUrl: me.avatarUrl, friendStatus: 'self', selfBlocked: false };
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!target) throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });

    // Erişim kontrolü: ortak ortam VEYA ilişki (arkadaş/bekleyen/blok herhangi yönde)
    const [sharedGuild, friendship, callerBlock, targetBlock] = await Promise.all([
      this.prisma.guildMember.findFirst({
        where: {
          userId: callerId,
          guild: {
            deletedAt: null,
            members: { some: { userId: targetId } },
          },
        },
        select: { id: true },
      }),
      this.prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: callerId, addresseeId: targetId },
            { requesterId: targetId, addresseeId: callerId },
          ],
        },
        select: { id: true, status: true, requesterId: true, addresseeId: true },
      }),
      this.prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: callerId, blockedId: targetId } },
        select: { id: true },
      }),
      this.prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: targetId, blockedId: callerId } },
        select: { id: true },
      }),
    ]);

    const hasRelation = sharedGuild || friendship || callerBlock || targetBlock;
    if (!hasRelation) {
      throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
    }

    let friendStatus: UserProfileCardDto['friendStatus'] = 'none';
    if (friendship) {
      if (friendship.status === 'ACCEPTED') {
        friendStatus = 'friends';
      } else if (friendship.status === 'PENDING') {
        friendStatus = friendship.requesterId === callerId ? 'pending_out' : 'pending_in';
      }
    }

    return {
      id: target.id,
      username: target.username,
      avatarUrl: target.avatarUrl,
      friendStatus,
      selfBlocked: !!callerBlock,
    };
  }
}
