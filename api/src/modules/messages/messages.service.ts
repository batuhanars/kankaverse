import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { Message, User } from '@prisma/client';

type MessageWithAuthor = Message & { author: Pick<User, 'id' | 'username' | 'avatarUrl'> };

function toMessageDto(msg: MessageWithAuthor) {
  return {
    id: msg.id,
    channelId: msg.channelId,
    content: msg.content,
    replyToId: msg.replyToId,
    author: {
      id: msg.author.id,
      username: msg.author.username,
      avatarUrl: msg.author.avatarUrl,
    },
    createdAt: msg.createdAt.toISOString(),
  };
}

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  private async requireChannelMembership(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    if (channel.guildId) {
      const membership = await this.prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: channel.guildId, userId } },
      });
      if (!membership) {
        throw new ForbiddenException({ message: 'Bu kanala erişim izniniz yok.', error: 'NOT_CHANNEL_MEMBER' });
      }
    }

    return channel;
  }

  async findMessages(userId: string, channelId: string, before?: string, limit = 50) {
    await this.requireChannelMembership(userId, channelId);

    const take = Math.min(limit, 50);
    const cursorCondition = before
      ? { createdAt: { lt: (await this.prisma.message.findUnique({ where: { id: before } }))?.createdAt } }
      : {};

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...cursorCondition,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return messages.map(toMessageDto);
  }

  async create(userId: string, channelId: string, dto: CreateMessageDto) {
    await this.requireChannelMembership(userId, channelId);

    const message = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        content: dto.content,
        replyToId: dto.replyToId ?? null,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    return toMessageDto(message);
  }
}
