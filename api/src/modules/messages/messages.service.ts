import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
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
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
  ) {}

  async findMessages(userId: string, channelId: string, before?: string, limit = 50) {
    await this.membership.requireChannelAccess(userId, channelId);

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
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    // DM kanalında blok kontrolü: blok sonradan konuşmayı keser
    if (!channel.guildId) {
      await this.membership.requireNoDmBlock(userId, channelId);
    }

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
