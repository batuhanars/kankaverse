import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { AddChannelMemberDto } from './dto/add-channel-member.dto';
import { Channel } from '@prisma/client';

export function toChannelDto(
  channel: Channel,
  unreadCount = 0,
  unreadMentionCount = 0,
  locked = false,
) {
  return {
    id: channel.id,
    type: channel.type,
    guildId: channel.guildId,
    categoryId: channel.categoryId,
    name: channel.name,
    ageGated: channel.ageGated,
    isPrivate: channel.isPrivate,
    // item 6: özel kanal HERKESE görünür; locked=true ise kullanıcı giremez (üye değil).
    // Kullanıcıya göre hesaplanır — broadcast'lerde per-user emit edilir.
    locked,
    position: channel.position,
    slowModeSeconds: channel.slowModeSeconds,
    userLimit: channel.userLimit,
    bitrate: channel.bitrate, // R10 — ses kanalı bit hızı (kbps)
    unreadCount,
    unreadMentionCount, // REV-4: okunmamış bahsetme (kendimi @işaret eden, lastReadAt sonrası)
  };
}

@Injectable()
export class ChannelsService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private permissions: PermissionsService,
    private realtime: RealtimeService,
  ) {}

  /** MANAGE_CHANNELS iznini kontrol et; yoksa 403 FORBIDDEN */
  private async requireManageChannels(userId: string, guildId: string): Promise<void> {
    const allowed = await this.permissions.hasGuildPermission(userId, guildId, 'MANAGE_CHANNELS');
    if (!allowed) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
  }

  /**
   * item 6 — kanal created/updated olayını TÜM guild üyelerine yayınla.
   * Özel kanal artık herkese GÖRÜNÜR (locked), yalnız giriş kapalı. `locked` kullanıcıya
   * göre değiştiğinden (üye/yetkili → false, diğer → true) tek DTO ile broadcast edilemez;
   * per-user emit edilir. Public kanalda locked her zaman false.
   */
  private async emitChannelEventToGuild(
    event: 'channel.created' | 'channel.updated',
    guildId: string,
    channel: Channel,
  ): Promise<void> {
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true, role: true },
    });
    let channelMemberIds = new Set<string>();
    if (channel.isPrivate) {
      const cms = await this.prisma.channelMember.findMany({
        where: { channelId: channel.id },
        select: { userId: true },
      });
      channelMemberIds = new Set(cms.map((m) => m.userId));
    }
    for (const m of members) {
      const privileged = m.role === 'OWNER' || m.role === 'ADMIN';
      const locked = channel.isPrivate && !privileged && !channelMemberIds.has(m.userId);
      this.realtime.emitToUser(m.userId, event, {
        guildId,
        channel: toChannelDto(channel, 0, 0, locked),
      });
    }
  }

  /** Guild'in tüm üye id'leri — silme/görünürlük olaylarında (locked'a gerek yok). */
  private async allGuildMemberIds(guildId: string): Promise<string[]> {
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  async create(userId: string, guildId: string, dto: CreateChannelDto) {
    await this.membership.requireGuildMembership(userId, guildId);
    await this.requireManageChannels(userId, guildId);

    if (dto.categoryId) {
      await this.validateCategoryBelongsToGuild(dto.categoryId, guildId);
    }

    const maxPosition = await this.prisma.channel.aggregate({
      where: { guildId, deletedAt: null },
      _max: { position: true },
    });

    const channel = await this.prisma.channel.create({
      data: {
        guildId,
        type: dto.type ?? 'GUILD_TEXT',
        name: dto.name,
        ageGated: dto.ageGated ?? false,
        isPrivate: dto.isPrivate ?? false,
        position: (maxPosition._max.position ?? -1) + 1,
        slowModeSeconds: dto.slowModeSeconds ?? 0,
        userLimit: dto.userLimit ?? 0,
        categoryId: dto.categoryId ?? null,
      },
    });

    // Realtime: kanal oluşturuldu → TÜM guild üyelerine (özel kanal görünür ama locked)
    const dtoOut = toChannelDto(channel);
    await this.emitChannelEventToGuild('channel.created', guildId, channel);

    return dtoOut;
  }

  async findByGuild(userId: string, guildId: string) {
    const { membership } = await this.membership.requireGuildMembership(userId, guildId);

    // Kanalları ve kullanıcının okuma kayıtlarını çek
    const channels = await this.prisma.channel.findMany({
      where: { guildId, deletedAt: null },
      orderBy: { position: 'asc' },
      include: {
        channelReads: {
          where: { userId },
          select: { lastReadAt: true },
        },
      },
    });

    // item 6: özel kanallar artık HERKESE görünür (locked). OWNER/ADMIN ve ChannelMember
    // için locked=false (girebilir); diğer üyeler için locked=true (görür, giremez).
    const isPrivileged = membership.role === 'OWNER' || membership.role === 'ADMIN';
    let memberChannelIds = new Set<string>();
    if (!isPrivileged) {
      const channelMemberships = await this.prisma.channelMember.findMany({
        where: { userId, channelId: { in: channels.map((ch) => ch.id) } },
        select: { channelId: true },
      });
      memberChannelIds = new Set(channelMemberships.map((cm) => cm.channelId));
    }
    const lockedFor = (ch: (typeof channels)[number]): boolean =>
      ch.isPrivate && !isPrivileged && !memberChannelIds.has(ch.id);

    // Her kanal için okunmamış mesaj + okunmamış bahsetme sayısını paralel hesapla.
    // Locked (girilemez) kanalda okunmamış sayısı sızdırmamak için 0 bırakılır.
    const counts = await Promise.all(
      channels.map(async (ch) => {
        if (lockedFor(ch)) return { unread: 0, mentions: 0 };
        const lastRead = ch.channelReads[0]?.lastReadAt ?? null;
        const base = {
          channelId: ch.id,
          deletedAt: null,
          authorId: { not: userId }, // kendi mesajları sayma
          ...(lastRead !== null && { createdAt: { gt: lastRead } }),
        };
        const [unread, mentions] = await Promise.all([
          this.prisma.message.count({ where: base }),
          // REV-4: okunmamış bahsetme — beni içeren mention VEYA @everyone toplu bahsetme
          this.prisma.message.count({
            where: { ...base, OR: [{ mentions: { has: userId } }, { mentionsEveryone: true }] },
          }),
        ]);
        return { unread, mentions };
      }),
    );

    return channels.map((ch, i) => toChannelDto(ch, counts[i].unread, counts[i].mentions, lockedFor(ch)));
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

    await this.membership.requireGuildMembership(userId, channel.guildId!);
    await this.requireManageChannels(userId, channel.guildId!);

    // categoryId: null → kategorisiz; string → doğrula; undefined → dokunma
    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      await this.validateCategoryBelongsToGuild(dto.categoryId, channel.guildId!);
    }

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.ageGated !== undefined && { ageGated: dto.ageGated }),
        ...(dto.isPrivate !== undefined && { isPrivate: dto.isPrivate }),
        ...(dto.slowModeSeconds !== undefined && { slowModeSeconds: dto.slowModeSeconds }),
        ...(dto.userLimit !== undefined && { userLimit: dto.userLimit }),
        ...(dto.bitrate !== undefined && { bitrate: dto.bitrate }),
        // categoryId: undefined → dokunma; null → kategorisiz; string → ata.
        // ('in dto' KULLANMA: class-transformer gönderilmeyen alanı undefined anahtar olarak
        //  ekler → her güncellemede kanalı yanlışlıkla kategoriden çıkarırdı.)
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
      },
    });

    const dtoOut = toChannelDto(updated);
    await this.emitChannelEventToGuild('channel.updated', updated.guildId!, updated);

    return dtoOut;
  }

  /**
   * Toplu sıralama (drag-reorder): kanalların position + categoryId'sini güncelle (OWNER/ADMIN).
   * Yalnız bu guild'e ait kanallar; geçersiz categoryId atılır. Her güncel kanal için channel.updated yayını.
   */
  async reorderChannels(
    userId: string,
    guildId: string,
    items: { id: string; position: number; categoryId?: string | null }[],
  ): Promise<null> {
    await this.membership.requireGuildMembership(userId, guildId);
    await this.requireManageChannels(userId, guildId);

    // Bu guild'e ait geçerli kanallar
    const ids = items.map((i) => i.id);
    const guildChannels = await this.prisma.channel.findMany({
      where: { id: { in: ids }, guildId, deletedAt: null },
      select: { id: true },
    });
    const validIds = new Set(guildChannels.map((c) => c.id));

    // Geçerli categoryId kümesi (bu guild'in kategorileri)
    const cats = await this.prisma.channelCategory.findMany({
      where: { guildId, deletedAt: null },
      select: { id: true },
    });
    const validCatIds = new Set(cats.map((c) => c.id));

    const valid = items.filter((i) => validIds.has(i.id));
    if (valid.length === 0) return null;

    await this.prisma.$transaction(
      valid.map((i) =>
        this.prisma.channel.update({
          where: { id: i.id },
          data: {
            position: i.position,
            // categoryId verildiyse: null→kategorisiz, geçerli kategori→ata, geçersiz→dokunma
            ...(i.categoryId === null
              ? { categoryId: null }
              : i.categoryId && validCatIds.has(i.categoryId)
                ? { categoryId: i.categoryId }
                : {}),
          },
        }),
      ),
    );

    // Realtime: güncel kanalları TÜM guild üyelerine yay (özel kanal görünür ama locked)
    const updated = await this.prisma.channel.findMany({ where: { id: { in: valid.map((v) => v.id) } } });
    for (const ch of updated) {
      await this.emitChannelEventToGuild('channel.updated', guildId, ch);
    }
    return null;
  }

  /** Kategori var mı, aynı guild'e ait mi, silinmemiş mi — değilse 400 INVALID_CATEGORY */
  private async validateCategoryBelongsToGuild(categoryId: string, guildId: string) {
    const category = await this.prisma.channelCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.deletedAt !== null || category.guildId !== guildId) {
      throw new BadRequestException({ message: 'Geçersiz kategori.', error: 'INVALID_CATEGORY' });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Özel kanal üye yönetimi (Sprint V2)
  // Hepsi MANAGE_CHANNELS: requireGuildMembership + requireManageChannels
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * GET /channels/:id/members
   * Kanalın ChannelMember kayıtları + { id, username, avatarUrl }.
   * Kanal guild+özel değilse boş [] döner (NOT_PRIVATE yerine boş — UI sade).
   * Karar: 400 yerine boş tercih edildi; UI genel kanaldaki üye listesi bölümünü gizler
   * (backend yalnız boş döner, modal açılmaz zaten), hata göstermek UX'i bozardı.
   */
  async getChannelMembers(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    // Yalnız guild kanallarında anlamlı
    if (!channel.guildId) return [];

    await this.membership.requireGuildMembership(userId, channel.guildId);
    await this.requireManageChannels(userId, channel.guildId);

    // Genel kanal → boş dön (işlem başarılı ama anlamsız)
    if (!channel.isPrivate) return [];

    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    return members.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      avatarUrl: m.user.avatarUrl,
    }));
  }

  /**
   * POST /channels/:id/members  { userId }
   * R7: yaş kapısı guard — ageGated || guild.adultsOnly ise hedef minör olamaz.
   * İdempotent upsert: zaten üyeyse mevcut kaydı döndür.
   *
   * §2 Yetki sırası: 404 → DM erken çıkış → ADMIN GATE → domain doğrulama.
   * isPrivate/NOT_PRIVATE_CHANNEL GATE'den SONRA — yetkisiz kullanıcı kanalın
   * özel olup olmadığını öğrenemez (durum sızıntısı önlendi).
   */
  async addChannelMember(userId: string, channelId: string, dto: AddChannelMemberDto) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
      include: { guild: true },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    // DM kanalı: guildId yoksa requireGuildMembership çağrılamaz; erken çıkış.
    // DM-lik bilgisini sızdırma riski önemsiz (guild context'i yok zaten).
    if (!channel.guildId) {
      throw new BadRequestException({ message: 'Bu işlem yalnızca özel guild kanallarında kullanılabilir.', error: 'NOT_PRIVATE_CHANNEL' });
    }

    // §2 MANAGE_CHANNELS GATE — önce yetki; yetkisiz kullanıcı bundan ötesini göremez.
    await this.membership.requireGuildMembership(userId, channel.guildId);
    await this.requireManageChannels(userId, channel.guildId);

    // Domain doğrulaması: kanal özel değilse işlem anlamsız (GATE sonrası — sızıntı yok).
    if (!channel.isPrivate) {
      throw new BadRequestException({ message: 'Bu işlem yalnızca özel guild kanallarında kullanılabilir.', error: 'NOT_PRIVATE_CHANNEL' });
    }

    // Hedef kullanıcı guild üyesi mi?
    const targetGuildMembership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: channel.guildId, userId: dto.userId } },
    });
    if (!targetGuildMembership) {
      throw new BadRequestException({ message: 'Kullanıcı bu ortamın üyesi değil.', error: 'NOT_GUILD_MEMBER' });
    }

    // R7: Yaş kapısı — kanal ageGated veya guild adultsOnly ise hedef minör olamaz
    const needsAgeCheck = channel.ageGated || (channel.guild?.adultsOnly ?? false);
    if (needsAgeCheck) {
      const target = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { isMinor: true },
      });
      if (target?.isMinor) {
        throw new BadRequestException({ message: 'Yaşa kısıtlı kanala reşit olmayan kullanıcı eklenemez.', error: 'AGE_RESTRICTED' });
      }
    }

    // İdempotent upsert: zaten varsa kayıt döndür
    const member = await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId: dto.userId } },
      update: {},
      create: { channelId, userId: dto.userId },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    // item 6: eklenen kullanıcının kilidi anında açılsın (locked=false) → kanala girebilir.
    this.realtime.emitToUser(dto.userId, 'channel.updated', {
      guildId: channel.guildId,
      channel: toChannelDto(channel, 0, 0, false),
    });

    return {
      id: member.user.id,
      username: member.user.username,
      avatarUrl: member.user.avatarUrl,
    };
  }

  /**
   * DELETE /channels/:id/members/:targetUserId
   * ChannelMember deleteMany (yoksa no-op). null döner.
   *
   * §2 Yetki sırası: 404 → DM erken çıkış → ADMIN GATE → deleteMany.
   */
  async removeChannelMember(userId: string, channelId: string, targetUserId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    // DM kanalı: guildId yoksa requireGuildMembership çağrılamaz; erken çıkış.
    if (!channel.guildId) {
      throw new BadRequestException({ message: 'Bu işlem yalnızca guild kanallarında kullanılabilir.', error: 'NOT_PRIVATE_CHANNEL' });
    }

    // §2 MANAGE_CHANNELS GATE — önce yetki.
    await this.membership.requireGuildMembership(userId, channel.guildId);
    await this.requireManageChannels(userId, channel.guildId);

    // deleteMany: kayıt yoksa no-op (count=0 — hata fırlatma)
    await this.prisma.channelMember.deleteMany({
      where: { channelId, userId: targetUserId },
    });

    // item 6: çıkarılan kullanıcının kilidi yeniden kapansın (özel kanal + yetkisizse).
    if (channel.isPrivate) {
      const target = await this.prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: channel.guildId, userId: targetUserId } },
        select: { role: true },
      });
      const privileged = target?.role === 'OWNER' || target?.role === 'ADMIN';
      this.realtime.emitToUser(targetUserId, 'channel.updated', {
        guildId: channel.guildId,
        channel: toChannelDto(channel, 0, 0, !privileged),
      });
    }

    return null;
  }

  async remove(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    await this.membership.requireGuildMembership(userId, channel.guildId!);
    await this.requireManageChannels(userId, channel.guildId!);

    // Son kanal koruması: guild'in en az 1 aktif kanalı kalmalı
    const activeCount = await this.prisma.channel.count({
      where: { guildId: channel.guildId!, deletedAt: null },
    });
    if (activeCount <= 1) {
      throw new ConflictException({ message: 'Son kanal silinemez; ortamda en az bir kanal olmalıdır.', error: 'LAST_CHANNEL' });
    }

    // item 6: özel kanal herkese görünür → silme de TÜM guild üyelerine (ghost kanal kalmasın)
    const recipients = await this.allGuildMemberIds(channel.guildId!);

    await this.prisma.channel.update({
      where: { id: channelId },
      data: { deletedAt: new Date() },
    });

    this.realtime.emitToUsers(recipients, 'channel.deleted', { guildId: channel.guildId, channelId });

    return null;
  }
}
