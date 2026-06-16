import { BadRequestException, ConflictException, ForbiddenException, Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { AutomodService } from '../../shared/automod/automod.service';
import { ModerationService } from '../../shared/moderation/moderation.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { Attachment, Message, MessageReaction, ScanStatus, User } from '@prisma/client';

type AttachmentDto = Pick<Attachment, 'id' | 'filename' | 'contentType' | 'size' | 'scanStatus'>;

type ReactionAggDto = { emoji: string; count: number; reactedByMe: boolean };

type ReplyToDto = { id: string; content: string; authorUsername: string } | null;

type ReplyToRaw = (Pick<Message, 'id' | 'content' | 'deletedAt'> & {
  author: Pick<User, 'username'>;
}) | null;

type MessageWithAuthor = Message & {
  author: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  attachments: AttachmentDto[];
  reactions?: Pick<MessageReaction, 'userId' | 'emoji'>[];
  replyTo?: ReplyToRaw;
  mentions: string[];
  pinnedAt: Date | null;
};

// replyTo snippet: ≤100 karakter; dosya ekli + boş içerik → "[dosya]"; silinmişse null
function buildReplyToDto(raw: ReplyToRaw): ReplyToDto {
  if (!raw || raw.deletedAt !== null) return null;
  const snippet = raw.content.trim().length > 0
    ? raw.content.slice(0, 100)
    : '[dosya]';
  return { id: raw.id, content: snippet, authorUsername: raw.author.username };
}

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
    replyTo: buildReplyToDto(msg.replyTo ?? null),
    editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
    pinnedAt: msg.pinnedAt ? msg.pinnedAt.toISOString() : null,
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
    mentions: msg.mentions ?? [],
    createdAt: msg.createdAt.toISOString(),
  };
}

// replyTo include fragmanı — tüm sorgularda aynı şekil kullanılır
const REPLY_TO_INCLUDE = {
  select: {
    id: true,
    content: true,
    deletedAt: true,
    author: { select: { username: true } },
  },
} as const;

@Injectable()
export class MessagesService {
  private readonly scanEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private permissions: PermissionsService,
    private automod: AutomodService,
    private config: ConfigService,
    private moderation: ModerationService,
  ) {
    this.scanEnabled = config.get<boolean>('attachmentScanEnabled') ?? false;
  }

  /**
   * §3 + §4 — Mention token parse + erişim doğrulaması (T&S / R7 incelemesi)
   *
   * 1. content içinden <@userId> token'larını regex ile topla, tekilleştir.
   *    Eşleşme yoksa erken [] dön — ekstra sorgu yok.
   * 2. Erişim doğrulaması (T&S KRİTİK — requireChannelAccess kapılarını birebir aynalar):
   *    - Guild kanalı → GuildMember + isMinor TEK sorguda; needsAgeCheck ise minörler elenir.
   *    - DM/grup DM → ChannelMember + isMinor TEK sorguda; channel.ageGated ise minörler elenir.
   *    Yalnız dönen set geçerlidir; geçersiz/erişimsiz token sessizce düşer.
   *    Ayrı hata kodu YOK, durum sızıntısı YOK (taciz/spam vektörü + minör/varlık).
   * 3. ≤10 sınırı: fazlası sessizce kesilir (anti-spam, hata değil).
   *
   * @param channel — requireChannelAccess'in döndürdüğü guild-include'lu kanal objesi.
   *   Çağıranlar (create, editMessage) bu objeyi zaten elde ediyor; ayrı bayrak sorgusu yapılmaz.
   */
  private async resolveMentions(
    channel: { id: string; guildId: string | null; ageGated: boolean; guild?: { adultsOnly: boolean } | null },
    content: string,
  ): Promise<string[]> {
    // Adım 1: token parse + tekilleştir
    const MENTION_REGEX = /<@([a-zA-Z0-9_-]+)>/g;
    const tokenIds = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = MENTION_REGEX.exec(content)) !== null) {
      tokenIds.add(match[1]);
    }

    // Erken çıkış: token yoksa sorgu yapma
    if (tokenIds.size === 0) return [];

    const ids = Array.from(tokenIds);

    // Adım 2: erişim doğrulaması — TEK toplu sorgu (N+1 yok)
    let validIds: string[];

    if (channel.guildId !== null) {
      // Guild kanalı: üyelik + isMinor TEK sorguda (requireChannelAccess satır 58-69 ile birebir)
      const needsAgeCheck = channel.ageGated || (channel.guild?.adultsOnly ?? false);
      const members = await this.prisma.guildMember.findMany({
        where: { guildId: channel.guildId, userId: { in: ids } },
        select: { userId: true, user: { select: { isMinor: true } } },
      });
      const valid = needsAgeCheck ? members.filter((m) => !m.user.isMinor) : members;
      const validSet = new Set(valid.map((m) => m.userId));
      validIds = ids.filter((id) => validSet.has(id));
    } else {
      // DM / grup DM: ChannelMember kontrolü + isMinor (tutarlılık için)
      const needsAgeCheck = channel.ageGated;
      const members = await this.prisma.channelMember.findMany({
        where: { channelId: channel.id, userId: { in: ids } },
        select: { userId: true, user: { select: { isMinor: true } } },
      });
      const valid = needsAgeCheck ? members.filter((m) => !m.user.isMinor) : members;
      const validSet = new Set(valid.map((m) => m.userId));
      validIds = ids.filter((id) => validSet.has(id));
    }

    // Adım 3: ≤10 sınırı (fazlası sessizce düşer)
    return validIds.slice(0, 10);
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
        replyTo: REPLY_TO_INCLUDE,
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

    // replyToId doğrulama: var + silinmemiş + AYNI kanal
    if (dto.replyToId) {
      const replyTarget = await this.prisma.message.findUnique({
        where: { id: dto.replyToId },
        select: { id: true, channelId: true, deletedAt: true },
      });
      if (!replyTarget || replyTarget.deletedAt !== null || replyTarget.channelId !== channelId) {
        throw new BadRequestException({ message: 'Geçersiz yanıt hedefi.', error: 'INVALID_REPLY' });
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

    // §3: mention token parse + erişim doğrulaması (§4 T&S) — create'ten önce
    const mentions = await this.resolveMentions(channel, dto.content ?? '');

    const message = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        content: dto.content ?? '',
        replyToId: dto.replyToId ?? null,
        mentions,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: {
          select: { id: true, filename: true, contentType: true, size: true, scanStatus: true },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
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

    // §3: mention token parse + erişim doğrulaması (§4 T&S) — edit'te yeniden hesapla
    const mentions = await this.resolveMentions(channel, dto.content);

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: dto.content, editedAt: new Date(), mentions },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: {
          select: { id: true, filename: true, contentType: true, size: true, scanStatus: true },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
    });

    return toMessageDto(updated, userId);
  }

  async deleteMessage(userId: string, channelId: string, messageId: string) {
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.deletedAt !== null) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'MESSAGE_NOT_FOUND' });
    }

    // Kendi mesajını silmek her zaman serbest.
    // Başkasının mesajını silmek: guild kanalında MANAGE_MESSAGES izni gerekir.
    if (message.authorId !== userId) {
      if (!channel.guildId) {
        // DM/grup DM kanalında başkasının mesajını silemezsin
        throw new ForbiddenException({ message: 'Bu mesajı silme yetkiniz yok.', error: 'NOT_MESSAGE_AUTHOR' });
      }
      const canManage = await this.permissions.hasGuildPermission(userId, channel.guildId, 'MANAGE_MESSAGES');
      if (!canManage) {
        throw new ForbiddenException({ message: 'Bu mesajı silme yetkiniz yok.', error: 'NOT_MESSAGE_AUTHOR' });
      }
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

  // ── PIN ortak yetki yardımcısı ──────────────────────────────────────────────
  // Guild kanalı → MANAGE_MESSAGES; DM/grup DM → requireChannelAccess üyeliği yeterli.
  private async requirePinAccess(
    userId: string,
    channel: Awaited<ReturnType<typeof this.membership.requireChannelAccess>>,
  ): Promise<void> {
    if (channel.guildId) {
      // Guild kanalı: üyeliği zaten requireChannelAccess doğruladı; MANAGE_MESSAGES kontrolü ek
      const canManage = await this.permissions.hasGuildPermission(userId, channel.guildId, 'MANAGE_MESSAGES');
      if (!canManage) {
        throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
      }
    }
    // DM/grup DM: requireChannelAccess üyeliği yeterli — ek kontrol yok
  }

  async pinMessage(userId: string, channelId: string, messageId: string): Promise<null> {
    const channel = await this.membership.requireChannelAccess(userId, channelId);
    await this.requirePinAccess(userId, channel);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt !== null || message.channelId !== channelId) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'INVALID_MESSAGE' });
    }

    // İdempotent: zaten sabitliyse no-op
    if (message.pinnedAt !== null) {
      return null;
    }

    // 50 sınırı: kanal başına en fazla 50 sabit mesaj
    const pinCount = await this.prisma.message.count({
      where: { channelId, pinnedAt: { not: null }, deletedAt: null },
    });
    if (pinCount >= 50) {
      throw new ConflictException({ message: 'Bu kanalda en fazla 50 mesaj sabitlenebilir.', error: 'PIN_LIMIT' });
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: new Date(), pinnedById: userId },
    });

    return null;
  }

  async unpinMessage(userId: string, channelId: string, messageId: string): Promise<null> {
    const channel = await this.membership.requireChannelAccess(userId, channelId);
    await this.requirePinAccess(userId, channel);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt !== null || message.channelId !== channelId) {
      throw new NotFoundException({ message: 'Mesaj bulunamadı.', error: 'INVALID_MESSAGE' });
    }

    // İdempotent: zaten sabit değilse no-op
    if (message.pinnedAt === null) {
      return null;
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: null, pinnedById: null },
    });

    return null;
  }

  async searchMessages(userId: string, channelId: string, q: string, before?: string) {
    // Erişim + yaş kapısı + DM throw'ları propagate
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    // q doğrulama: trim, min 2 karakter
    const trimmedQ = q.trim();
    if (trimmedQ.length < 2) {
      throw new BadRequestException({
        error: 'QUERY_TOO_SHORT',
        message: 'Arama için en az 2 karakter girin.',
      });
    }
    // Maks 100 karakterde kes
    const safeQ = trimmedQ.slice(0, 100);

    // createdAt filtresi: findMessages'deki B1 dersiyle aynı — DM clearedAt (gt) + cursor before (lt)
    // TEK objede birleştirilir; ayrı spread kullanılmaz.
    const createdAtFilter: { gt?: Date; lt?: Date } = {};

    if (before) {
      const beforeMsg = await this.prisma.message.findUnique({ where: { id: before } });
      if (beforeMsg) createdAtFilter.lt = beforeMsg.createdAt;
    }

    // G4: DM kanalında clearedAt filtrelemesi (findMessages ile birebir)
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
        content: { contains: safeQ, mode: 'insensitive' },
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: {
          select: { id: true, filename: true, contentType: true, size: true, scanStatus: true },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return messages.map((msg) => toMessageDto(msg, userId));
  }

  async findPins(userId: string, channelId: string) {
    // requireChannelAccess: üyelik + yaş kapısı dahil
    await this.membership.requireChannelAccess(userId, channelId);

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        pinnedAt: { not: null },
        deletedAt: null,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: {
          select: { id: true, filename: true, contentType: true, size: true, scanStatus: true },
        },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
      orderBy: { pinnedAt: 'desc' },
    });

    return messages.map((msg) => toMessageDto(msg, userId));
  }

  /**
   * Sunucu-geneli mesaj arama — kullanıcının ERİŞEBİLDİĞİ guild metin kanallarında.
   * Sızıntı-güvenli: yaş-kapılı/adultsOnly minöre kapalı; özel kanal yalnız OWNER/ADMIN
   * veya ChannelMember'a. Sonuç kanal-gruplu döner (Discord-tarzı).
   */
  async searchGuildMessages(
    userId: string,
    guildId: string,
    q: string,
    opts?: { from?: string; mentions?: string },
  ) {
    const { membership } = await this.membership.requireGuildMembership(userId, guildId);

    // q opsiyonel: dolu ise ≥2 karakter şartı korunur, boşsa metin filtresi uygulanmaz.
    const trimmedQ = (q ?? '').trim();
    const hasQ = trimmedQ.length > 0;
    if (hasQ && trimmedQ.length < 2) {
      throw new BadRequestException({ error: 'QUERY_TOO_SHORT', message: 'Arama için en az 2 karakter girin.' });
    }
    const safeQ = trimmedQ.slice(0, 100);

    // from / mentions opsiyonel filtreler (boş string = yok say)
    const from = opts?.from?.trim() || undefined;
    const mentions = opts?.mentions?.trim() || undefined;

    // En az biri (q | from | mentions) dolu olmalı; hiçbiri yoksa hata değil → boş sonuç.
    if (!hasQ && !from && !mentions) return [];

    const guild = await this.prisma.guild.findUnique({ where: { id: guildId }, select: { adultsOnly: true } });
    const channels = await this.prisma.channel.findMany({
      where: { guildId, deletedAt: null, type: 'GUILD_TEXT' },
      select: { id: true, name: true, ageGated: true, isPrivate: true },
    });

    const privileged = membership.role === 'OWNER' || membership.role === 'ADMIN';
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isMinor: true } });
    const isMinor = user?.isMinor ?? false;

    // Özel kanal üyeliği (yalnız ayrıcalıklı değilse gerekir)
    let memberChannelIds = new Set<string>();
    const privateIds = channels.filter((c) => c.isPrivate).map((c) => c.id);
    if (privateIds.length && !privileged) {
      const cms = await this.prisma.channelMember.findMany({
        where: { userId, channelId: { in: privateIds } },
        select: { channelId: true },
      });
      memberChannelIds = new Set(cms.map((c) => c.channelId));
    }

    const accessible = channels.filter((c) => {
      if ((c.ageGated || guild?.adultsOnly) && isMinor) return false; // yaş kapısı
      if (c.isPrivate && !privileged && !memberChannelIds.has(c.id)) return false; // özel kanal
      return true;
    });
    if (accessible.length === 0) return [];

    const nameById = new Map(accessible.map((c) => [c.id, c.name]));
    const messages = await this.prisma.message.findMany({
      where: {
        channelId: { in: accessible.map((c) => c.id) },
        deletedAt: null,
        // Dolu filtreler AND'lenir; boş olanlar where'e hiç girmez (mevcut q-only davranış korunur).
        ...(hasQ ? { content: { contains: safeQ, mode: 'insensitive' as const } } : {}),
        ...(from ? { authorId: from } : {}),
        ...(mentions ? { mentions: { has: mentions } } : {}),
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: { select: { id: true, filename: true, contentType: true, size: true, scanStatus: true } },
        reactions: { select: { userId: true, emoji: true } },
        replyTo: REPLY_TO_INCLUDE,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Kanal-gruplu sonuç (kanal sırası: ilk eşleşmenin geldiği sıra)
    const grouped = new Map<string, ReturnType<typeof toMessageDto>[]>();
    for (const m of messages) {
      if (!grouped.has(m.channelId)) grouped.set(m.channelId, []);
      grouped.get(m.channelId)!.push(toMessageDto(m, userId));
    }
    return [...grouped.entries()].map(([channelId, msgs]) => ({
      channelId,
      channelName: nameById.get(channelId) ?? '',
      messages: msgs,
    }));
  }
}
