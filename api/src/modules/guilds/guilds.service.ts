import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGuildDto } from './dto/create-guild.dto';
import { Guild } from '@prisma/client';

function toGuildDto(guild: Guild) {
  return {
    id: guild.id,
    name: guild.name,
    ownerId: guild.ownerId,
    adultsOnly: guild.adultsOnly,
    iconUrl: guild.iconUrl,
    createdAt: guild.createdAt.toISOString(),
  };
}

@Injectable()
export class GuildsService {
  constructor(private prisma: PrismaService) {}

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

  async join(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId, deletedAt: null },
    });
    if (!guild) {
      throw new NotFoundException({ message: 'Sunucu bulunamadı.', error: 'GUILD_NOT_FOUND' });
    }

    const existing = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (existing) {
      throw new ConflictException({ message: 'Bu sunucuya zaten üyesiniz.', error: 'ALREADY_MEMBER' });
    }

    await this.prisma.guildMember.create({
      data: { guildId, userId, role: 'MEMBER' },
    });

    return toGuildDto(guild);
  }
}
