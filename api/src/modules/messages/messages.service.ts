import { BadRequestException, ForbiddenException, Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { AutomodService } from '../../shared/automod/automod.service';
import { ModerationService } from '../../shared/moderation/moderation.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { Attachment, Message, MessageReaction, ScanStatus, User } from '@prisma/client';

type AttachmentDto = Pick<Attachment, 'id' | 'filename' | 'contentType' | 'size' | 'scanStatus'>;

type ReactionAggDto = { emoji: string; count: number; reactedByMe: boolean };

type MessageWithAuthor = Message & {
  author: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  attachments: AttachmentDto[];
  reactions?: Pick<MessageReaction, 'userId' | 'emoji'>[];
};

function toMessageDto(msg: MessageWithAuthor, callerId?: string) {
  // Aggregate reactions: group by emoji, count, reactedByMe
  const reactionsAgg: ReactionAggDto[] = [];
  if (msg.reactions && msg.reactions.length > 0) {
    const byEmoji = new Map<string, { count: number; reactedByMe: boolean }>();
    for (const r of msg.reactions) {
      const existing = byEmoji.get(r.emoji);
      if (existing) {
        existing.count += 1;
        if (callerId && r.userId === callerId) existing.reactedByMe = true;
      } else {
        byEmoji.set(r.emoji, {
          count: 1,
          reactedByMe: callerId ? r.userId === callerId : false,
        });
      }
    }
    for (const [emoji, agg] of byEmoji) {
      reactionsAgg.push({ emoji, count: agg.count, reactedByMe: agg.reactedByMe });
    }
  }

  return {
    id: msg.id,
    channelId: msg.channelId,
    content: msg.content,
    replyToId: msg.replyToId,
    editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
    author: {
      id: msg.author.id,
      username: msg.author.username,
      avatarUrl: msg.author.avatarUrl,
    },
    attachments: msg.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      scanStatus: a.scanStatus,
    })),
    reactions: reactionsAgg,
    createdAt: msg.createdAt.toISOString(),
  };
}

@Injectable()
export class MessagesService {
  private readonly scanEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private automod: AutomodService,
    private config: ConfigService,
    private moderation: ModerationService,
  ) {
    this.scanEnabled = config.get<boolean>('attachmentScanEnabled') ?? false;
  }

  async findMessages(userId: string, channelId: string, before?: string, limit = 50) {
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    const take = Math.min(limit, 50);

    // createdAt filtresi: G4 clearedAt (gt) + cursor before (lt) TEK objede birleşir.
    // (Ayrı spread'lerde ikisi de `createdAt` anahtarını yazıp üzerine binerdi → load-more'da
    //  clearedAt filtresi düşer, temizlenmiş geçmiş geri görünürdü. B1 düzeltmesi.)
    const createdAtFilter: { gt?: Date; lt?: Date } = {};

    if (before) {
      const beforeMsg = await this.prisma.message.findUnique({ where: { id: before } });
      if (beforeMsg) createdAtFilter.lt = beforeMsg.createdAt;
    }

    // G4: DM kanalında çağıranın clearedAt'inden SONRASINI döndür (kendi temizlediği geçmiş kapanır).
    // Kayıt DB'de durur; karşı tarafın görünümü tam. Guild kanallarında clearedAt yoktur.
    if (!channel.guildId) {
      const member = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { clearedAt: true },
      });
      if (member?.clearedAt) createdAtFilter.gt = member.clearedAt;
    }

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: {
          select: { id: true, filename: true, contentType: true, size: true, scanStatus: true },
        },
        // Reaksiyonları tek sorguda çek — N+1 yok; aggregation JS tarafında
        reactions: { select: { userId: true, emoji: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return messages.map((msg) => toMessageDto(msg, userId));
  }

  async create(userId: string, channelId: string, dto: CreateMessageDto) {
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    // R7 Enforcement: BAN (global) → mesaj gönderme yasak
    const hasBan = await this.moderation.hasActiveBan(userId);
    if (hasBan) {
      throw new ForbiddenException({ message: 'Hesabınız kısıtlandığı için mesaj gönderemezsiniz.', error: 'USER_BANNED' });
    }

    // R7 Enforcement: MUTE (scope-aware) → bu kanalda mesaj gönderme yasak
    const hasMute = await this.moderation.hasActiveMute(userId, channel.guildId ?? null);
    if (hasMute) {
      throw new ForbiddenException({ message: 'Bu kanalda mesaj gönderme yetkiniz kısıtlandı.', error: 'USER_MUTED' });
    }

    // Yavaş mod (slow mode): yalnızca guild kanallarında; OWNER/ADMIN muaf
    if (channel.guildId && channel.slowModeSeconds > 0) {
      const membership = await this.prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: channel.guildId, userId } },
        select: { role: true },
      });
      const isPrivileged = membership?.role === 'OWNER' || membership?.role === 'ADMIN';
      if (!isPrivileged) {
        const lastMessage = await this.prisma.message.findFirst({
          where: { channelId, authorId: userId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        if (lastMessage) {
          const elapsedMs = Date.now() - lastMessage.createdAt.getTime();
          const requiredMs = channel.slowModeSeconds * 1000;
          if (elapsedMs < requiredMs) {
            const retryAfter = Math.ceil((requiredMs - elapsedMs) / 1000);
            throw new HttpException(
              { message: `Yavaş mod aktif. Lütfen ${retryAfter} saniye bekleyin.`, error: 'SLOW_MODE', retryAfter },
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
        }
      }
    }

    // İçerik + ek doğrulama: ikisi de boş olamaz
    const hasContent = dto.content && dto.content.trim().length > 0;
    const hasAttachments = dto.attachmentIds && dto.attachmentIds.length > 0;
    if (!hasContent && !hasAttachments) {
      throw new BadRequestException({
        message: 'Mesaj içeriği veya en az bir dosya eki gereklidir.',
        error: 'EMPTY_MESSAGE',
      });
    }

    // DM kanalında blok kontrolü: blok sonradan konuşmayı keser.
    // GROUP_DM'de ATLA — grup arkadaş-tabanlı (oluşturma/ekleme kapısında garanti edilir).
    // Yalnız tam 2 üyeli 1-1 DM'de uygula.
    if (!channel.guildId && channel.type !== 'GROUP_DM') {
      await this.membership.requireNoDmBlock(userId, channelId);
    }

    // Automod: guild kanalı mesajlarında içerik filtresi (DM hariç — özel alan)
    // Sıfır DB, sıfır kayıt — sadece block-on-send.
    if (channel.guildId && hasContent) {
      const { blocked } = this.automod.check(dto.content!);
      if (blocked) {
        throw new BadRequestException({
          message: 'Mesajınız topluluk kurallarına uygun değil.',
          error: 'MESSAGE_BLOCKED',
        });
      }
    }

    // Attachment doğrulama: sahiplik + messageId null (henüz başka mesaja bağlanmamış)
    if (hasAttachments) {
      const attachments = await this.prisma.attachment.findMany({
        where: { id: { in: dto.attachmentIds } },
        select: { id: true, uploaderId: true, messageId: true },
      });

      if (attachments.length !== dto.attachmentIds!.length) {
        throw new BadRequestException({
          message: 'Geçersiz dosya eki ID\'si.',
          error: 'ATTACHMENT_NOT_FOUND',
        });
      }

      for (const att of attachments) {
        if (att.uploaderId !== userId) {
          throw new BadRequestException({
            message: 'Bu dosya size ait değil.',
            error: 'ATTACHMENT_FORBIDDEN',
          });
        }
        if (att.messageId !== null) {
          throw new BadRequestException({
            message: 'Bu dosya zaten başka bir mesaja eklenmiş.',
            error: 'ATTACHMENT_ALREADY_LINKED',
          });
        }
      }
    }

    const message = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        content: dto.content ?? '',
        replyToId: dto.replyToId ?? null,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: {
          select: { id: true, filename: true, contentType: true, size: true, scanStatus: true },
        },
        reactions: { select: { userId: true, emoji: true } },
      },
    });

    // Attachment'ları mesaja bağla + scan-gate uygula
    if (hasAttachments) {
      // LANSMAN: ATTACHMENT_SCAN_ENABLED=true + gerçek CSAM tarayıcı bağlanmadan canlıya ALINMAZ (R5)
      // false (dev): auto-CLEAN — feature test edilebilir
      // true (prod, gelecek): PENDING bırak → tarama servisi (R5 aracı bağlanır; bu sprint stub/no-op)
      const newScanStatus: ScanStatus = this.scanEnabled ? ScanStatus.PENDING : ScanStatus.CLEAN;

      await this.prisma.attachment.updateMany({
        where: { id: { in: dto.attachmentIds } },
        data: {
          messageId: message.id,
          scanStatus: newScanStatus,
        },
      });

      // Güncellenen attachment'ları mesaj DTO'suna yansıt
      const linkedAttachments = await this.prisma.attachment.findMany({
        where: { messageId: message.id },
        select: { id: true, filename: true, contentType: true, size: true, scanStatus: true },
      });

      return toMessageDto({ ...message, attachments: linkedAttachments, reactions: [] }, userId);
    }

    return toMessageDto(message, userId);
  }

  async editMessage(userId: string, channelId: string, messageId: string, dto: UpdateMessageDto) {
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.deletedAt !== null) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'MESSAGE_NOT_FOUND' });
    }

    if (message.authorId !== userId) {
      throw new ForbiddenException({ message: 'Bu mesajı düzenleme yetkiniz yok.', error: 'NOT_MESSAGE_AUTHOR' });
    }

    // İçerik boş olamaz
    if (!dto.content || dto.content.trim().length === 0) {
      throw new BadRequestException({ message: 'Mesaj içeriği boş olamaz.', error: 'EMPTY_MESSAGE' });
    }

    // Automod: guild kanalı içerik filtresi
    if (channel.guildId) {
      const { blocked } = this.automod.check(dto.content);
      if (blocked) {
        throw new BadRequestException({
          message: 'Mesajınız topluluk kurallarına uygun değil.',
          error: 'MESSAGE_BLOCKED',
        });
      }
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: dto.content, editedAt: new Date() },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: {
          select: { id: true, filename: true, contentType: true, size: true, scanStatus: true },
        },
        reactions: { select: { userId: true, emoji: true } },
      },
    });

    return toMessageDto(updated, userId);
  }

  async deleteMessage(userId: string, channelId: string, messageId: string) {
    await this.membership.requireChannelAccess(userId, channelId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.deletedAt !== null) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'MESSAGE_NOT_FOUND' });
    }

    if (message.authorId !== userId) {
      throw new ForbiddenException({ message: 'Bu mesajı silme yetkiniz yok.', error: 'NOT_MESSAGE_AUTHOR' });
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    return null;
  }

  async addReaction(userId: string, channelId: string, messageId: string, emoji: string) {
    await this.membership.requireChannelAccess(userId, channelId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt !== null) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'MESSAGE_NOT_FOUND' });
    }

    // Idempotent: zaten varsa no-op (upsert)
    await this.prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji },
      update: {},
    });

    return null;
  }

  async removeReaction(userId: string, channelId: string, messageId: string, emoji: string) {
    await this.membership.requireChannelAccess(userId, channelId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt !== null) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'MESSAGE_NOT_FOUND' });
    }

    // No-op: kayıt yoksa hata fırlama (deleteMany = 0 affected → ok)
    await this.prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });

    return null;
  }
}
