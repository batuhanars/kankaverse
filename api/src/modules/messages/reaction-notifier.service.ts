import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PushService } from '../../shared/push/push.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { RedisService } from '../../shared/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagesGateway } from './gateway/messages.gateway';
import { previewFromAttachments } from '../../common/utils/attachment-preview.util';
import {
  REACTION_PREVIEW_MAX,
  buildReactionPushBody,
} from '../../common/utils/reaction-notification.util';

/** Aynı kişi aynı mesaj için 24 saatte en fazla bir tepki bildirimi üretir (koy/kaldır/değiştir döngüsü). */
const REACTION_NOTIF_DEDUPE_TTL_SECONDS = 86_400;

/**
 * C46 §4 🔴 R7 — mesaj sahibine tepki bildirimi. Çağıran (controller) fire-and-forget çağırır;
 * burada atılan hata tepki isteğini ASLA düşürmez. Süzgeçler mevcut kapıları çağırır, yeni kapı yazmaz.
 */
@Injectable()
export class ReactionNotifierService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private notifications: NotificationsService,
    private push: PushService,
    private realtime: RealtimeService,
    private redis: RedisService,
    private gateway: MessagesGateway,
  ) {}

  async notifyAdded(actorId: string, channelId: string, messageId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        authorId: true,
        webhookId: true,
        content: true,
        deletedAt: true,
        attachments: { select: { contentType: true } },
      },
    });
    // Yazar = tepki veren; silinmiş mesaj; webhook mesajı → bildirim yok.
    if (!message || message.deletedAt !== null || message.webhookId) return;
    const authorId = message.authorId;
    if (!authorId || authorId === actorId) return;

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { deletedAt: true, reactionNotifications: true },
    });
    if (!author || author.deletedAt !== null || author.reactionNotifications === false) return;

    // Yazarın kanala erişimi kalmış mı: mevcut üyelik/erişim kapısı (ortamdan ayrılma, DM/grup üyeliği,
    // yaş ve özel kanal kapıları dahil). Erişim yoksa fırlatır → bildirim yok.
    let guildId: string | null;
    try {
      const channel = await this.membership.requireChannelAccess(authorId, channelId);
      guildId = channel.guildId;
    } catch {
      return;
    }

    // İki yönlü engel (yazar <-> tepki veren). `requireNoDmBlock` grup DM'de rastgele üyeye baktığı
    // için kullanılmaz; çift doğrudan sorgulanır (`voice:group_call_ring` ile aynı desen).
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: authorId, blockedId: actorId },
          { blockerId: actorId, blockedId: authorId },
        ],
      },
      select: { id: true },
    });
    if (block) return;

    // Sessize alma / NONE: ortamda kanal+ortam tercihi, DM'de kanal tercihi (DM push ile aynı süzgeç).
    if (!(await this.notifications.shouldNotifyChannel(authorId, guildId, channelId))) return;

    // Tekrar süzgeci EN SON: yalnız gerçekten gönderilecekse anahtar tüketilir. Redis hatasında
    // bildirim atlanır (spam riskine karşı muhafazakâr); tepkinin kendisi etkilenmez.
    const first = await this.redis
      .setIfAbsent(`rxn:notif:${messageId}:${actorId}`, REACTION_NOTIF_DEDUPE_TTL_SECONDS)
      .catch(() => false);
    if (!first) return;

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!actor) return;

    const text = await this.gateway.resolveMentionPreview(
      previewFromAttachments(message.content, message.attachments),
      guildId,
    );
    const preview = (text ? `${emoji} ${text}` : emoji).slice(0, REACTION_PREVIEW_MAX);

    if (guildId) {
      // Ortam: çan kaydı + WS `notification` + push (NotificationsService.create, mevcut yol).
      await this.notifications.create(authorId, {
        type: 'REACTION',
        actorId,
        guildId,
        channelId,
        messageId,
        preview,
      });
      return;
    }

    // DM: çan kaydı YOK (mevcut DM kuralı). Push doğrudan + WS `reaction.notify`.
    await this.push.sendToUsers([authorId], {
      title: actor.username,
      body: buildReactionPushBody(actor.username, emoji, text),
      data: { type: 'REACTION', channelId, messageId },
      androidChannelId: 'messages_v6',
      priority: 'high',
    });
    this.realtime.emitToUser(authorId, 'reaction.notify', {
      actor: { id: actor.id, username: actor.username, avatarUrl: actor.avatarUrl },
      emoji,
      channelId,
      messageId,
      preview,
    });
  }
}
