import { Injectable, NotFoundException } from '@nestjs/common';
import { DmPolicy } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toUserDto } from '../auth/utils/user-dto.util';
import { ImageUploadService, PresignResult } from '../../shared/media/image-upload.service';
import { SetMediaDto } from '../../shared/media/dto/set-media.dto';
import { DmPermissionService } from '../../shared/dm-permission/dm-permission.service';
import { VoiceService } from '../voice/voice.service';

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

// C10 — kart zenginleştirme: rol rozetleri (yalnız guildId bağlamı verildiğinde)
export interface UserCardRoleDto {
  id: string;
  name: string;
  color: string;
}

// C10 — kart zenginleştirme: ses durumu (hedef aktif bir GUILD_VOICE kanalındaysa + caller erişebiliyorsa).
// Ses katılımcı listesi zaten ortam üyelerine görünür → burada YENİ ifşa yok, aynı kapı (guild üyeliği).
export interface UserCardVoiceDto {
  channelId: string;
  channelName: string;
  guildId: string;
  guildName: string;
  streaming: boolean; // ekran paylaşımı açık
  video: boolean; // kamera açık
}

export interface UserProfileCardDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  friendStatus: 'none' | 'friends' | 'pending_in' | 'pending_out' | 'self';
  selfBlocked: boolean;
  bio: string | null;
  bannerColor: string | null;
  memberSince: string;
  mutualFriends: MutualFriendDto[];
  mutualGuilds: MutualGuildDto[];
  // C10 — inline mesaj kutusu için: DM/istek gönderilebilir mi (canDm otoritesi, jenerik boolean).
  canMessage: boolean;
  // C10 — yalnız guildId bağlamı + ortak üyelik varsa dolu; aksi hâlde [].
  roles: UserCardRoleDto[];
  // C10 — hedef aktif seste + caller erişebiliyorsa; aksi hâlde null.
  voiceStatus: UserCardVoiceDto | null;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private imageUpload: ImageUploadService,
    private dmPermission: DmPermissionService,
    private voice: VoiceService,
  ) {}

  /**
   * GET /users/:id/card — Kullanıcı detay kartı (mesaj yazarına/avatarına tıkla → popover).
   *
   * Erişim kuralı (§6, R7 inceleme noktası): çağıran + hedef aynı ortamda VEYA aralarında
   * arkadaşlık/blok ilişkisi varsa görüntülenir. Aksi hâlde 404 (rastgele ID profil tarama yüzeyi kapatır).
   *
   * selfBlocked = yalnız "ben onu engelledim" (güvenli). "O beni engelledi" ASLA dönmez (G3).
   */
  async getUserCard(callerId: string, targetId: string, guildId?: string): Promise<UserProfileCardDto> {
    if (callerId === targetId) {
      const me = await this.prisma.user.findUnique({
        where: { id: callerId, deletedAt: null },
        select: { id: true, username: true, avatarUrl: true, bannerUrl: true, bio: true, bannerColor: true, createdAt: true },
      });
      if (!me) throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
      return {
        id: me.id,
        username: me.username,
        avatarUrl: me.avatarUrl,
        bannerUrl: me.bannerUrl,
        friendStatus: 'self',
        selfBlocked: false,
        bio: me.bio,
        bannerColor: me.bannerColor,
        memberSince: me.createdAt.toISOString(),
        mutualFriends: [],
        mutualGuilds: [],
        canMessage: false, // kendine mesaj yok
        roles: guildId ? await this.getGuildRoles(guildId, callerId, callerId) : [],
        voiceStatus: null, // kendi ses durumunu kartta göstermeyiz
      };
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: { id: true, username: true, avatarUrl: true, bannerUrl: true, bio: true, bannerColor: true, createdAt: true },
    });
    if (!target) throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });

    // Erişim kontrolü: ortak ortam VEYA ortak GROUP_DM üyeliği VEYA ilişki (arkadaş/bekleyen/blok herhangi yönde)
    const [sharedGuild, sharedGroupDm, friendship, callerBlock, targetBlock] = await Promise.all([
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
      this.prisma.channelMember.findFirst({
        where: {
          userId: callerId,
          channel: {
            type: 'GROUP_DM',
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

    const hasRelation = sharedGuild || sharedGroupDm || friendship || callerBlock || targetBlock;
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
    // C10: canMessage (inline kutu kapısı), roller (guild bağlamında) ve ses durumu paralel toplanır.
    const [mutualFriends, mutualGuilds, canDm, roles, voiceStatus] = await Promise.all([
      this.getMutualFriends(callerId, targetId),
      this.getMutualGuilds(callerId, targetId),
      this.dmPermission.canDm(callerId, targetId),
      guildId ? this.getGuildRoles(guildId, targetId, callerId) : Promise.resolve<UserCardRoleDto[]>([]),
      this.getVoiceStatus(callerId, targetId),
    ]);

    return {
      id: target.id,
      username: target.username,
      avatarUrl: target.avatarUrl,
      bannerUrl: target.bannerUrl,
      friendStatus,
      selfBlocked: !!callerBlock,
      bio: target.bio,
      bannerColor: target.bannerColor,
      memberSince: target.createdAt.toISOString(),
      mutualFriends,
      mutualGuilds,
      canMessage: canDm.allowed,
      roles,
      voiceStatus,
    };
  }

  /**
   * C10 — Hedefin `guildId` ortamındaki rolleri (rozet listesi). @everyone hariç, pozisyona göre
   * yüksekten alçağa. Erişim kapısı: caller o ortamın ÜYESİ değilse [] (rol ifşası yalnız üyelere).
   * Hedef üye değilse (kart başka bağlamdan açıldıysa) []. Yeni sızıntı yok — üye listesi rolleri zaten görünür.
   */
  private async getGuildRoles(guildId: string, targetId: string, callerId: string): Promise<UserCardRoleDto[]> {
    const callerMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: callerId } },
      select: { id: true },
    });
    if (!callerMember) return [];

    const targetMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: targetId } },
      select: {
        roleLinks: {
          select: { role: { select: { id: true, name: true, color: true, position: true, isEveryone: true } } },
        },
      },
    });
    if (!targetMember) return [];

    return targetMember.roleLinks
      .map((l) => l.role)
      .filter((r) => !r.isEveryone)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color }));
  }

  /**
   * C10 — Hedefin aktif ses durumu (yalnız GUILD_VOICE). Kaynak: VoiceSession(leftAt=null) aday kanal →
   * LiveKit `captureVoiceContext` ile GERÇEKTEN içeride mi + yayın (ekran/kamera) doğrulanır (bayat oturum düzeltilir).
   * Erişim kapısı: caller o ortamın üyesi değilse null. Ses katılımcı listesi zaten üyelere görünür → yeni ifşa yok.
   */
  private async getVoiceStatus(callerId: string, targetId: string): Promise<UserCardVoiceDto | null> {
    const session = await this.prisma.voiceSession.findFirst({
      where: { userId: targetId, leftAt: null, channel: { guildId: { not: null }, deletedAt: null } },
      orderBy: { joinedAt: 'desc' },
      select: {
        channelId: true,
        channel: { select: { name: true, guildId: true, guild: { select: { name: true } } } },
      },
    });
    if (!session || !session.channel.guildId) return null;

    const callerMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: session.channel.guildId, userId: callerId } },
      select: { id: true },
    });
    if (!callerMember) return null;

    // CANLI doğrulama (yalnız LiveKit). VoiceSession bayat olabilir (dev'de webhook yok, prod'da kaçan
    // webhook) → doğrulanamayan/ayrılmış kullanıcı için null (fail-closed: yanlış "sesli aramada" gösterme).
    const live = await this.voice.getLiveParticipation(session.channelId, targetId);
    if (!live || !live.present) return null;

    return {
      channelId: session.channelId,
      channelName: session.channel.name ?? 'Ses',
      guildId: session.channel.guildId,
      guildName: session.channel.guild?.name ?? '',
      streaming: live.streaming,
      video: live.video,
    };
  }

  /**
   * PATCH /users/me — kendi profil/gizlilik güncelle. Yalnız verilen alanlar değişir.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: { bio?: string; dmPolicy?: DmPolicy; bannerColor?: string | null } = {};
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.dmPolicy !== undefined) data.dmPolicy = dto.dmPolicy;
    if (dto.bannerColor !== undefined) data.bannerColor = dto.bannerColor;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return toUserDto(user);
  }

  // ─── C8: Avatar (self) ────────────────────────────────────────────────────

  /** POST /users/me/avatar/presign — prefix `avatars/${userId}`. */
  presignAvatar(userId: string, contentType: string): Promise<PresignResult> {
    return this.imageUpload.presign('avatars', userId, contentType);
  }

  /** PATCH /users/me/avatar — storageKey null → avatar kaldır. */
  async setAvatar(userId: string, dto: SetMediaDto) {
    const avatarUrl = this.resolveMediaUrl(userId, dto, 'avatars');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
    return toUserDto(user);
  }

  // ─── C8: Profil afişi (self) ──────────────────────────────────────────────

  /** POST /users/me/banner/presign — prefix `banners/${userId}`. */
  presignBanner(userId: string, contentType: string): Promise<PresignResult> {
    return this.imageUpload.presign('banners', userId, contentType);
  }

  /** PATCH /users/me/banner — storageKey null → afiş kaldır. */
  async setBanner(userId: string, dto: SetMediaDto) {
    const bannerUrl = this.resolveMediaUrl(userId, dto, 'banners');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { bannerUrl },
    });
    return toUserDto(user);
  }

  /**
   * set-endpoint ortak mantığı (avatar/banner): storageKey null → kaldır (null döner).
   * storageKey verilmişse → uploadsEnabled savunma-derinliği + prefix doğrulaması + public URL.
   */
  private resolveMediaUrl(userId: string, dto: SetMediaDto, prefix: 'avatars' | 'banners'): string | null {
    if (dto.storageKey == null) return null;
    // Savunma-derinliği (D14 dersi): yükleme kapalıyken yeni görsel SET edilemez; kaldırma serbest.
    this.imageUpload.assertUploadsEnabled();
    this.imageUpload.assertKeyPrefix(dto.storageKey, `${prefix}/${userId}`);
    return this.imageUpload.publicUrl(dto.storageKey);
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
