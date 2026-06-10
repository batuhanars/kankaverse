import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { Channel } from '@prisma/client';

function toChannelDto(channel: Channel) {
  return {
    id: channel.id,
    type: channel.type,
    guildId: channel.guildId,
    name: channel.name,
    ageGated: channel.ageGated,
    position: channel.position,
  };
}

@Injectable()
export class ChannelsService {
  constructor(private prisma: PrismaService) {}

  private async requireMembership(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId, deletedAt: null },
    });
    if (!guild) {
      throw new NotFoundException({ message: 'Sunucu bulunamadı.', error: 'GUILD_NOT_FOUND' });
    }

    const membership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException({ message: 'Bu sunucuya erişim izniniz yok.', error: 'FORBIDDEN' });
    }

    return { guild, membership };
  }

  async create(userId: string, guildId: string, dto: CreateChannelDto) {
    const { membership } = await this.requireMembership(userId, guildId);

    if (membership.role === 'MEMBER') {
      throw new ForbiddenException({ message: 'Kanal oluşturmak için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    const maxPosition = await this.prisma.channel.aggregate({
      where: { guildId, deletedAt: null },
      _max: { position: true },
    });

    const channel = await this.prisma.channel.create({
      data: {
        guildId,
        type: 'GUILD_TEXT',
        name: dto.name,
        position: (maxPosition._max.position ?? -1) + 1,
      },
    });

    return toChannelDto(channel);
  }

  async findByGuild(userId: string, guildId: string) {
    await this.requireMembership(userId, guildId);

    const channels = await this.prisma.channel.findMany({
      where: { guildId, deletedAt: null },
      orderBy: { position: 'asc' },
    });

    return channels.map(toChannelDto);
  }
}
