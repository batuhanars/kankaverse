import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { HttpException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MembershipService } from '../../../shared/membership/membership.service';
import { RealtimeService } from '../../../shared/realtime/realtime.service';
import { PresenceService, ActiveStatus } from '../../../shared/presence/presence.service';
import { DmPermissionService } from '../../../shared/dm-permission/dm-permission.service';
import { NotificationsService } from '../../notifications/notifications.service';

interface AuthSocket extends Socket {
  data: { userId: string; sessionId: string; username?: string };
}

// CORS origin, main.ts'teki RedisIoAdapter üzerinden config'ten okunur (FRONTEND_URL).
// Dekoratörde sabit origin yazılmaz — adapter seviyesinde dinamik olarak ayarlanır.
@WebSocketGateway()
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
    private membership: MembershipService,
    private realtime: RealtimeService,
    private presence: PresenceService,
    private dmPermission: DmPermissionService,
    private notifications: NotificationsService,
  ) {}

  afterInit(server: Server) {
    this.realtime.setServer(server);
  }

  async handleConnection(socket: AuthSocket) {
    try {
      const token = socket.handshake.auth?.token as string;
      if (!token) throw new Error('Token eksik');

      const payload = this.jwtService.verify<{ sub: string; sessionId: string }>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });

      const session = await this.prisma.session.findFirst({
        where: { id: payload.sessionId, revokedAt: null },
      });
      if (!session) throw new Error('Oturum geçersiz');

      socket.data.userId = payload.sub;
      socket.data.sessionId = payload.sessionId;

      // username'i handshake'te önbelleğe al; typing broadcast'te tekrar sorguya gerek kalmaz
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { username: true },
      });
      socket.data.username = user?.username ?? payload.sub;

      socket.join(`user:${payload.sub}`);

      // Presence bağlantısı: count++ ve mevcut durumu al
      const userId = payload.sub;
      const currentStatus = this.presence.connect(userId);

      // İzinli kitleye presence:update yay (ilk bağlantıda online; sonraki sekmelerde mevcut durum)
      const audience = await this.presence.audienceFor(userId);
      for (const recipientId of audience) {
        this.realtime.emitToUser(recipientId, 'presence:update', { userId, status: currentStatus });
      }

      // Bağlanan kullanıcıya snapshot: görebileceği + şu an online olanların durumları
      // visibleOnlineFor(userId) doğru yönü kullanır: canSeePresence(userId, aday)
      const states = await this.presence.visibleOnlineFor(userId);
      socket.emit('presence:snapshot', { states });

      // §3 — Bildirim snapshot'ı: son okunmamışlar (take 50) + unreadCount
      const notificationSnapshot = await this.notifications.snapshot(userId);
      socket.emit('notification:snapshot', notificationSnapshot);
    } catch {
      socket.emit('auth_error', { error: 'UNAUTHORIZED' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: AuthSocket) {
    const userId = socket.data?.userId;
    if (!userId) return; // auth olmamış socket — hiçbir şey yapma

    const nowOffline = this.presence.disconnect(userId);
    if (nowOffline) {
      const audience = await this.presence.audienceFor(userId);
      for (const recipientId of audience) {
        this.realtime.emitToUser(recipientId, 'presence:update', {
          userId,
          status: 'offline',
        });
      }
    }
  }

  @SubscribeMessage('channel:join')
  async handleChannelJoin(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    // Yetki kontrolü tek kaynak (MembershipService); HTTP exception → WS ack'e çevrilir
    try {
      await this.membership.requireChannelAccess(userId, channelId);
    } catch (e) {
      const res = e instanceof HttpException ? (e.getResponse() as { error?: string }) : null;
      return { ok: false, error: res?.error ?? 'FORBIDDEN' };
    }

    socket.join(`room:${channelId}`);
    return { ok: true };
  }

  @SubscribeMessage('channel:leave')
  handleChannelLeave(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    socket.leave(`room:${payload.channelId}`);
  }

  /**
   * Ses presence aboneliği — sidebar'da bir ses kanalının "kim var" listesini canlı
   * izlemek için (kanala bağlı olmasa da). voice:<channelId> room'u; room:<channelId>
   * (aktif kanal) ile ÇAKIŞMAZ. Görünürlük kapısı: özel kanal dahil tüm guild üyeleri
   * (item 6 — görünür ama girişi kapalı), yaş kapısı korunur.
   */
  @SubscribeMessage('voice:subscribe')
  async handleVoiceSubscribe(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;
    try {
      await this.membership.requireChannelVisible(userId, channelId);
    } catch (e) {
      const res = e instanceof HttpException ? (e.getResponse() as { error?: string }) : null;
      return { ok: false, error: res?.error ?? 'FORBIDDEN' };
    }
    socket.join(`voice:${channelId}`);
    return { ok: true };
  }

  /**
   * Ekran paylaşımı yayın durumu — sidebar "YAYINDA" rozeti için.
   * Payload: { channelId, active: boolean }
   * active=true  → voice.broadcast_started  { channelId, userId }
   * active=false → voice.broadcast_stopped  { channelId, userId }
   * Her iki event hem room:<channelId> hem voice:<channelId> odasına gider.
   * Light doğrulama: gönderen socket auth'tan userId alınır (spoofing yalnız kozmetik).
   */
  @SubscribeMessage('voice:broadcast')
  async handleVoiceBroadcast(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string; active: boolean },
  ) {
    const userId = socket.data.userId;
    if (!userId || !payload?.channelId) return { ok: false };
    const event = payload.active ? 'voice.broadcast_started' : 'voice.broadcast_stopped';
    const data = { channelId: payload.channelId, userId };
    this.realtime.emitToRoom(payload.channelId, event, data);
    this.realtime.emitToVoicePresence(payload.channelId, event, data);
    return { ok: true };
  }

  @SubscribeMessage('voice:unsubscribe')
  handleVoiceUnsubscribe(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    socket.leave(`voice:${payload.channelId}`);
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    let channel: Awaited<ReturnType<typeof this.membership.requireChannelAccess>>;
    try {
      channel = await this.membership.requireChannelAccess(userId, channelId);
    } catch {
      // Sessiz drop: erişim yoksa veya yaş kısıtlıysa yaymadan ack ile dön
      return { ok: false };
    }

    const username = socket.data.username ?? userId;

    if (channel.guildId === null) {
      // DM kanalı: alıcıların user:<id> odasına yay (room'a bakmayanlar da alsın)
      const others = await this.prisma.channelMember.findMany({
        where: { channelId, userId: { not: userId } },
        select: { userId: true },
      });
      for (const other of others) {
        this.realtime.emitToUser(other.userId, 'typing:update', { userId, username, channelId });
      }
    } else {
      // Guild kanalı: mevcut room yayını
      socket.to(`room:${channelId}`).emit('typing:update', { userId, username, channelId });
    }

    return { ok: true };
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    let channel: Awaited<ReturnType<typeof this.membership.requireChannelAccess>>;
    try {
      channel = await this.membership.requireChannelAccess(userId, channelId);
    } catch {
      // Sessiz drop
      return { ok: false };
    }

    const username = socket.data.username ?? userId;

    if (channel.guildId === null) {
      // DM kanalı: alıcıların user:<id> odasına yay
      const others = await this.prisma.channelMember.findMany({
        where: { channelId, userId: { not: userId } },
        select: { userId: true },
      });
      for (const other of others) {
        this.realtime.emitToUser(other.userId, 'typing:clear', { userId, username, channelId });
      }
    } else {
      // Guild kanalı: mevcut room yayını
      socket.to(`room:${channelId}`).emit('typing:clear', { userId, username, channelId });
    }

    return { ok: true };
  }

  @SubscribeMessage('presence:set')
  async handlePresenceSet(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { status: ActiveStatus },
  ) {
    const userId = socket.data?.userId;
    if (!userId) return { ok: false };

    const VALID_STATUSES: ActiveStatus[] = ['online', 'away', 'dnd'];
    if (!payload?.status || !VALID_STATUSES.includes(payload.status)) {
      return { ok: false };
    }

    const applied = this.presence.setStatus(userId, payload.status);
    if (applied === 'offline') {
      // Bağlı değil — ack ile dön (güncelleme olmadı)
      return { ok: false };
    }

    // İzinli kitleye yay
    const audience = await this.presence.audienceFor(userId);
    for (const recipientId of audience) {
      this.realtime.emitToUser(recipientId, 'presence:update', {
        userId,
        status: applied,
      });
    }

    return { ok: true };
  }

  // ── Sprint V2 — DM sesli arama sinyalizasyonu (gate SUNUCUDA; sözleşme SPRINT_V2_DM_CALL_CONTRACT.md) ──
  // R7: davet gate'i ring YAYILMADAN ÖNCE; jenerik DM_NOT_ALLOWED (engellenme/ilişki sızmaz).

  // R7 (DM-1): çağıran kanalın üyesi DEĞİLSE null → sahte accept/reject/cancel relay'i engellenir.
  // Tek sorgu hem üyelik doğrular hem karşı tarafı bulur (DRY; dört handler de kapı kazanır).
  private async otherDmMember(channelId: string, userId: string): Promise<string | null> {
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });
    if (!members.some((m) => m.userId === userId)) return null; // çağıran üye değil
    const other = members.find((m) => m.userId !== userId);
    return other?.userId ?? null;
  }

  @SubscribeMessage('voice:call_invite')
  async handleCallInvite(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { type: true } });
    if (!channel || channel.type !== 'DM') return { ok: false, error: 'NOT_DM' };

    const calleeId = await this.otherDmMember(channelId, userId);
    if (!calleeId) return { ok: false, error: 'DM_NOT_ALLOWED' };

    // DAVET GATE'İ — ring callee'ye ULAŞMADAN ÖNCE (yabancı/block/yeni-hesap/minör-yabancı elenir)
    const gate = await this.dmPermission.canDm(userId, calleeId);
    if (!gate.allowed) return { ok: false, error: 'DM_NOT_ALLOWED' };

    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, avatarUrl: true },
    });
    this.realtime.emitToUser(calleeId, 'voice.incoming_call', {
      channelId,
      caller: { id: userId, username: caller?.username ?? userId, avatarUrl: caller?.avatarUrl ?? null },
    });
    return { ok: true };
  }

  @SubscribeMessage('voice:call_accept')
  async handleCallAccept(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const other = await this.otherDmMember(payload.channelId, socket.data.userId);
    if (other) this.realtime.emitToUser(other, 'voice.call_accepted', { channelId: payload.channelId });
    return { ok: true };
  }

  @SubscribeMessage('voice:call_reject')
  async handleCallReject(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const other = await this.otherDmMember(payload.channelId, socket.data.userId);
    if (other) this.realtime.emitToUser(other, 'voice.call_rejected', { channelId: payload.channelId });
    return { ok: true };
  }

  @SubscribeMessage('voice:call_cancel')
  async handleCallCancel(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const other = await this.otherDmMember(payload.channelId, socket.data.userId);
    if (other) this.realtime.emitToUser(other, 'voice.call_canceled', { channelId: payload.channelId });
    return { ok: true };
  }

  @SubscribeMessage('voice:group_call_start')
  async handleGroupCallStart(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { type: true } });
    if (!channel || channel.type !== 'GROUP_DM') return { ok: false, error: 'NOT_GROUP' };

    try {
      await this.membership.requireChannelAccess(userId, channelId);
      await this.membership.requireNoDmBlock(userId, channelId);
    } catch {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const username = socket.data.username ?? userId;
    const members = await this.prisma.channelMember.findMany({
      where: { channelId, userId: { not: userId } },
      select: { userId: true },
    });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, 'voice.group_call_started', {
        channelId,
        by: { id: userId, username },
      });
    }
    return { ok: true };
  }

  broadcastMessage(channelId: string, messageDto: unknown) {
    this.server.to(`room:${channelId}`).emit('message.created', messageDto);
  }

  broadcastMessageUpdate(channelId: string, messageDto: unknown) {
    this.server.to(`room:${channelId}`).emit('message.updated', messageDto);
  }

  broadcastMessageDelete(channelId: string, payload: { messageId: string; channelId: string }) {
    this.server.to(`room:${channelId}`).emit('message.deleted', payload);
  }

  broadcastReaction(
    channelId: string,
    event: 'reaction.added' | 'reaction.removed',
    payload: { messageId: string; channelId: string; emoji: string; userId: string },
  ) {
    this.server.to(`room:${channelId}`).emit(event, payload);
  }

  broadcastPin(
    channelId: string,
    event: 'message.pinned' | 'message.unpinned',
    payload: { messageId: string; channelId: string; pinnedAt?: string },
  ) {
    this.server.to(`room:${channelId}`).emit(event, payload);
  }

  /**
   * DM kanalında mesaj gönderildiğinde üyelerin user:<id> odalarına bildirim yayar.
   * Alıcı o anda DM odasına join etmemiş olsa bile DM listesi (son mesaj + okunmamış) güncellenir.
   * Guild kanalıysa (guildId dolu) hiçbir şey yapmaz — guild kanallarda room:* yayını yeterli.
   */
  async notifyDmActivity(channelId: string, messageDto: Record<string, unknown>) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true },
    });

    // Guild kanalı → çık
    if (!channel || channel.guildId !== null) return;

    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });

    const content =
      typeof messageDto['content'] === 'string' && messageDto['content'].trim().length > 0
        ? (messageDto['content'] as string)
        : '[dosya]';

    const payload = {
      channelId,
      lastMessage: {
        content,
        createdAt: messageDto['createdAt'] as string,
      },
      senderId: (messageDto['author'] as Record<string, string>)['id'],
    };

    for (const member of members) {
      this.realtime.emitToUser(member.userId, 'dm.message', payload);
    }
  }

  /**
   * Guild kanalında mesaj gönderildiğinde tüm guild üyelerinin user:<id> odalarına
   * `channel.activity` eventi yayar (yazar hariç). Frontend rail'de ve kanal listesinde
   * okunmamış rozeti güncellemek için bu eventi dinler.
   * DM kanalıysa (guildId null) hiçbir şey yapmaz — notifyDmActivity zaten var.
   *
   * T&S — masaüstü bildirimi için yazar adı + içerik önizlemesi EKLENİR; ama yalnız kanalı
   * GÖREBİLEN üyelere (özel kanalda üyeler + owner/admin; yaş-kapılı kanalda minörler hariç).
   * Okuyamayan üyeler eski "çıplak" payload'ı alır (yalnız ID'ler) → okunmamış rozeti çalışır,
   * içerik sızmaz. Süzme mantığı `notifyMentions`'taki @everyone kapısıyla aynı.
   */
  async notifyChannelActivity(channelId: string, messageDto: Record<string, unknown>) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: {
        guildId: true,
        isPrivate: true,
        ageGated: true,
        guild: { select: { adultsOnly: true } },
      },
    });

    // DM kanalı → çık
    if (!channel || channel.guildId === null) return;

    const guildId = channel.guildId;
    const author = messageDto['author'] as { id: string; username: string };
    const authorId = author.id;
    const needsAgeCheck = channel.ageGated || (channel.guild?.adultsOnly ?? false);

    const guildMembers = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true, user: { select: { isMinor: true } } },
    });

    // İçerik önizlemesini görmeye yetkili üye kümesi (okuma erişimi + yaş kapısı).
    let eligible: Set<string>;
    if (channel.isPrivate) {
      const [cms, privileged] = await Promise.all([
        this.prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } }),
        this.prisma.guildMember.findMany({
          where: { guildId, role: { in: ['OWNER', 'ADMIN'] } },
          select: { userId: true },
        }),
      ]);
      let ids = [...cms.map((m) => m.userId), ...privileged.map((m) => m.userId)];
      if (needsAgeCheck) {
        const minors = new Set(guildMembers.filter((m) => m.user.isMinor).map((m) => m.userId));
        ids = ids.filter((id) => !minors.has(id));
      }
      eligible = new Set(ids);
    } else {
      const readers = needsAgeCheck ? guildMembers.filter((m) => !m.user.isMinor) : guildMembers;
      eligible = new Set(readers.map((m) => m.userId));
    }

    // Önizleme: mention token'larını temizle (<@&..>→@everyone, <@..>→@birisi), ≤100 karakter.
    // Boş içerik (yalnız ek) → [dosya].
    const rawContent = typeof messageDto['content'] === 'string' ? (messageDto['content'] as string) : '';
    const preview = (rawContent.trim().length > 0 ? rawContent : '[dosya]')
      .replace(/<@&[a-zA-Z0-9_-]+>/g, '@everyone')
      .replace(/<@[a-zA-Z0-9_-]+>/g, '@birisi')
      .slice(0, 100);

    const basePayload = { channelId, guildId, authorId };
    const richPayload = { ...basePayload, author: { id: author.id, username: author.username }, preview };

    for (const member of guildMembers) {
      // Yazarın kendisine gönderme
      if (member.userId === authorId) continue;
      // Okuyabilen → yazar adı + önizleme; okuyamayan → çıplak (yalnız rozet).
      this.realtime.emitToUser(
        member.userId,
        'channel.activity',
        eligible.has(member.userId) ? richPayload : basePayload,
      );
    }
  }

  /**
   * §5 — Bahsedilen kullanıcılara `mention` WS eventi gönder.
   *
   * messageDto.mentions (string[]) boşsa erken çık.
   * Her bahsedilen kullanıcıya (yazar hariç) user:<id> odasına §5 payload yayılır.
   * preview: content içindeki <@id> token'ları @username'e çözülür; ≤100 karakter.
   * Çözülemeyen token → @bilinmeyen.
   */
  async notifyMentions(channelId: string, messageDto: Record<string, unknown>) {
    const mentions = (messageDto['mentions'] as string[] | undefined) ?? [];
    const mentionsEveryone = (messageDto['mentionsEveryone'] as boolean | undefined) ?? false;
    if (mentions.length === 0 && !mentionsEveryone) return;

    const authorId = (messageDto['author'] as Record<string, string>)['id'];

    // Kanal: guildId + özel mi + yaş kapısı (DM ise guildId null)
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true, isPrivate: true, ageGated: true, guild: { select: { adultsOnly: true } } },
    });
    const guildId = channel?.guildId ?? null;
    const needsAgeCheck = !!channel && (channel.ageGated || (channel.guild?.adultsOnly ?? false));

    // Bahsedilen kullanıcıların username'lerini tek sorguda çek (preview + payload için)
    const users = await this.prisma.user.findMany({
      where: { id: { in: mentions } },
      select: { id: true, username: true },
    });
    const usernameById = new Map<string, string>(users.map((u) => [u.id, u.username]));

    // preview: rol token'ları (<@&...>) → @everyone; kullanıcı token'ları → @username; ≤100 karakter
    const content = (messageDto['content'] as string) ?? '';
    const preview = content
      .replace(/<@&[a-zA-Z0-9_-]+>/g, '@everyone')
      .replace(/<@([a-zA-Z0-9_-]+)>/g, (_match, id: string) => {
        const username = usernameById.get(id);
        return username ? `@${username}` : '@bilinmeyen';
      })
      .slice(0, 100);

    const author = messageDto['author'] as { id: string; username: string; avatarUrl: string | null };

    const eventPayload = {
      messageId: messageDto['id'] as string,
      channelId,
      guildId,
      author: { id: author.id, username: author.username, avatarUrl: author.avatarUrl ?? null },
      preview,
    };

    // Alıcı kümesi: doğrudan bahsedilenler + (everyone ise) kanalı GÖREBİLEN üyeler.
    // T&S: (a) özel kanalda everyone yalnız kanal üyeleri + owner/admin'e gider (genel guild'e DEĞİL —
    // sızıntı yok); (b) yaş-kapılı kanalda minörler hariç (özel kanal üyeleri ekleme anında zaten gated).
    let recipients: string[];
    if (mentionsEveryone && guildId) {
      let everyoneIds: string[];
      if (channel?.isPrivate) {
        const [cms, privileged] = await Promise.all([
          this.prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } }),
          this.prisma.guildMember.findMany({
            where: { guildId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { userId: true },
          }),
        ]);
        everyoneIds = [...cms.map((m) => m.userId), ...privileged.map((m) => m.userId)];
      } else {
        const members = await this.prisma.guildMember.findMany({
          where: { guildId },
          select: { userId: true, user: { select: { isMinor: true } } },
        });
        const eligible = needsAgeCheck ? members.filter((m) => !m.user.isMinor) : members;
        everyoneIds = eligible.map((m) => m.userId);
      }
      recipients = [...new Set([...mentions, ...everyoneIds])];
    } else {
      recipients = [...new Set(mentions)];
    }

    for (const mentionedUserId of recipients) {
      // Yazara kendi bahsetmesi için event gönderme
      if (mentionedUserId === authorId) continue;
      this.realtime.emitToUser(mentionedUserId, 'mention', eventPayload);

      // R12 — Suppression: alıcının kanal/guild bildirim tercihi sustur/NONE ise
      // kalıcı bildirim üretilmez (ne persist ne emit). `mention` WS eventi anlık
      // — tercih sustur/seviye kalıcı bildirimi süzer.
      const shouldNotify = await this.notifications.shouldNotifyChannel(
        mentionedUserId,
        guildId,
        channelId,
      );
      if (!shouldNotify) continue;

      // §2 — MENTION kalıcı bildirimi (mevcut `mention` emit'ine PARALEL).
      // Kaynak resolveMentions çıktısı (zaten minör/yaş/erişim süzülü) — yeni erişim sorgusu YOK.
      await this.notifications.create(mentionedUserId, {
        type: 'MENTION',
        actorId: author.id,
        guildId: guildId ?? undefined,
        channelId,
        messageId: messageDto['id'] as string,
        preview,
      });
    }
  }

}
