import { Injectable, NotFoundException } from '@nestjs/common';
import { DmPolicy } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toUserDto } from '../auth/utils/user-dto.util';

export interface MutualFriendDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface MutualGuildDto {
  id: string;
  name: string;
  iconUrl: string | null;
}

export interface UserProfileCardDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  friendStatus: 'none' | 'friends' | 'pending_in' | 'pending_out' | 'self';
  selfBlocked: boolean;
  bio: string | null;
  memberSince: string;
  mutualFriends: MutualFriendDto[];
  mutualGuilds: MutualGuildDto[];
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
        select: { id: true, username: true, avatarUrl: true, bio: true, createdAt: true },
      });
      if (!me) throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
      return {
        id: me.id,
        username: me.username,
        avatarUrl: me.avatarUrl,
        friendStatus: 'self',
        selfBlocked: false,
        bio: me.bio,
        memberSince: me.createdAt.toISOString(),
        mutualFriends: [],
        mutualGuilds: [],
      };
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: { id: true, username: true, avatarUrl: true, bio: true, createdAt: true },
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

    // Erişim kapısı geçti → ek profil verisi (yeni sızıntı yok: yalnız viewer'ın KENDİ
    // arkadaş/sunucularıyla kesişim; minör/yaş alanı hiçbir şekilde dönmez).
    const [mutualFriends, mutualGuilds] = await Promise.all([
      this.getMutualFriends(callerId, targetId),
      this.getMutualGuilds(callerId, targetId),
    ]);

    return {
      id: target.id,
      username: target.username,
      avatarUrl: target.avatarUrl,
      friendStatus,
      selfBlocked: !!callerBlock,
      bio: target.bio,
      memberSince: target.createdAt.toISOString(),
      mutualFriends,
      mutualGuilds,
    };
  }

  /**
   * PATCH /users/me — kendi profil/gizlilik güncelle. Yalnız verilen alanlar değişir.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: { bio?: string; dmPolicy?: DmPolicy } = {};
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.dmPolicy !== undefined) data.dmPolicy = dto.dmPolicy;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return toUserDto(user);
  }

  /**
   * Viewer (caller) ile hedefin ortak ACCEPTED arkadaşları → kimlik (minör statüsü YOK).
   * Caller'ın arkadaş id kümesi ile hedefin arkadaş id kümesinin kesişimi.
   */
  private async getMutualFriends(callerId: string, targetId: string): Promise<MutualFriendDto[]> {
    const [callerFriends, targetFriends] = await Promise.all([
      this.acceptedFriendIds(callerId),
      this.acceptedFriendIds(targetId),
    ]);
    const callerSet = new Set(callerFriends);
    const mutualIds = [...new Set(targetFriends)].filter((id) => callerSet.has(id));
    if (mutualIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: mutualIds }, deletedAt: null },
      select: { id: true, username: true, avatarUrl: true },
    });
    return users.map((u) => ({ id: u.id, username: u.username, avatarUrl: u.avatarUrl }));
  }

  /** Bir kullanıcının ACCEPTED arkadaşlarının id'leri (her iki yön). */
  private async acceptedFriendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  }

  /**
   * Viewer (caller) ile hedefin ORTAK üye olduğu (silinmemiş) guild'ler.
   */
  private async getMutualGuilds(callerId: string, targetId: string): Promise<MutualGuildDto[]> {
    const guilds = await this.prisma.guild.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId: callerId } },
        AND: [{ members: { some: { userId: targetId } } }],
      },
      select: { id: true, name: true, iconUrl: true },
    });
    return guilds.map((g) => ({ id: g.id, name: g.name, iconUrl: g.iconUrl }));
  }
}
