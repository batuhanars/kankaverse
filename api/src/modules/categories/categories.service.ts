import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ChannelCategory } from '@prisma/client';
import { requireAdminRole } from '../../common/utils/guild-role.utils';

export function toCategoryDto(cat: ChannelCategory) {
  return {
    id: cat.id,
    guildId: cat.guildId,
    name: cat.name,
    position: cat.position,
  };
}

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private realtime: RealtimeService,
  ) {}

  /** Guild'in tüm üye id'leri (kategori olayı yayını — kategori özel değildir). */
  private async guildMemberIds(guildId: string): Promise<string[]> {
    const members = await this.prisma.guildMember.findMany({ where: { guildId }, select: { userId: true } });
    return members.map((m) => m.userId);
  }

  async create(userId: string, guildId: string, dto: CreateCategoryDto) {
    const { membership } = await this.membership.requireGuildMembership(userId, guildId);
    requireAdminRole(membership.role);

    const maxAgg = await this.prisma.channelCategory.aggregate({
      where: { guildId, deletedAt: null },
      _max: { position: true },
    });

    const category = await this.prisma.channelCategory.create({
      data: {
        guildId,
        name: dto.name,
        position: (maxAgg._max.position ?? -1) + 1,
      },
    });

    const dtoOut = toCategoryDto(category);
    this.realtime.emitToUsers(await this.guildMemberIds(guildId), 'category.created', { guildId, category: dtoOut });
    return dtoOut;
  }

  async findByGuild(userId: string, guildId: string) {
    await this.membership.requireGuildMembership(userId, guildId);

    const categories = await this.prisma.channelCategory.findMany({
      where: { guildId, deletedAt: null },
      orderBy: { position: 'asc' },
    });

    return categories.map(toCategoryDto);
  }

  async update(userId: string, categoryId: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.channelCategory.findUnique({
      where: { id: categoryId, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException({ message: 'Kategori bulunamadı.', error: 'CATEGORY_NOT_FOUND' });
    }

    const { membership } = await this.membership.requireGuildMembership(userId, category.guildId);
    requireAdminRole(membership.role);

    const updated = await this.prisma.channelCategory.update({
      where: { id: categoryId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    });

    const dtoOut = toCategoryDto(updated);
    this.realtime.emitToUsers(await this.guildMemberIds(category.guildId), 'category.updated', { guildId: category.guildId, category: dtoOut });
    return dtoOut;
  }

  /** Toplu kategori sıralama (drag-reorder): position güncelle (OWNER/ADMIN) + category.updated yayını. */
  async reorder(userId: string, guildId: string, items: { id: string; position: number }[]): Promise<null> {
    const { membership } = await this.membership.requireGuildMembership(userId, guildId);
    requireAdminRole(membership.role);

    const cats = await this.prisma.channelCategory.findMany({
      where: { id: { in: items.map((i) => i.id) }, guildId, deletedAt: null },
      select: { id: true },
    });
    const validIds = new Set(cats.map((c) => c.id));
    const valid = items.filter((i) => validIds.has(i.id));
    if (valid.length === 0) return null;

    const updated = await this.prisma.$transaction(
      valid.map((i) =>
        this.prisma.channelCategory.update({ where: { id: i.id }, data: { position: i.position } }),
      ),
    );
    const recipients = await this.guildMemberIds(guildId);
    for (const cat of updated) {
      this.realtime.emitToUsers(recipients, 'category.updated', { guildId, category: toCategoryDto(cat) });
    }
    return null;
  }

  async remove(userId: string, categoryId: string) {
    const category = await this.prisma.channelCategory.findUnique({
      where: { id: categoryId, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException({ message: 'Kategori bulunamadı.', error: 'CATEGORY_NOT_FOUND' });
    }

    const { membership } = await this.membership.requireGuildMembership(userId, category.guildId);
    requireAdminRole(membership.role);

    // Transaction: kanalları kategorisiz yap + kategoriyi soft-delete et
    await this.prisma.$transaction([
      this.prisma.channel.updateMany({
        where: { categoryId, deletedAt: null },
        data: { categoryId: null },
      }),
      this.prisma.channelCategory.update({
        where: { id: categoryId },
        data: { deletedAt: new Date() },
      }),
    ]);

    // Realtime: kategori silindi → frontend o kategorinin kanallarını kategorisize düşürür
    this.realtime.emitToUsers(await this.guildMemberIds(category.guildId), 'category.deleted', { guildId: category.guildId, categoryId });

    return null;
  }
}
