import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification, NotifTargetType, NotificationLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { CreateNotificationData, NotificationDto } from './dto/notification.dto';
import { NotificationPrefDto, SetNotificationPrefDto } from './dto/notification-pref.dto';

const MAX_LIMIT = 50;

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private membership: MembershipService,
  ) {}

  /**
   * §2 — Bildirim üret: persist SONRA emit. NotificationDto döner.
   * Üretim yalnız zaten T&S-süzülmüş tetikleyicilerden çağrılır (R7-hafif) —
   * burada yeni erişim kararı YOK.
   */
  async create(userId: string, data: CreateNotificationData): Promise<NotificationDto> {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: data.type,
        actorId: data.actorId ?? null,
        guildId: data.guildId ?? null,
        channelId: data.channelId ?? null,
        messageId: data.messageId ?? null,
        preview: data.preview ?? null,
      },
    });

    const dto = await this.toNotificationDto(notification);
    this.realtime.emitToUser(userId, 'notification', dto);
    return dto;
  }

  /**
   * §4 — Liste: createdAt azalan, cursor sayfalama (limit ≤50). nextCursor döner.
   */
  async list(
    userId: string,
    cursor?: string,
    limit?: number,
  ): Promise<{ items: NotificationDto[]; nextCursor: string | null }> {
    const take = Math.min(Math.max(limit ?? MAX_LIMIT, 1), MAX_LIMIT);

    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const items = await this.toNotificationDtos(page);
    return { items, nextCursor };
  }

  /**
   * §3 — Handshake snapshot: son okunmamışlar (take 50, createdAt desc) + unreadCount.
   */
  async snapshot(
    userId: string,
  ): Promise<{ notifications: NotificationDto[]; unreadCount: number }> {
    const [rows, count] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, readAt: null },
        orderBy: { createdAt: 'desc' },
        take: MAX_LIMIT,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    const notifications = await this.toNotificationDtos(rows);
    return { notifications, unreadCount: count };
  }

  /** §4 — Okunmamış sayısı. */
  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /** §4 — Tümünü okundu işaretle (readAt=now where readAt null). */
  async markAll(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }

  /**
   * §4 — Tek bildirimi okundu. Sahiplik kontrolü: başkasınınki/yok → jenerik 404.
   */
  async markOne(userId: string, id: string): Promise<NotificationDto> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException({ message: 'Bildirim bulunamadı.', error: 'NOTIFICATION_NOT_FOUND' });
    }

    const updated = notification.readAt
      ? notification
      : await this.prisma.notification.update({
          where: { id },
          data: { readAt: new Date() },
        });

    return this.toNotificationDto(updated);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // R12 — Bildirim tercihleri (sustur + seviye)
  // ─────────────────────────────────────────────────────────────────────────

  /** R12 — Kullanıcının TÜM tercih kayıtları (varsayılandan sapanlar). Boş olabilir. */
  async getPrefs(userId: string): Promise<NotificationPrefDto[]> {
    const rows = await this.prisma.notificationPref.findMany({ where: { userId } });
    return rows.map((r) => ({
      targetType: r.targetType,
      targetId: r.targetId,
      muted: r.muted,
      level: r.level,
    }));
  }

  /**
   * R12 — Tercihi upsert et (kısmi update: verilmeyen alan korunur).
   * Hafif erişim: GUILD → üyelik; CHANNEL → requireChannelAccess (sızıntı yok).
   */
  async setPref(userId: string, dto: SetNotificationPrefDto): Promise<NotificationPrefDto> {
    if (dto.targetType === NotifTargetType.GUILD) {
      await this.membership.requireGuildMembership(userId, dto.targetId);
    } else {
      await this.membership.requireChannelAccess(userId, dto.targetId);
    }

    const pref = await this.prisma.notificationPref.upsert({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
      create: {
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        ...(dto.muted !== undefined ? { muted: dto.muted } : {}),
        ...(dto.level !== undefined ? { level: dto.level } : {}),
      },
      update: {
        ...(dto.muted !== undefined ? { muted: dto.muted } : {}),
        ...(dto.level !== undefined ? { level: dto.level } : {}),
      },
    });

    return {
      targetType: pref.targetType,
      targetId: pref.targetId,
      muted: pref.muted,
      level: pref.level,
    };
  }

  /**
   * R12 — Suppression çözümü: kanal tercihi → guild tercihi → varsayılan(ALL, unmuted).
   * Etkin `muted===true` veya `level==='NONE'` → false (bildirim yok). Aksi → true.
   * DM/friend bildirimleri guild/kanal-kapsamlı değil → bu helper ile süzülmez.
   */
  async shouldNotifyChannel(
    userId: string,
    guildId: string | null,
    channelId: string,
  ): Promise<boolean> {
    // Etkin tercih: kanal varsa onu, yoksa guild'i kullan.
    const targets: { targetType: NotifTargetType; targetId: string }[] = [
      { targetType: NotifTargetType.CHANNEL, targetId: channelId },
    ];
    if (guildId) {
      targets.push({ targetType: NotifTargetType.GUILD, targetId: guildId });
    }

    const prefs = await this.prisma.notificationPref.findMany({
      where: { userId, OR: targets },
    });

    const channelPref = prefs.find((p) => p.targetType === NotifTargetType.CHANNEL);
    const guildPref = prefs.find((p) => p.targetType === NotifTargetType.GUILD);
    const effective = channelPref ?? guildPref;

    // Varsayılan: kayıt yok → muted=false, level=ALL → bildir.
    if (!effective) return true;

    if (effective.muted) return false;
    if (effective.level === NotificationLevel.NONE) return false;
    return true;
  }

  /**
   * §5 — actor read-time User join ile çözülür (id/username/avatarUrl; SetNull → null).
   */
  private async toNotificationDto(n: Notification): Promise<NotificationDto> {
    let actor: NotificationDto['actor'] = null;
    if (n.actorId) {
      const user = await this.prisma.user.findUnique({
        where: { id: n.actorId },
        select: { id: true, username: true, avatarUrl: true },
      });
      actor = user ? { id: user.id, username: user.username, avatarUrl: user.avatarUrl } : null;
    }

    return {
      id: n.id,
      type: n.type,
      actor,
      guildId: n.guildId,
      channelId: n.channelId,
      messageId: n.messageId,
      preview: n.preview,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    };
  }

  /** Çoklu satır için tek sorguda actor join (N+1 önlemek). */
  private async toNotificationDtos(rows: Notification[]): Promise<NotificationDto[]> {
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, username: true, avatarUrl: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    return rows.map((n) => {
      const actor = n.actorId ? actorById.get(n.actorId) ?? null : null;
      return {
        id: n.id,
        type: n.type,
        actor: actor ? { id: actor.id, username: actor.username, avatarUrl: actor.avatarUrl } : null,
        guildId: n.guildId,
        channelId: n.channelId,
        messageId: n.messageId,
        preview: n.preview,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      };
    });
  }
}
