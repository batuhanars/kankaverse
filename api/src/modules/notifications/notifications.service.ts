import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Notification, NotificationPref, NotifTargetType, NotificationLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PushService } from '../../shared/push/push.service';
import {
  V2MessageData,
  channelConversationTitle,
  clampV2Text,
  v2Timestamp,
} from '../../shared/push/push-v2';
import { CreateNotificationData, NotificationDto } from './dto/notification.dto';
import { NotificationPrefDto, SetNotificationPrefDto } from './dto/notification-pref.dto';
import { CreatePushTokenDto } from './dto/push-token.dto';
import {
  buildReactionPushBody,
  splitReactionPreview,
} from '../../common/utils/reaction-notification.util';

const MAX_LIMIT = 50;
/** C75 §2.3: aynı kişiden gelen mesaj isteği bildirimi için yeniden üretim aralığı. */
const MESSAGE_REQUEST_NOTIFY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * R12/M2b — "Aktif mute" tek kaynak: süresiz (mutedUntil null) veya süresi henüz geçmemiş.
 * `shouldNotifyChannel` burada kullanır; `guilds.service.ts` `findMyGuilds` rozet süzgeci de
 * aynı fonksiyonu import eder (iki yerde ayrı mute-mantığı yazılmaz — Sprint M2b §10 R1-1).
 */
export function isMuteActive(muted: boolean, mutedUntil: Date | null): boolean {
  return muted && (!mutedUntil || mutedUntil > new Date());
}

/** R12/R14 — NotificationPref satırı → istemci sözleşmesi şekli (tek kaynak; get + set aynı map). */
function toPrefDto(pref: NotificationPref): NotificationPrefDto {
  return {
    targetType: pref.targetType,
    targetId: pref.targetId,
    muted: pref.muted,
    mutedUntil: pref.mutedUntil ? pref.mutedUntil.toISOString() : null,
    level: pref.level,
    suppressEveryone: pref.suppressEveryone,
    suppressEvents: pref.suppressEvents,
    suppressRoleMentions: pref.suppressRoleMentions,
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private membership: MembershipService,
    private push: PushService,
  ) {}

  /**
   * §2 — Bildirim üret: persist SONRA emit. NotificationDto döner.
   * Üretim yalnız zaten T&S-süzülmüş tetikleyicilerden çağrılır (R7-hafif) —
   * burada yeni erişim kararı YOK.
   *
   * M3 §2.4 — kalıcı bildirim üretilen NOKTAYA push takılır (aynı alıcı kümesi,
   * yeni bir "kime gitsin" süzgeci YOK). Fire-and-forget: push gönderimi ana akışı
   * (persist + WS emit + HTTP/WS yanıtı) ASLA bloke ETMEZ; PushService kendi içinde
   * tüm hataları yutar, burada `.catch` yalnız ek güvenlik.
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
        aiVideoId: data.aiVideoId ?? null,
      },
    });

    const dto = await this.toNotificationDto(notification);
    this.realtime.emitToUser(userId, 'notification', dto);
    // Görsel sorgusu tek satır ve ucuz; push gönderimi yine fire-and-forget.
    const imageUrl = await this.pushImageFor(dto).catch(() => null);
    const v2 = await this.mentionV2(dto).catch(() => undefined);
    this.push
      .sendToUsers([userId], { ...this.toPushPayload(dto), imageUrl, ...(v2 && { v2 }) })
      .catch(() => {});
    return dto;
  }

  /**
   * R14 §2.3 — Aynı bildirimi ÇOK alıcıya üret (etkinlik gibi toplu tetikleyiciler).
   *
   * N+1 yasağı: insert TEK `createManyAndReturn`, actor/guild çözümü `toNotificationDtos` ile
   * TEK sorguda (alıcı başına sorgu YOK). Emit kullanıcı başına yapılır — payload kişiye özel
   * (kendi bildirim id'si). Tekil `create()` bozulmaz; iki yol da aynı DTO şeklini üretir.
   *
   * Alıcı listesi ÇAĞIRANIN sorumluluğu: burada erişim/tercih kararı verilmez (R7-nötr) —
   * çağıran zaten T&S-süzülmüş + tercih-süzülmüş kümeyi geçirir.
   */
  async createMany(userIds: string[], data: CreateNotificationData): Promise<NotificationDto[]> {
    const targets = [...new Set(userIds)];
    if (targets.length === 0) return [];

    const rows = await this.prisma.notification.createManyAndReturn({
      data: targets.map((userId) => ({
        userId,
        type: data.type,
        actorId: data.actorId ?? null,
        guildId: data.guildId ?? null,
        channelId: data.channelId ?? null,
        messageId: data.messageId ?? null,
        preview: data.preview ?? null,
        aiVideoId: data.aiVideoId ?? null,
      })),
    });

    // toNotificationDtos satır sırasını korur → index eşlemesi güvenli.
    const dtos = await this.toNotificationDtos(rows);
    rows.forEach((row, i) => this.realtime.emitToUser(row.userId, 'notification', dtos[i]));
    // M3 §2.4 — tek payload tüm alıcılara (data/preview ortak; createMany'nin kendi tanımı gereği
    // her satır aynı CreateNotificationData'dan üretildi). Fire-and-forget (bkz. create() notu).
    if (dtos.length > 0) {
      const imageUrl = await this.pushImageFor(dtos[0]).catch(() => null);
      this.push.sendToUsers(targets, { ...this.toPushPayload(dtos[0]), imageUrl }).catch(() => {});
    }
    return dtos;
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
   * Bildirim listesini temizle (sahip isteği 2026-11-14). Kullanıcının KENDİ başlattığı silmedir;
   * yalnız kendi satırları (userId filtresi) silinir. `markFriendRequestActioned` notundaki
   * "sessizce yok edilmez" kuralı sistemin kendiliğinden silmesi içindir, bu ona aykırı değil.
   * Bildirim satırı T&S kanıtı taşımaz (şikâyet/moderasyon kendi kayıtlarını tutar).
   */
  async clearAll(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.deleteMany({ where: { userId } });
    return { count: result.count };
  }

  /**
   * §4 — Tek bildirimi okundu. Sahiplik kontrolü: başkasınınki/yok → jenerik 404.
   */
  async markOne(userId: string, id: string): Promise<NotificationDto> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException({
        message: 'Bildirim bulunamadı.',
        error: 'NOTIFICATION_NOT_FOUND',
      });
    }

    const updated = notification.readAt
      ? notification
      : await this.prisma.notification.update({
          where: { id },
          data: { readAt: new Date() },
        });

    return this.toNotificationDto(updated);
  }

  /**
   * M1b R1 (sahip bulgusu 2026-07-30, mobil turu) — İŞLEM GÖRMÜŞ kankalık isteğinin bildirimi
   * okunmamış kalmıyor.
   *
   * Belirti: kullanıcı isteği kabul ediyor, ama Bildirimler rozeti hâlâ okunmamış sayıyor ve satır
   * "sana kanka isteği gönderdi" diye duruyor — artık var olmayan bir eylemi bekliyor gibi.
   * Kök neden: bu servis bildirimi ÜRETİYOR ama isteğin sonuçlanmasıyla ilgilenmiyordu; hiçbir
   * istemci de bunu yapmıyordu. **Web'de de aynı kusur vardı** (istemci-tarafı düzeltme iki yerde
   * tekrar demekti), o yüzden çözüm sunucuda: kaynağında bir kez.
   *
   * `updateMany` bilinçli: aynı kişiden gelmiş birden fazla okunmamış istek bildirimi varsa
   * (istek gönder → geri çek → tekrar gönder) hepsi kapanır. Silme DEĞİL okundu işaretleme —
   * bildirim geçmişi kullanıcının kaydıdır, sessizce yok edilmez.
   */
  async markFriendRequestActioned(recipientId: string, requesterId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: recipientId, actorId: requesterId, type: 'FRIEND_REQUEST', readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * C75 — Mesaj isteği bildirimi: kanal başına okunmamış `MESSAGE_REQUEST` kayıtlarını okundu
   * işaretler (`markFriendRequestActioned` deseni, silme değil). İstek kabul/ret/örtük kabulle
   * sonuçlandığında çağrılır; aksi halde rozet artık var olmayan bir isteği bekler.
   */
  async markMessageRequestActioned(recipientId: string, channelId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: recipientId, channelId, type: 'MESSAGE_REQUEST', readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * C75 §2.3 — İstek sahibinin ilk mesajında alıcıya kalıcı bildirim + push (içeriksiz, K2).
   *
   * Kötüye kullanım sınırı: aynı `actorId → userId` çifti için son 24 saatte `MESSAGE_REQUEST`
   * kaydı varsa YENİSİ üretilmez (kayıt da push da yok). Aksi halde reddet → yeniden "Mesaj at"
   * döngüsü alıcıya sınırsız push yağdırırdı. Dönüş: üretildiyse true.
   */
  async notifyMessageRequest(
    recipientId: string,
    requesterId: string,
    channelId: string,
  ): Promise<boolean> {
    const since = new Date(Date.now() - MESSAGE_REQUEST_NOTIFY_WINDOW_MS);
    const recent = await this.prisma.notification.findFirst({
      where: {
        userId: recipientId,
        actorId: requesterId,
        type: 'MESSAGE_REQUEST',
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) return false;
    await this.create(recipientId, { type: 'MESSAGE_REQUEST', actorId: requesterId, channelId });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // M3 §2.1/§2.2 — Push token kaydı (Expo). Token KULLANICIYA bağlıdır, cihaza değil.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /notifications/push-tokens — upsert (token @unique).
   * 🔴 Aynı cihazda başka hesap açılırsa `userId` yeni kullanıcıya TAŞINIR (update dalı da
   * userId'yi yazar) — aksi hâlde önceki kullanıcının bildirimi yeni kullanıcının cihazına
   * düşerdi (T&S sızıntısı, contract §2.1/§4).
   */
  async registerPushToken(
    userId: string,
    tokenFamily: string,
    dto: CreatePushTokenDto,
  ): Promise<null> {
    await this.prisma.pushToken.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        deviceName: dto.deviceName ?? null,
        format: dto.format ?? 1,
        tokenFamily,
      },
      update: {
        userId,
        platform: dto.platform,
        deviceName: dto.deviceName ?? null,
        // C50: yeni sürüme geçen cihaz 2 olur; verilmezse 1 (eski sürüme dönen cihaz v1'e düşer).
        format: dto.format ?? 1,
        // C70: aynı cihazda yeni girişte token yeni oturum ailesine taşınır.
        tokenFamily,
        lastUsedAt: new Date(),
      },
    });
    return null;
  }

  /**
   * DELETE /notifications/push-tokens/:token — yalnız KENDİ token'ını siler.
   * Başkasınınki veya yok → jenerik 404 (varlık sızdırma yok — §2.2).
   */
  async deletePushToken(userId: string, token: string): Promise<null> {
    const row = await this.prisma.pushToken.findUnique({ where: { token } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException({
        message: 'Push token bulunamadı.',
        error: 'PUSH_TOKEN_NOT_FOUND',
      });
    }
    await this.prisma.pushToken.delete({ where: { token } });
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // R12 — Bildirim tercihleri (sustur + seviye)
  // ─────────────────────────────────────────────────────────────────────────

  /** R12 — Kullanıcının TÜM tercih kayıtları (varsayılandan sapanlar). Boş olabilir. */
  async getPrefs(userId: string): Promise<NotificationPrefDto[]> {
    const rows = await this.prisma.notificationPref.findMany({ where: { userId } });
    return rows.map((r) => toPrefDto(r));
  }

  /**
   * R12 — Tercihi upsert et (kısmi update: verilmeyen alan korunur).
   * Hafif erişim: GUILD → üyelik; CHANNEL → requireChannelAccess (sızıntı yok).
   */
  async setPref(userId: string, dto: SetNotificationPrefDto): Promise<NotificationPrefDto> {
    // R14 §2.2 — iki bastırma bayrağı YALNIZ ortam düzeyinde anlamlı. Kanal düzeyinde kabul
    // etseydik `channelPref ?? guildPref` override zinciri, kanal kaydı oluşur oluşmaz ortam
    // bastırmasını sessizce geri getirirdi. Erişim kontrolünden ÖNCE elenir (ucuz + net).
    const suppressionTouched =
      dto.suppressEveryone !== undefined ||
      dto.suppressEvents !== undefined ||
      dto.suppressRoleMentions !== undefined;
    if (suppressionTouched && dto.targetType !== NotifTargetType.GUILD) {
      throw new BadRequestException({
        message: 'Bu ayar yalnız ortam düzeyinde geçerlidir.',
        error: 'INVALID_PREF_TARGET',
      });
    }

    if (dto.targetType === NotifTargetType.GUILD) {
      await this.membership.requireGuildMembership(userId, dto.targetId);
    } else {
      await this.membership.requireChannelAccess(userId, dto.targetId);
    }

    // Kısmi update: yalnız gönderilen alanlar yazılır (create ve update aynı seti kullanır).
    const changed = {
      ...(dto.muted !== undefined ? { muted: dto.muted } : {}),
      ...(dto.mutedUntil !== undefined
        ? { mutedUntil: dto.mutedUntil ? new Date(dto.mutedUntil) : null }
        : {}),
      ...(dto.level !== undefined ? { level: dto.level } : {}),
      ...(dto.suppressEveryone !== undefined ? { suppressEveryone: dto.suppressEveryone } : {}),
      ...(dto.suppressEvents !== undefined ? { suppressEvents: dto.suppressEvents } : {}),
      ...(dto.suppressRoleMentions !== undefined
        ? { suppressRoleMentions: dto.suppressRoleMentions }
        : {}),
    };

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
        ...changed,
      },
      update: { ...changed },
    });

    return toPrefDto(pref);
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

    // Süreli sustur: mutedUntil null → süresiz; geçmişse mute sona ermiş (bildir).
    if (isMuteActive(effective.muted, effective.mutedUntil)) return false;
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

    // GUILD_INVITE vb. guildId taşıyan bildirimde guild.name read-time çözülür.
    let guildName: string | null = null;
    if (n.guildId) {
      const guild = await this.prisma.guild.findUnique({
        where: { id: n.guildId },
        select: { name: true },
      });
      guildName = guild?.name ?? null;
    }

    return {
      id: n.id,
      type: n.type,
      actor,
      guildId: n.guildId,
      guildName,
      channelId: n.channelId,
      messageId: n.messageId,
      preview: n.preview,
      aiVideoId: n.aiVideoId,
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

    // guildId taşıyan bildirimler (GUILD_INVITE) için guild.name'leri TEK sorguda çöz (N+1 yok).
    const guildIds = [...new Set(rows.map((r) => r.guildId).filter((id): id is string => !!id))];
    const guilds = guildIds.length
      ? await this.prisma.guild.findMany({
          where: { id: { in: guildIds } },
          select: { id: true, name: true },
        })
      : [];
    const guildNameById = new Map(guilds.map((g) => [g.id, g.name]));

    return rows.map((n) => {
      const actor = n.actorId ? (actorById.get(n.actorId) ?? null) : null;
      return {
        id: n.id,
        type: n.type,
        actor: actor
          ? { id: actor.id, username: actor.username, avatarUrl: actor.avatarUrl }
          : null,
        guildId: n.guildId,
        guildName: n.guildId ? (guildNameById.get(n.guildId) ?? null) : null,
        channelId: n.channelId,
        messageId: n.messageId,
        preview: n.preview,
        aiVideoId: n.aiVideoId,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      };
    });
  }

  /**
   * C50 — MENTION için veri-yalnız push biçimi. Yalnız v2 bayrağı açıkken ve gönderen/önizleme
   * bilinirken üretilir (aksi halde `undefined` → v1 yolu); kanal bilgisi için TEK sorgu.
   * Webhook mesajı aktörsüz yazıldığı için (C35) v2 üretilmez, v1 bildirimi gider.
   */
  private async mentionV2(dto: NotificationDto): Promise<V2MessageData | undefined> {
    if (!this.push.v2Enabled) return undefined;
    if (dto.type !== 'MENTION' || !dto.channelId || !dto.actor || !dto.preview) return undefined;

    const channel = await this.prisma.channel.findUnique({
      where: { id: dto.channelId },
      select: { type: true, name: true, guild: { select: { name: true, iconUrl: true } } },
    });
    if (!channel) return undefined;

    const isOneToOne = channel.type === 'DM';
    const inGuild = !!dto.guildId;
    return {
      v: 2,
      kind: 'message',
      type: 'MENTION',
      conversationId: dto.channelId,
      guildId: dto.guildId,
      messageId: dto.messageId,
      senderId: dto.actor.id,
      senderName: dto.actor.username,
      senderAvatarUrl: dto.actor.avatarUrl ?? null,
      isGroup: !isOneToOne,
      conversationTitle: inGuild
        ? channelConversationTitle(channel.name, channel.guild?.name, dto.actor.username)
        : isOneToOne
          ? null
          : (channel.name ?? null),
      conversationIconUrl: inGuild ? (channel.guild?.iconUrl ?? null) : null,
      text: clampV2Text(dto.preview),
      timestamp: v2Timestamp(dto.createdAt),
    };
  }

  /**
   * Bildirimin sağındaki görsel (sahip kararı 2026-11-08): ortama bağlı bildirimde (bahsetme,
   * tepki, etkinlik, davet) ortamın statik simgesi. Ortamsız bildirimde görsel yok. Simge yoksa null.
   */
  private async pushImageFor(dto: NotificationDto): Promise<string | null> {
    if (!dto.guildId) return null;
    const guild = await this.prisma.guild.findUnique({
      where: { id: dto.guildId },
      select: { iconUrl: true },
    });
    return guild?.iconUrl ?? null;
  }

  /**
   * M3 §2.4 — kalıcı bildirimden push payload'ı türet. Sunucuda i18n YOK (contract'ın kendi
   * tespiti); `preview` yalnız MENTION ve EVENT_CREATED'ta gerçek görüntülenebilir metin taşır
   * (mobil `notifications.tsx`'te de yalnız bu ikisinde preview ayrı satırda gösteriliyor —
   * FRIEND_REQUEST/FRIEND_ACCEPT'te preview hiç yok, GUILD_INVITE'ta preview davet KODU, düz
   * metin değil). O yüzden gövde metni türü başına, mobil ekranla AYNI anlamı taşıyacak şekilde
   * (bkz. web/mobile `notification.*` i18n anahtarları) burada birebir yansıtılır — "preview'ı
   * olduğu gibi bas" literal okuması 3/5 tipte boş/anlamsız gövde üretirdi.
   */
  private toPushPayload(dto: NotificationDto): {
    title?: string;
    body: string;
    data: {
      type: string;
      guildId?: string | null;
      channelId?: string | null;
      messageId?: string | null;
      aiVideoId?: string | null;
    };
    androidChannelId: string;
    priority: 'high';
    tag?: string;
  } {
    const actor = dto.actor?.username ?? 'Biri';
    let body: string;
    switch (dto.type) {
      case 'MENTION':
        body = dto.preview ? `${actor}: ${dto.preview}` : `${actor} seni bir mesajda etiketledi.`;
        break;
      case 'FRIEND_REQUEST':
        body = `${actor} sana kanka isteği gönderdi.`;
        break;
      case 'FRIEND_ACCEPT':
        body = `${actor} kanka isteğini kabul etti.`;
        break;
      case 'MESSAGE_REQUEST':
        // C75 K2: içerik/E2EE önizleme yok; yabancı içeriği kabulden önce bildirim yüzeyine basılmaz.
        body = `${actor} sana mesaj isteği gönderdi.`;
        break;
      case 'GUILD_INVITE':
        body = `${actor} seni ${dto.guildName ?? 'bir ortama'} davet etti.`;
        break;
      case 'EVENT_CREATED':
        body = dto.preview
          ? `${actor} yeni bir etkinlik oluşturdu: ${dto.preview}`
          : `${actor} yeni bir etkinlik oluşturdu.`;
        break;
      case 'REACTION': {
        // C46: preview = emoji + " " + mesaj önizlemesi. `tag` VERİLMEZ (tepkiler birbirinin yerine geçmez).
        const { emoji, text } = splitReactionPreview(dto.preview);
        body = buildReactionPushBody(actor, emoji, text);
        break;
      }
      case 'AI_VIDEO_READY':
        body = dto.preview ? `Videon hazır: ${dto.preview}` : 'Videon hazır.';
        break;
      case 'AI_VIDEO_FAILED':
        body = dto.preview
          ? `Videon üretilemedi, kredin düşülmedi: ${dto.preview}`
          : 'Videon üretilemedi, kredin düşülmedi.';
        break;
      case 'E2EE_TRANSFER':
        // E5b §4.5: güvenlik bildirimi, içerik yok. preview = yeni cihazın adı (ör. "Chrome, Windows").
        body = dto.preview
          ? `Şifreli mesaj geçmişin yeni bir cihaza aktarıldı: ${dto.preview}. Bu sen değilsen hemen şifreni değiştir.`
          : 'Şifreli mesaj geçmişin yeni bir cihaza aktarıldı. Bu sen değilsen hemen şifreni değiştir.';
        break;
      default:
        body = actor;
    }
    const isAiVideo = dto.type === 'AI_VIDEO_READY' || dto.type === 'AI_VIDEO_FAILED';

    return {
      // C49: aktörü olmayan yapay zeka video bildiriminde 'Biri' yazılmaz.
      title: isAiVideo ? 'Yapay zeka video' : dto.type === 'E2EE_TRANSFER' ? 'Güvenlik' : actor,
      body,
      data: {
        type: dto.type,
        guildId: dto.guildId,
        channelId: dto.channelId,
        messageId: dto.messageId,
        ...(isAiVideo && { aiVideoId: dto.aiVideoId }),
      },
      // 🔴 Sahip cihaz turu 2026-08-10 — kanal adı verilmezse FCM kendi yedek kanalını
      // (önem DEFAULT) kullanıyor, bildirim ekranda BELİRMİYOR. `sendDmPush` ile aynı kanal.
      // 🔴 v1 → v2 (sahip bulgusu 2026-09-01): kanal mobilde titreşim açılmadan kuruluydu; kanal
      // ayarı sonradan değiştirilemediği için kimlik artırıldı (gerekçe `sendDmPush` yorumunda).
      // 🔴 v4 → v5 (2026-09-05): titreşim deseni uzatıldı; sunucu ile uygulama birlikte çıkar.
      // 🔴 v5 → v6 (Sprint M5f, 2026-09-19): kanal ilk kez kendi sesini taşıyor; ses de
      // sonradan değiştirilemeyen bir kanal ayarı (gerekçe `sendDmPush` yorumunda).
      androidChannelId: 'messages_v6',
      priority: 'high' as const,
      // 🔴 Yığılma önleme (canlı geri bildirim 2026-08-11) — YALNIZ bahsetmede ve yalnız kanal
      // biliniyorsa. `tag` cihazda görünen bildirimin YERİNE geçtiği için, kanal başına sabit
      // olması aynı sohbetin bildirimlerini tek satıra indirir.
      // 🔴 Diğer türlere (kanka isteği, davet, etkinlik) tag VERİLMEZ: onlar birbirinin yerine
      // geçmemeli — iki ayrı kanka isteği tek satıra düşerse ikincisi kullanıcıdan gizlenmiş olur.
      // C49: AI video'da tag = aiVideoId; kurtarılan READY aynı üretimin FAILED bildirimini değiştirir.
      tag: isAiVideo
        ? (dto.aiVideoId ?? undefined)
        : dto.type === 'MENTION' && dto.channelId
          ? dto.channelId
          : undefined,
    };
  }
}
