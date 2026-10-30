import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DmPolicy, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toUserDto } from '../auth/utils/user-dto.util';
import { canPreviewAiVideo, canUseAiVideo } from '../ai-video/ai-video-access';
import { ImageUploadService, PresignResult } from '../../shared/media/image-upload.service';
import { AnimatedMediaService } from '../../shared/media/animated-media.service';
import { PresignAnimatedDto, ProcessAnimatedDto } from '../../shared/media/dto/animated.dto';
import { SetMediaDto } from '../../shared/media/dto/set-media.dto';
import { DmPermissionService } from '../../shared/dm-permission/dm-permission.service';
import { VoiceService } from '../voice/voice.service';
import { PresenceService } from '../../shared/presence/presence.service';
import { storeUrlFor } from '../../shared/games/games.service';
import { externalAccountUrl } from '../integrations/channel-url.util';
import { RECENT_GAME_RETENTION_DAYS } from '../../common/jobs/recent-game-purge.job';

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
  /** C21: rolün emojisi (rozette adın yanında) */
  unicodeEmoji: string | null;
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
  // C13: hareketli WebP adresleri (avatarUrl/bannerUrl = statik kare). Yalnız kart/profil DTO'sunda.
  avatarAnimatedUrl: string | null;
  bannerAnimatedUrl: string | null;
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
  // C36 §6: bağlı Kick/Twitch hesapları (yalnız showOnProfile). Kartı görebilen herkese görünür.
  connections: UserCardConnectionDto[];
}

export interface UserCardConnectionDto {
  provider: 'kick' | 'twitch';
  username: string;
  url: string;
}

/** C31f: son etkinlik saklama süresi (gün) ve profilde gösterilen en fazla oyun. */
export const RECENT_ACTIVITY_DAYS = RECENT_GAME_RETENTION_DAYS;
const RECENT_ACTIVITY_MAX = 10;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private imageUpload: ImageUploadService,
    private dmPermission: DmPermissionService,
    private voice: VoiceService,
    private animatedMedia: AnimatedMediaService,
    private config: ConfigService,
    private presence: PresenceService,
  ) {}

  /** C22/C14: UserDto + hareketli yükleme ve yapay zeka video kapıları. */
  private async userDto(user: User) {
    return toUserDto(
      user,
      this.animatedMedia.canCreateAnimated(user),
      await canUseAiVideo(this.config, this.prisma, user),
      canPreviewAiVideo(this.config, user),
    );
  }

  /**
   * GET /users/:id/card — Kullanıcı detay kartı (mesaj yazarına/avatarına tıkla → popover).
   *
   * Erişim kuralı (§6, R7 inceleme noktası): çağıran + hedef aynı ortamda VEYA ortak GROUP_DM'de
   * VEYA aralarında açık bir 1-1 DM kanalı (M3b §5.2) VEYA arkadaşlık/blok ilişkisi varsa görüntülenir.
   * Aksi hâlde 404 (rastgele ID profil tarama yüzeyi kapatır).
   *
   * M3b §5.2: mutualFriends/mutualGuilds erişimden AYRI karara bağlıdır (`canSeeMutuals`) —
   * kendi tek taraflı hareketinle sosyal graf görünürlüğü kazanamazsın.
   *
   * selfBlocked = yalnız "ben onu engelledim" (güvenli). "O beni engelledi" ASLA dönmez (G3).
   */
  async getUserCard(
    callerId: string,
    targetId: string,
    guildId?: string,
  ): Promise<UserProfileCardDto> {
    if (callerId === targetId) {
      const me = await this.prisma.user.findUnique({
        where: { id: callerId, deletedAt: null },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          bannerUrl: true,
          avatarAnimatedUrl: true,
          bannerAnimatedUrl: true,
          bio: true,
          bannerColor: true,
          createdAt: true,
        },
      });
      if (!me)
        throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });
      return {
        id: me.id,
        username: me.username,
        avatarUrl: me.avatarUrl,
        bannerUrl: me.bannerUrl,
        avatarAnimatedUrl: me.avatarAnimatedUrl,
        bannerAnimatedUrl: me.bannerAnimatedUrl,
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
        connections: await this.getConnections(callerId, callerId),
      };
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bannerUrl: true,
        avatarAnimatedUrl: true,
        bannerAnimatedUrl: true,
        bio: true,
        bannerColor: true,
        createdAt: true,
      },
    });
    if (!target)
      throw new NotFoundException({ message: 'Kullanıcı bulunamadı.', error: 'USER_NOT_FOUND' });

    // Erişim kontrolü: ortak ortam VEYA ortak GROUP_DM üyeliği VEYA açık 1-1 DM kanalı (M3b §5.2)
    // VEYA ilişki (arkadaş/bekleyen/blok herhangi yönde)
    const [sharedGuild, sharedGroupDm, sharedDm, friendship, callerBlock, targetBlock] =
      await Promise.all([
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
        // M3b (PM yetkilendirmesi 2026-08-04): `deletedAt: null` — grup silindiğinde ChannelMember
        // satırları kalıyor (dm.service `deleteGroupDm` yalnız kanalı soft-delete ediyor), kapı
        // bunu süzmediği için silinmiş grubun üyeleri süresiz birbirinin kartını açabiliyordu.
        // Artık DM kapısıyla tutarlı.
        this.prisma.channelMember.findFirst({
          where: {
            userId: callerId,
            channel: {
              type: 'GROUP_DM',
              deletedAt: null,
              members: { some: { userId: targetId } },
            },
          },
          select: { id: true },
        }),
        // M3b §5.2 (R7): açık 1-1 DM kanalı. Yeni keşif yüzeyi DEĞİL — DM kanalı kurmak zaten
        // canDm kapısından geçiyor. `deletedAt: null` şart: reddedilen/kapatılan istek kanalı
        // (soft-delete) erişim vermeye devam etmemeli (fail-closed).
        //
        // C9 kısıtı (PM revizyonu 2026-08-04): isteği BAŞLATAN taraf, istek KABUL EDİLENE kadar
        // erişim kazanmaz — aksi hâlde yabancı, tek taraflı istek atarak kart açardı. ALICI taraf
        // kazanır; §5.2'nin varlık sebebi zaten alıcının gönderen kişiyi engelleyebilmesi.
        // OR kolları null-güvenli pozitif eşitlik (bkz. friend-permission.service `dmRequestStatus`
        // kolları + dm.service gelen-istek sorgusu): PENDING satırda `dmRequesterId` her zaman dolu.
        this.prisma.channelMember.findFirst({
          where: {
            userId: callerId,
            channel: {
              type: 'DM',
              deletedAt: null,
              members: { some: { userId: targetId } },
              OR: [
                { dmRequestStatus: null }, // legacy/normal DM — kabul edilmiş sayılır
                { dmRequestStatus: 'ACCEPTED' },
                { dmRequestStatus: 'PENDING', dmRequesterId: { not: callerId } }, // yalnız alıcı taraf
              ],
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

    const hasRelation =
      sharedGuild || sharedGroupDm || sharedDm || friendship || callerBlock || targetBlock;
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

    // ─────────────────────────────────────────────────────────────────────────
    // M3b §5.2 (R7, sahip turu 2026-08-04) — ortak kanka/ortam görünürlüğü.
    //
    // 🔴 İLKE: kendi TEK TARAFLI hareketinle sosyal graf görünürlüğü kazanamazsın.
    //
    // Graf YALNIZ şu üç kolda açılır:
    //   1. kabul edilmiş arkadaşlık
    //   2. ortak ortam üyeliği
    //   3. SANA gelmiş, henüz cevaplamadığın arkadaşlık isteği — kabul kararını verirken ortak
    //      kankaya bakmak gerçek bir ihtiyaç ve kazancı sen sağlamıyorsun, ilkeyi bozmaz.
    //
    // Kapsanmayan her durum boş dizi: engel (İKİ yönde de — engellediğin/seni engelleyen kişinin
    // ortak kankasını görmezsin), tek başına 1-1 DM üyeliği, tek başına GROUP_DM üyeliği (D33:
    // grup üyeleri birbirine yabancı olabilir), SENİN gönderdiğin bekleyen istek, DECLINED.
    //
    // NOT: bu yalnız NE GÖSTERİLDİĞİ kararıdır; KİMİN GÖREBİLDİĞİ (hasRelation → 404) değişmedi.
    // Engel hâlâ kartı açar — engeli kaldırabilmek için gerekli — sadece graf boş gelir.
    // ─────────────────────────────────────────────────────────────────────────
    const canSeeMutuals =
      friendship?.status === 'ACCEPTED' ||
      !!sharedGuild ||
      (friendship?.status === 'PENDING' && friendship.addresseeId === callerId);

    // Erişim kapısı geçti → ek profil verisi (yeni sızıntı yok: yalnız viewer'ın KENDİ
    // arkadaş/sunucularıyla kesişim; minör/yaş alanı hiçbir şekilde dönmez).
    // C10: canMessage (inline kutu kapısı), roller (guild bağlamında) ve ses durumu paralel toplanır.
    const [mutualFriends, mutualGuilds, canDm, roles, voiceStatus, connections] = await Promise.all(
      [
        canSeeMutuals
          ? this.getMutualFriends(callerId, targetId)
          : Promise.resolve<MutualFriendDto[]>([]),
        canSeeMutuals
          ? this.getMutualGuilds(callerId, targetId)
          : Promise.resolve<MutualGuildDto[]>([]),
        this.dmPermission.canDm(callerId, targetId),
        guildId
          ? this.getGuildRoles(guildId, targetId, callerId)
          : Promise.resolve<UserCardRoleDto[]>([]),
        this.getVoiceStatus(callerId, targetId),
        this.getConnections(callerId, targetId),
      ],
    );

    return {
      id: target.id,
      username: target.username,
      avatarUrl: target.avatarUrl,
      bannerUrl: target.bannerUrl,
      avatarAnimatedUrl: target.avatarAnimatedUrl,
      bannerAnimatedUrl: target.bannerAnimatedUrl,
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
      connections,
    };
  }

  /**
   * C36 §6.1 (T&S, sahip kararı): bağlı hesaplar MİNÖR GÖRÜNTÜLEYENE hiç gönderilmez (platform dışı çıkış
   * yolu). Karar sunucuda verilir, istemciye güvenilmez; fail-closed: görüntüleyen okunamazsa boş.
   * Hedefin `showOnProfile=false` hesapları her zaman gizli.
   */
  private async getConnections(viewerId: string, userId: string): Promise<UserCardConnectionDto[]> {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId, deletedAt: null },
      select: { isMinor: true },
    });
    if (!viewer || viewer.isMinor) return [];
    const rows = await this.prisma.externalAccount.findMany({
      where: { userId, showOnProfile: true },
      orderBy: { linkedAt: 'asc' },
      select: { provider: true, username: true },
    });
    return rows.map((row) => ({
      provider: row.provider === 'KICK' ? 'kick' : 'twitch',
      username: row.username,
      url: externalAccountUrl(row.provider, row.username),
    }));
  }

  /**
   * C10 — Hedefin `guildId` ortamındaki rolleri (rozet listesi). @everyone hariç, pozisyona göre
   * yüksekten alçağa. Erişim kapısı: caller o ortamın ÜYESİ değilse [] (rol ifşası yalnız üyelere).
   * Hedef üye değilse (kart başka bağlamdan açıldıysa) []. Yeni sızıntı yok — üye listesi rolleri zaten görünür.
   */
  private async getGuildRoles(
    guildId: string,
    targetId: string,
    callerId: string,
  ): Promise<UserCardRoleDto[]> {
    const callerMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: callerId } },
      select: { id: true },
    });
    if (!callerMember) return [];

    const targetMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: targetId } },
      select: {
        roleLinks: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                color: true,
                position: true,
                isEveryone: true,
                unicodeEmoji: true,
              },
            },
          },
        },
      },
    });
    if (!targetMember) return [];

    return targetMember.roleLinks
      .map((l) => l.role)
      .filter((r) => !r.isEveryone)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color, unicodeEmoji: r.unicodeEmoji }));
  }

  /**
   * C10 — Hedefin aktif ses durumu (yalnız GUILD_VOICE). Kaynak: VoiceSession(leftAt=null) aday kanal →
   * LiveKit `captureVoiceContext` ile GERÇEKTEN içeride mi + yayın (ekran/kamera) doğrulanır (bayat oturum düzeltilir).
   * Erişim kapısı: caller o ortamın üyesi değilse null. Ses katılımcı listesi zaten üyelere görünür → yeni ifşa yok.
   */
  private async getVoiceStatus(
    callerId: string,
    targetId: string,
  ): Promise<UserCardVoiceDto | null> {
    const session = await this.prisma.voiceSession.findFirst({
      where: {
        userId: targetId,
        leftAt: null,
        channel: { guildId: { not: null }, deletedAt: null },
      },
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
    const data: {
      bio?: string;
      dmPolicy?: DmPolicy;
      bannerColor?: string | null;
      readReceipts?: boolean;
      quickReactions?: string[];
      showGameActivity?: boolean;
      showRecentActivity?: boolean;
    } = {};
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.dmPolicy !== undefined) data.dmPolicy = dto.dmPolicy;
    if (dto.bannerColor !== undefined) data.bannerColor = dto.bannerColor;
    if (dto.readReceipts !== undefined) data.readReceipts = dto.readReceipts;
    if (dto.quickReactions !== undefined) data.quickReactions = dto.quickReactions;
    if (dto.showGameActivity !== undefined) data.showGameActivity = dto.showGameActivity;
    if (dto.showRecentActivity !== undefined) {
      data.showRecentActivity = dto.showRecentActivity;
      // C31f (R7/KVKK): minör için ayar AÇILAMAZ (sunucu otoritesi; istemci gizlese bile).
      if (dto.showRecentActivity) {
        const self = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { isMinor: true },
        });
        if (!self || self.isMinor) {
          throw new ForbiddenException('Bu özellik hesabın için kullanılamaz.');
        }
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    // C31f: son etkinlik ayarı ya da oyun paylaşımı kapanınca kayıtlı geçmiş HEMEN silinir.
    if (dto.showRecentActivity === false || dto.showGameActivity === false) {
      await this.prisma.recentGame.deleteMany({ where: { userId } });
    }
    // C31b §2.6: ayar değişince oyun satırı hemen güncellenir. Kapanırsa bellekteki oyun silinir
    // (yeniden açınca bayat oyun sızmasın) ve `activity:update { game: null }` yayılır; açılırsa
    // masaüstünün o an bildirdiği oyun (varsa) kitleye çıkar.
    if (dto.showGameActivity !== undefined) {
      if (dto.showGameActivity === false) this.presence.clearGames(userId);
      await this.presence.broadcastActivity(userId);
    }
    return await this.userDto(user);
  }

  /**
   * C31f — GET /users/:id/recent-activity. Görünürlük: hedefin `showRecentActivity` açık VE
   * `canSeeActivity` (C31b kuralı, kopya kural yok; kendi profilinde kendisi görür). Değilse boş
   * dizi: varlık/ayar sızdırmaz. 7 günden eski (job henüz silmemiş olsa bile) ve gizli oyun dönmez.
   */
  async getRecentActivity(viewerId: string, targetId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { showRecentActivity: true, isMinor: true },
    });
    if (!target || !target.showRecentActivity || target.isMinor) return [];
    if (!(await this.presence.canSeeActivity(viewerId, targetId))) return [];
    const since = new Date(Date.now() - RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.recentGame.findMany({
      where: { userId: targetId, lastPlayedAt: { gte: since }, game: { hidden: false } },
      orderBy: { lastPlayedAt: 'desc' },
      take: RECENT_ACTIVITY_MAX,
      select: {
        lastPlayedAt: true,
        game: {
          select: { id: true, name: true, iconUrl: true, source: true, externalId: true },
        },
      },
    });
    return rows.map((row) => ({
      game: {
        id: row.game.id,
        name: row.game.name,
        iconUrl: row.game.iconUrl,
        storeUrl: storeUrlFor(row.game.source, row.game.externalId),
      },
      lastPlayedAt: row.lastPlayedAt.toISOString(),
    }));
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
      // C13 değişmez kural: statik set/kaldır hareketli alanı null'lar (avatarUrl artık hareketlinin karesi değil).
      data: { avatarUrl, avatarAnimatedUrl: null },
    });
    return await this.userDto(user);
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
      data: { bannerUrl, bannerAnimatedUrl: null },
    });
    return await this.userDto(user);
  }

  // ─── C13: Hareketli avatar / afiş ─────────────────────────────────────────

  /** POST /users/me/animated/presign — özel bucket staging. */
  presignAnimated(userId: string, dto: PresignAnimatedDto) {
    return this.animatedMedia.presign(userId, dto.contentType, dto.size);
  }

  /** POST /users/me/{avatar|banner}/animated — işle ve güncel kullanıcıyı dön. */
  async setAnimated(userId: string, target: 'AVATAR' | 'BANNER', dto: ProcessAnimatedDto) {
    const user = await this.animatedMedia.process(userId, target, dto);
    return await this.userDto(user);
  }

  /**
   * set-endpoint ortak mantığı (avatar/banner): storageKey null → kaldır (null döner).
   * storageKey verilmişse → uploadsEnabled savunma-derinliği + prefix doğrulaması + public URL.
   */
  private resolveMediaUrl(
    userId: string,
    dto: SetMediaDto,
    prefix: 'avatars' | 'banners',
  ): string | null {
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
