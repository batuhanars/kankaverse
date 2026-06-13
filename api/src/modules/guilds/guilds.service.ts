import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { CreateGuildDto } from './dto/create-guild.dto';
import { UpdateGuildDto } from './dto/update-guild.dto';
import { GuildMemberDto } from './dto/guild-member.dto';
import { Guild, GuildRole } from '@prisma/client';

export function toGuildDto(guild: Guild) {
  return {
    id: guild.id,
    name: guild.name,
    ownerId: guild.ownerId,
    adultsOnly: guild.adultsOnly,
    iconUrl: guild.iconUrl,
    createdAt: guild.createdAt.toISOString(),
  };
}

const ROLE_ORDER: Record<GuildRole, number> = {
  OWNER: 0,
  ADMIN: 1,
  MEMBER: 2,
};

@Injectable()
export class GuildsService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
  ) {}

  async create(userId: string, dto: CreateGuildDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const guild = await tx.guild.create({
        data: {
          name: dto.name,
          ownerId: userId,
        },
      });

      await tx.guildMember.create({
        data: {
          guildId: guild.id,
          userId,
          role: 'OWNER',
        },
      });

      await tx.channel.create({
        data: {
          guildId: guild.id,
          type: 'GUILD_TEXT',
          name: 'genel-sohbet',
          position: 0,
        },
      });

      return guild;
    });

    return toGuildDto(result);
  }

  async findMyGuilds(userId: string) {
    const memberships = await this.prisma.guildMember.findMany({
      where: { userId },
      include: { guild: true },
    });
    return memberships
      .filter((m) => m.guild.deletedAt === null)
      .map((m) => toGuildDto(m.guild));
  }

  /** PATCH /guilds/:id — yalnız OWNER */
  async update(userId: string, guildId: string, dto: UpdateGuildDto) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId, deletedAt: null },
    });
    if (!guild) {
      throw new NotFoundException({ message: 'Sunucu bulunamadı.', error: 'GUILD_NOT_FOUND' });
    }

    const membership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    const updated = await this.prisma.guild.update({
      where: { id: guildId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.adultsOnly !== undefined && { adultsOnly: dto.adultsOnly }),
      },
    });

    return toGuildDto(updated);
  }

  async getMembers(userId: string, guildId: string): Promise<GuildMemberDto[]> {
    await this.membership.requireGuildMembership(userId, guildId);

    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    return members
      .sort((a, b) => {
        const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
        if (roleDiff !== 0) return roleDiff;
        return a.user.username.localeCompare(b.user.username, 'tr');
      })
      .map((m) => ({
        userId: m.user.id,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
      }));
  }
}
