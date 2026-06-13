import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
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
  ) {}

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

    return toCategoryDto(category);
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

    return toCategoryDto(updated);
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

    return null;
  }
}
