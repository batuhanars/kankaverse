import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { AddChannelMemberDto } from './dto/add-channel-member.dto';
import { Channel } from '@prisma/client';
import { requireAdminRole } from '../../common/utils/guild-role.utils';

export function toChannelDto(channel: Channel, unreadCount = 0, unreadMentionCount = 0) {
  return {
    id: channel.id,
    type: channel.type,
    guildId: channel.guildId,
    categoryId: channel.categoryId,
    name: channel.name,
    ageGated: channel.ageGated,
    isPrivate: channel.isPrivate,
    position: channel.position,
    slowModeSeconds: channel.slowModeSeconds,
    unreadCount,
    unreadMentionCount, // REV-4: okunmamış bahsetme (kendimi @işaret eden, lastReadAt sonrası)
  };
}

@Injectable()
export class ChannelsService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private realtime: RealtimeService,
  ) {}

  /**
   * Realtime kanal-olayı alıcıları (sızıntı-güvenli):
   *  - Public kanal → tüm guild üyeleri.
   *  - Özel kanal → yalnız OWNER/ADMIN + ChannelMember'lar (findByGuild görünürlüğüyle aynı).
   */
  private async channelEventRecipients(channelId: string, guildId: string, isPrivate: boolean): Promise<string[]> {
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true, role: true },
    });
    if (!isPrivate) return members.map((m) => m.userId);
    const privileged = members.filter((m) => m.role === 'OWNER' || m.role === 'ADMIN').map((m) => m.userId);
    const channelMembers = (
      await this.prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } })
    ).map((m) => m.userId);
    return [...new Set([...privileged, ...channelMembers])];
  }

  async create(userId: string, guildId: string, dto: CreateChannelDto) {
    const { membership } = await this.membership.requireGuildMembership(userId, guildId);
    requireAdminRole(membership.role);

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
        categoryId: dto.categoryId ?? null,
      },
    });

    // Realtime: kanal oluşturuldu → görebilecek üyelere yay (özel kanal sızdırmaz)
    const dtoOut = toChannelDto(channel);
    const recipients = await this.channelEventRecipients(channel.id, guildId, channel.isPrivate);
    this.realtime.emitToUsers(recipients, 'channel.created', { guildId, channel: dtoOut });

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

    // B4/B5 (R7): özel kanal filtresi — OWNER/ADMIN tüm kanalları görür;
    // MEMBER yalnız genel kanallar + üyesi olduğu özel kanalları görür.
    const isPrivileged = membership.role === 'OWNER' || membership.role === 'ADMIN';
    let visibleChannels = channels;
    if (!isPrivileged) {
      // Kullanıcının ChannelMember olduğu kanalların id kümesini tek sorguyla al
      const channelMemberships = await this.prisma.channelMember.findMany({
        where: { userId, channelId: { in: channels.map((ch) => ch.id) } },
        select: { channelId: true },
      });
      const memberChannelIds = new Set(channelMemberships.map((cm) => cm.channelId));

      visibleChannels = channels.filter(
        (ch) => !ch.isPrivate || memberChannelIds.has(ch.id),
      );
    }

    // Her görünür kanal için okunmamış mesaj + okunmamış bahsetme sayısını paralel hesapla
    const counts = await Promise.all(
      visibleChannels.map(async (ch) => {
        const lastRead = ch.channelReads[0]?.lastReadAt ?? null;
        const base = {
          channelId: ch.id,
          deletedAt: null,
          authorId: { not: userId }, // kendi mesajları sayma
          ...(lastRead !== null && { createdAt: { gt: lastRead } }),
        };
        const [unread, mentions] = await Promise.all([
          this.prisma.message.count({ where: base }),
          // REV-4: okunmamış bahsetme — mentions dizisi beni içeriyor
          this.prisma.message.count({ where: { ...base, mentions: { has: userId } } }),
        ]);
        return { unread, mentions };
      }),
    );

    return visibleChannels.map((ch, i) => toChannelDto(ch, counts[i].unread, counts[i].mentions));
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

    const { membership } = await this.membership.requireGuildMembership(userId, channel.guildId!);
    requireAdminRole(membership.role);

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
        ...('categoryId' in dto && { categoryId: dto.categoryId ?? null }),
      },
    });

    const dtoOut = toChannelDto(updated);
    const recipients = await this.channelEventRecipients(updated.id, updated.guildId!, updated.isPrivate);
    this.realtime.emitToUsers(recipients, 'channel.updated', { guildId: updated.guildId, channel: dtoOut });

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
    const { membership } = await this.membership.requireGuildMembership(userId, guildId);
    requireAdminRole(membership.role);

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

    // Realtime: güncel kanalları görebilecek üyelere yay (özel kanal sızdırmaz)
    const updated = await this.prisma.channel.findMany({ where: { id: { in: valid.map((v) => v.id) } } });
    for (const ch of updated) {
      const recipients = await this.channelEventRecipients(ch.id, guildId, ch.isPrivate);
      this.realtime.emitToUsers(recipients, 'channel.updated', { guildId, channel: toChannelDto(ch) });
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
  // Hepsi OWNER/ADMIN: requireGuildMembership + requireAdminRole
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

    const { membership } = await this.membership.requireGuildMembership(userId, channel.guildId);
    requireAdminRole(membership.role);

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

    // §2 ADMIN GATE — önce yetki; yetkisiz kullanıcı bundan ötesini göremez.
    const { membership } = await this.membership.requireGuildMembership(userId, channel.guildId);
    requireAdminRole(membership.role);

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

    // §2 ADMIN GATE — önce yetki.
    const { membership } = await this.membership.requireGuildMembership(userId, channel.guildId);
    requireAdminRole(membership.role);

    // deleteMany: kayıt yoksa no-op (count=0 — hata fırlatma)
    await this.prisma.channelMember.deleteMany({
      where: { channelId, userId: targetUserId },
    });

    return null;
  }

  async remove(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    const { membership } = await this.membership.requireGuildMembership(userId, channel.guildId!);
    requireAdminRole(membership.role);

    // Son kanal koruması: guild'in en az 1 aktif kanalı kalmalı
    const activeCount = await this.prisma.channel.count({
      where: { guildId: channel.guildId!, deletedAt: null },
    });
    if (activeCount <= 1) {
      throw new ConflictException({ message: 'Son kanal silinemez; ortamda en az bir kanal olmalıdır.', error: 'LAST_CHANNEL' });
    }

    // Alıcıları silmeden ÖNCE hesapla (özel kanal görünürlüğü)
    const recipients = await this.channelEventRecipients(channel.id, channel.guildId!, channel.isPrivate);

    await this.prisma.channel.update({
      where: { id: channelId },
      data: { deletedAt: new Date() },
    });

    this.realtime.emitToUsers(recipients, 'channel.deleted', { guildId: channel.guildId, channelId });

    return null;
  }
}
