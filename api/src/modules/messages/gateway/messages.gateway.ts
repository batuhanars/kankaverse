import { previewFromAttachments } from '../../../common/utils/attachment-preview.util';
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
import { NotifTargetType } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MembershipService } from '../../../shared/membership/membership.service';
import { PermissionsService } from '../../../shared/permissions/permissions.service';
import { RealtimeService } from '../../../shared/realtime/realtime.service';
import { PresenceService, ActiveStatus } from '../../../shared/presence/presence.service';
import { DmPermissionService } from '../../../shared/dm-permission/dm-permission.service';
import { NotificationsService, isMuteActive } from '../../notifications/notifications.service';
import { PushService } from '../../../shared/push/push.service';
import { VoiceService } from '../../voice/voice.service';
import { GamesService } from '../../../shared/games/games.service';

interface AuthSocket extends Socket {
  data: { userId: string; sessionId: string; username?: string };
}

// CORS origin, main.ts'teki RedisIoAdapter üzerinden config'ten okunur (FRONTEND_URL).
// Dekoratörde sabit origin yazılmaz — adapter seviyesinde dinamik olarak ayarlanır.
@WebSocketGateway()
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  // M5a §4.3 — `voice:group_call_ring` bellek-içi hız sınırı. Anahtar `callerId:targetId`;
  // her çağrıda pencereyi (60 sn) aşmış kayıtlar süpürülür ki harita sınırsız büyümesin
  // (tek instance yeterli — yeni altyapı/paket KURULMADI, sözleşme §4.3).
  private readonly GROUP_CALL_RING_WINDOW_MS = 60_000;
  private readonly groupCallRingTimestamps = new Map<string, number>();

  // C31b §2.4 — `activity:set` hız sınırı: BAĞLANTI başına dakikada 10 (yanıp sönen süreç spamı).
  // Anahtar socket.id, değer son pencere içindeki zaman damgaları; bağlantı kopunca silinir.
  private readonly ACTIVITY_SET_WINDOW_MS = 60_000;
  private readonly ACTIVITY_SET_MAX = 10;
  private readonly activitySetTimestamps = new Map<string, number[]>();

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
    private membership: MembershipService,
    private permissions: PermissionsService,
    private realtime: RealtimeService,
    private presence: PresenceService,
    private dmPermission: DmPermissionService,
    private notifications: NotificationsService,
    private push: PushService,
    private voice: VoiceService,
    private games: GamesService,
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

      // Presence bağlantısı: bu bağlantı kaydedilir ve hesabın ETKİN durumu alınır.
      // `socket.id` bağlantı kimliği: durum artık bağlantı başına tutuluyor (bkz. PresenceService
      // başındaki kusur notu) — hesabın durumu "en aktif pencere" kuralıyla hesaplanıyor.
      const userId = payload.sub;
      const currentStatus = this.presence.connect(userId, socket.id);

      // İzinli kitleye presence:update yay (ilk bağlantıda online; sonraki sekmelerde etkin durum).
      // 🔴 Kullanıcının KENDİSİNE de yollanır: bugüne kadar kendi durumu hiç gelmiyordu ve her
      // istemci onu kendi belleğinden tahmin ediyordu — tepsideki pencere "boşta" yazarken öndeki
      // pencere kendini "çevrimiçi" gösteriyordu (sahip bulgusu 2026-08-12). Artık hesabın bütün
      // pencereleri aynı gerçeği görür. Görünürlük kuralı ihlal edilmiyor: kullanıcı kendi
      // durumunu zaten görebiliyor (`canSeePresence` kural 1).
      const audience = await this.presence.audienceFor(userId);
      for (const recipientId of [...audience, userId]) {
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

    this.activitySetTimestamps.delete(socket.id);
    // C31b: kapanan bağlantının oyunu hesabın etkin oyunuydu mu? Silinmeden ÖNCE bakılır.
    const gameBefore = this.presence.activeGameId(userId);
    const nowOffline = this.presence.disconnect(userId, socket.id);
    // 🔴 Kapanan pencere son pencere olmayabilir ama hesabın ETKİN durumunu yine de değiştirebilir:
    // aktif pencere kapanıp geriye yalnız boştaki bir pencere kaldıysa hesap artık boştadır.
    // Eskiden yalnız "tamamen çevrimdışı" hâli yayınlanıyordu (durum hesap başına tekti, böyle bir
    // ara hâl yoktu); bağlantı başına modelde bu yayın olmazsa kitle bayat kalırdı.
    const status = nowOffline ? ('offline' as const) : this.presence.getStatus(userId);
    const audience = await this.presence.audienceFor(userId);
    for (const recipientId of [...audience, userId]) {
      this.realtime.emitToUser(recipientId, 'presence:update', { userId, status });
    }
    // Bağlantı koptu: etkin oyun değiştiyse (başka pencerenin oyunu ya da hiç) kitleye bildir.
    if (gameBefore !== this.presence.activeGameId(userId)) {
      await this.presence.broadcastActivity(userId);
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
  handleVoiceBroadcast(
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

  /**
   * `auto: true` — hareketsizlik otomasyonunun bildirimi (web `useIdlePresence`): YALNIZ bu
   * bağlantıyı ilgilendirir, hesabın manuel seçimini değiştirmez. Alan yoksa seçim manueldir
   * (kullanıcı kutucuktan seçti) ve hesap kapsamlıdır — eski istemciler bu alanı hiç göndermiyor,
   * onlarda davranış değişmiyor.
   */
  @SubscribeMessage('presence:set')
  async handlePresenceSet(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { status: ActiveStatus; auto?: boolean },
  ) {
    const userId = socket.data?.userId;
    if (!userId) return { ok: false };

    const VALID_STATUSES: ActiveStatus[] = ['online', 'away', 'dnd'];
    if (!payload?.status || !VALID_STATUSES.includes(payload.status)) {
      return { ok: false };
    }

    const gameBefore = this.presence.activeGameId(userId);
    const applied = this.presence.setStatus(userId, payload.status, {
      connectionId: socket.id,
      auto: payload.auto === true,
    });
    if (applied === 'offline') {
      // Bağlı değil — ack ile dön (güncelleme olmadı)
      return { ok: false };
    }

    // İzinli kitleye + kullanıcının kendi pencerelerine yay (bkz. handleConnection notu).
    const audience = await this.presence.audienceFor(userId);
    for (const recipientId of [...audience, userId]) {
      this.realtime.emitToUser(recipientId, 'presence:update', {
        userId,
        status: applied,
      });
    }

    // C31b §2.5: dnd'ye girince oyun gizlenir, dnd'den çıkınca geri gelir.
    if (gameBefore !== this.presence.activeGameId(userId)) {
      await this.presence.broadcastActivity(userId);
    }

    return { ok: true };
  }

  /**
   * C31b §2.4 — masaüstünün algıladığı oyunu bildirir. `{ ref, epicName? }` ya da `{ ref: null }`.
   * Yayılan değer HER ZAMAN tablodaki `Game.id` + `name`'dir; istemcinin söylediği ad hiçbir yerde
   * kullanılmaz (Epic adı yalnız ilk kayıtta, GamesService kapısından geçerek). Ayar sunucuda
   * kontrol edilir: kapalıysa kaydedilmez ve yayılmaz. Görünürlük kararı PresenceService'te.
   */
  @SubscribeMessage('activity:set')
  async handleActivitySet(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { ref?: unknown; epicName?: unknown },
  ) {
    const userId = socket.data?.userId;
    if (!userId) return { ok: false };

    // Hız sınırı: bağlantı başına dakikada ACTIVITY_SET_MAX.
    const now = Date.now();
    const recent = (this.activitySetTimestamps.get(socket.id) ?? []).filter(
      (t) => now - t < this.ACTIVITY_SET_WINDOW_MS,
    );
    if (recent.length >= this.ACTIVITY_SET_MAX) return { ok: false };
    recent.push(now);
    this.activitySetTimestamps.set(socket.id, recent);

    const before = this.presence.activeGameId(userId);

    if (payload?.ref === null) {
      if (!this.presence.setGame(userId, socket.id, null)) return { ok: false };
    } else {
      // Ayar kapalıysa çözümleme de yapılmaz (Steam/Epic için tabloya yeni kayıt açılmasın).
      if (!(await this.presence.gameActivityEnabled(userId))) return { ok: false };
      const game = await this.games.resolve(payload?.ref, {
        userId,
        epicName: payload?.epicName,
      });
      if (!game) return { ok: false };
      if (!this.presence.setGame(userId, socket.id, game.id)) return { ok: false };
    }

    if (before !== this.presence.activeGameId(userId)) {
      await this.presence.broadcastActivity(userId);
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

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { type: true, dmRequestStatus: true },
    });
    if (!channel || channel.type !== 'DM') return { ok: false, error: 'NOT_DM' };
    // C9: bekleyen mesaj isteği kanalında arama yok (kabul edilene dek).
    if (channel.dmRequestStatus === 'PENDING') return { ok: false, error: 'DM_NOT_ALLOWED' };

    const calleeId = await this.otherDmMember(channelId, userId);
    if (!calleeId) return { ok: false, error: 'DM_NOT_ALLOWED' };

    // DAVET GATE'İ — ring callee'ye ULAŞMADAN ÖNCE (yabancı/block/yeni-hesap/minör-yabancı elenir)
    const gate = await this.dmPermission.canDm(userId, calleeId);
    if (!gate.allowed) return { ok: false, error: 'DM_NOT_ALLOWED' };

    // M4a-3 §9.1 madde 3 — callee o DM kanalını ETKİN olarak susturmuşsa ne WS ne push gider.
    // `canDm` kapısından SONRA, emit'ten ÖNCE. 🔴 R7 nötrlük: arayan bunu ANLAMAZ, ack yine
    // {ok:true} döner (normal "Çalıyor…" görür, 3 dk sonra cevapsız kalır) — farklı hata kodu/
    // mesaj/zamanlama YOK, aksi hâlde susturma ifşa olurdu.
    // 🔴 "Susturulmuş" YALNIZ isMuteActive demektir. Ara bir sürümde `level === NONE` de aramayı
    // susturuyordu; sahip kararıyla GERİ ALINDI (2026-08-07, ikinci tur) — `level` bir MESAJ bildirim
    // seviyesi ("Bahsedilince"nin aramada karşılığı yok) ve sonuç tamamen sessiz olduğu için kimse
    // neden arama gelmediğini anlayamıyordu (sahip mobilden aradı, sebep ancak DB'ye bakılarak
    // bulundu). `muted`'da bu endişe yok: niyet açık ("beni rahatsız etme"), arama rahatsızlıktır.
    // Sözleşme §9.1 madde 3.
    const calleePref = await this.prisma.notificationPref.findUnique({
      where: {
        userId_targetType_targetId: {
          userId: calleeId,
          targetType: NotifTargetType.CHANNEL,
          targetId: channelId,
        },
      },
    });
    if (calleePref && isMuteActive(calleePref.muted, calleePref.mutedUntil)) {
      return { ok: true };
    }

    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, avatarUrl: true },
    });
    this.realtime.emitToUser(calleeId, 'voice.incoming_call', {
      channelId,
      caller: {
        id: userId,
        username: caller?.username ?? userId,
        avatarUrl: caller?.avatarUrl ?? null,
      },
    });

    // M4a-3 §9.1 madde 2 — fire-and-forget push (await YOK, ack'i geciktirmez/bozmaz).
    // Kalıcı Notification kaydı ÜRETİLMEZ, NotificationsService kullanılmaz. "Kime gitsin"
    // süzgeci burada İKİNCİ KEZ uygulanmaz — canDm kararı üç satır yukarıda zaten geçildi.
    // title/body: sunucuda tr.json yok (§9.1); `toPushPayload` (notifications.service.ts)
    // deseni izlenir — Türkçe metin doğrudan koda yazılır, mobil `mobile.call.incomingTitle`/
    // `incomingBody` (web/src/i18n/tr.json) ile AYNI metin (M4a-2'de zaten kilit ekranında
    // görünen bilgi, §9.3 — yeni bir ifşa yüzeyi değil).
    const callerName = caller?.username ?? userId;
    this.push
      .sendToUsers([calleeId], {
        title: 'Gelen Arama',
        body: `${callerName} seni arıyor!`,
        data: { type: 'incoming_call', channelId, callerId: userId, callerName },
        priority: 'high',
        // §9.2.1 — mobilin kuracağı sesli-kanal kimliği; kanal ayarları kurulduktan sonra
        // DEĞİŞTİRİLEMEZ, mobil taraf farklı bir kimlik seçerse bu satır o kimlikle güncellenir.
        androidChannelId: 'incoming_call_v4',
        categoryId: 'incoming_call',
        ttlSeconds: 30,
      })
      .catch(() => {});

    return { ok: true };
  }

  @SubscribeMessage('voice:call_accept')
  async handleCallAccept(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const other = await this.otherDmMember(payload.channelId, socket.data.userId);
    if (other)
      this.realtime.emitToUser(other, 'voice.call_accepted', { channelId: payload.channelId });
    return { ok: true };
  }

  @SubscribeMessage('voice:call_reject')
  async handleCallReject(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const other = await this.otherDmMember(payload.channelId, socket.data.userId);
    if (other)
      this.realtime.emitToUser(other, 'voice.call_rejected', { channelId: payload.channelId });
    return { ok: true };
  }

  @SubscribeMessage('voice:call_cancel')
  async handleCallCancel(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const other = await this.otherDmMember(payload.channelId, socket.data.userId);
    if (other)
      this.realtime.emitToUser(other, 'voice.call_canceled', { channelId: payload.channelId });
    return { ok: true };
  }

  @SubscribeMessage('voice:group_call_start')
  async handleGroupCallStart(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { type: true },
    });
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

  /**
   * 🔴 M4z sözleşme §F — grup çağrısı İPTALİ (sahip bulgusu 2026-08-08: arayan kapatınca karşı
   * taraflarda zil, titreşim ve bildirim 30 sn'lik zaman aşımına kadar sürüyordu; ortada olmayan
   * bir çağrı çalıyordu). M4b grup çağrısını açmış ama iptal ayağını açmamıştı.
   *
   * `handleGroupCallStart`in BİREBİR aynısı; tek fark yayılan olayın adı (`voice.group_call_canceled`)
   * ve payload'ın `by` taşımaması — zili susturmak için kimin iptal ettiği gerekmiyor, `channelId`
   * yeter (alıcı tarafta `dismissIncomingCall`/`clearIncoming` yalnız kanala bakıyor).
   *
   * 🔴 R7: YENİ KAPI KURULMUYOR. Kanal tipi + `requireChannelAccess` + `requireNoDmBlock` üçlüsü
   * `group_call_start` ile AYNI; kopya bir üyelik/engel süzgeci yazılmadı. Yani "çaldırabilen"
   * ile "susturabilen" tam olarak aynı kapıdan geçiyor.
   *
   * 1-1'in `voice:call_cancel`i burada KULLANILAMAZ: o `otherDmMember` ile tek bir "karşı taraf"
   * buluyor, grup kanalında rastgele bir üyeye giderdi (M4b'de grup dalının boş kalma sebebi buydu).
   */
  @SubscribeMessage('voice:group_call_cancel')
  async handleGroupCallCancel(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { type: true },
    });
    if (!channel || channel.type !== 'GROUP_DM') return { ok: false, error: 'NOT_GROUP' };

    try {
      await this.membership.requireChannelAccess(userId, channelId);
      await this.membership.requireNoDmBlock(userId, channelId);
    } catch {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const members = await this.prisma.channelMember.findMany({
      where: { channelId, userId: { not: userId } },
      select: { userId: true },
    });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, 'voice.group_call_canceled', { channelId });
    }
    return { ok: true };
  }

  /**
   * Sprint M5a §4 — Grup DM içinde SESTE OLMAYAN tek bir üyeyi çaldırma (kişi başı zil).
   * `handleGroupCallStart`in kardeşi: aynı `NOT_GROUP` + `requireChannelAccess` + üyelik
   * ikilisinden geçer — kopya kapı yazılmadı. Yayılan olay BİLEREK `voice.group_call_started`
   * (YENİ AD DEĞİL, §4.1): hedefteki gelen-arama akışı zaten bu olayı dinliyor; yeni bir olay adı
   * hedef tarafta ikinci bir akış + iptal ayağını yeniden yazmayı gerektirirdi.
   *
   * 🔴 §4.2 — `requireNoDmBlock` burada BİLEREK KULLANILMAZ: o metot (`MembershipService`)
   * grup kanalında `findFirst` ile RASTGELE bir üyeyi bulup blok kontrolü yapıyor — 3+ kişilik
   * grupta yanlış çift. Burada blok doğrudan ÇAĞIRAN↔HEDEF çifti için, iki yönlü sorgulanır.
   * Blok varsa jenerik `FORBIDDEN` — sebep söylenmez (G3: engellenme bilgisi sızmaz).
   *
   * 🔴 §4.3 — hız sınırı: aynı çağıran→hedef çifti 60 sn'de 1. Bellekte tutulur (yukarıdaki
   * `groupCallRingTimestamps`), yeni altyapı kurulmadı.
   *
   * §4.4 — hedef zaten o ses odasındaysa (`VoiceService.getLiveParticipation`, LiveKit tarafı
   * — tek doğruluk kaynağı, kopya presence sorgusu yazılmadı) ack yine `{ok:true}` ama olay
   * YAYILMAZ (boşa zil yok). LiveKit'e erişilemezse (`null` döner) fail-open: bu yalnız bir
   * ikinci savunma katmanı (istemci zaten odadakine "Çaldır" butonu çizmiyor), doğrulanamadığında
   * zili engellemek yanlış taraf.
   */
  @SubscribeMessage('voice:group_call_ring')
  async handleGroupCallRing(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string; targetUserId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId, targetUserId } = payload;

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { type: true },
    });
    if (!channel || channel.type !== 'GROUP_DM') return { ok: false, error: 'NOT_GROUP' };

    try {
      await this.membership.requireChannelAccess(userId, channelId);
    } catch {
      return { ok: false, error: 'FORBIDDEN' };
    }

    // Hedef, kanalın üyesi mi (requireChannelAccess yalnız ÇAĞIRANI doğrular).
    const targetMembership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });
    if (!targetMembership) return { ok: false, error: 'FORBIDDEN' };

    // §4.2 — çağıran↔hedef çifti, iki yönlü, doğrudan.
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: userId },
        ],
      },
    });
    if (block) return { ok: false, error: 'FORBIDDEN' };

    if (this.isGroupCallRingRateLimited(userId, targetUserId)) {
      return { ok: false, error: 'RATE_LIMITED' };
    }

    // §4.4 — hedef zaten odadaysa boşa zil çalma.
    const live = await this.voice.getLiveParticipation(channelId, targetUserId);
    if (live?.present) return { ok: true };

    const username = socket.data.username ?? userId;
    this.realtime.emitToUser(targetUserId, 'voice.group_call_started', {
      channelId,
      by: { id: userId, username },
    });
    return { ok: true };
  }

  /** §4.3 yardımcı — bkz. `groupCallRingTimestamps` alan yorumu. */
  private isGroupCallRingRateLimited(callerId: string, targetId: string): boolean {
    const now = Date.now();
    for (const [key, ts] of this.groupCallRingTimestamps) {
      if (now - ts > this.GROUP_CALL_RING_WINDOW_MS) this.groupCallRingTimestamps.delete(key);
    }

    const key = `${callerId}:${targetId}`;
    const last = this.groupCallRingTimestamps.get(key);
    if (last !== undefined && now - last < this.GROUP_CALL_RING_WINDOW_MS) return true;

    this.groupCallRingTimestamps.set(key, now);
    return false;
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
   *
   * M3 §2.6 — DM push: kalıcı bildirim (`Notification` satırı) hiç üretilmez (DM'in kendi
   * okunmamış yüzeyi zaten var — çan bahsetme/kanka/davet/etkinlik anlamını korur). Push yine
   * de gider; alıcı kümesi burada zaten hesaplanan `members` (yazar hariç), ikinci bir "kime
   * gitsin" süzgeci YAZILMAZ. Tercih kapısı mevcut `shouldNotifyChannel` (guildId=null → yalnız
   * CHANNEL-seviyeli tercih sorgulanır; DM sustur/seviye ayarı zaten yalnız bu targetType'ta
   * yazılıyor — bkz. web `useDmMenuActions`).
   */
  async notifyDmActivity(channelId: string, messageDto: Record<string, unknown>) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true, dmRequestStatus: true, dmRequesterId: true },
    });

    // Guild kanalı → çık
    if (!channel || channel.guildId !== null) return;

    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });

    // C9: PENDING mesaj isteği → normal dm.message YOK (sessiz: liste/masaüstü bildirimi tetiklemez).
    // Alıcıya (istek sahibi olmayan) yalnız sessiz 'dm.request' → "Mesaj İstekleri" rozeti güncellensin.
    // Push de gönderilmez (bu satırdan sonrası hiç çalışmıyor) — istek onaylanmadan bildirim yok.
    if (channel.dmRequestStatus === 'PENDING') {
      const recipient = members.find((m) => m.userId !== channel.dmRequesterId);
      if (recipient) this.realtime.emitToUser(recipient.userId, 'dm.request', { channelId });
      return;
    }

    // Ek-yalnız mesajda gövde eklerden üretilir (ses/görsel/dosya); ek de yoksa eski '[dosya]'.
    const rawContent = typeof messageDto['content'] === 'string' ? messageDto['content'] : '';
    const content =
      previewFromAttachments(
        rawContent,
        messageDto['attachments'] as { contentType: string }[] | undefined,
      ) || '[dosya]';

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

    await this.sendDmPush(
      channelId,
      members.map((m) => m.userId),
      messageDto,
      content,
    );
  }

  /**
   * M3 sonrası KUSUR 2 düzeltmesi — bir DM mesajında doğrudan bahsedilen kullanıcı, aynı mesaj
   * için `notifyMentions` yolundan (aşağıda) zaten push aldı. Burada tekrar göndermek aynı olay
   * için TELEFONA İKİ bildirim düşürüyordu (sahip bulgusu, dev-build testi). `mentions` — bu
   * mesajın resolveMentions çıktısı — alıcı kümesinden çıkarılır; kalıcı çan davranışına DOKUNULMAZ.
   *
   * M3 §2.6 — DM mesajı için push gönderimi. `notifyDmActivity`'nin zaten hesapladığı `members`
   * kümesini kullanır (yeniden üretmez); yazar (+ doğrudan bahsedilenler) filtrelenir, kalanlar
   * `shouldNotifyChannel` ile tercih süzgecinden geçer (susturulmuş → push yok). Fire-and-forget:
   * ana akışı bloke etmez.
   */
  private async sendDmPush(
    channelId: string,
    memberIds: string[],
    messageDto: Record<string, unknown>,
    content: string,
  ): Promise<void> {
    const author = messageDto['author'] as { id: string; username: string };
    const mentioned = new Set((messageDto['mentions'] as string[] | undefined) ?? []);
    const recipients = memberIds.filter((id) => id !== author.id && !mentioned.has(id));
    if (recipients.length === 0) return;

    const eligibility = await Promise.all(
      recipients.map((recipientId) =>
        this.notifications.shouldNotifyChannel(recipientId, null, channelId),
      ),
    );
    const allowed = recipients.filter((_, i) => eligibility[i]);
    if (allowed.length === 0) return;

    // KUSUR 3 düzeltmesi — gövde artık `content.slice(0,100)` ham token'la değil, `notifyMentions`
    // ile AYNI yardımcıdan (resolveMentionPreview) geçmiş, token'ları çözülmüş metinle gider.
    const body = await this.resolveMentionPreview(content, null);

    await this.push
      .sendToUsers(allowed, {
        title: author.username,
        body,
        data: { type: 'DM_MESSAGE', channelId },
        // 🔴 Canlı kullanıcı geri bildirimi 2026-08-11 — aynı sohbetten gelen her mesaj gölgede
        // AYRI bir bildirim satırı açıyordu (yedi mesaj = yedi satır). `tag` kanal başına sabit
        // olduğu için yeni bildirim aynı sohbetin öncekinin YERİNE geçer (WhatsApp davranışı);
        // farklı sohbetler ayrı kalır. İstemci tarafı bunu JS canlıyken zaten taklit ediyor,
        // bu alan uygulama TAMAMEN kapalıyken kalan boşluğu kapatır (FCM bildirimi JS'e uğramaz).
        tag: channelId,
        // 🔴 Sahip cihaz turu 2026-08-10 — kanal adı VERİLMEZSE FCM kendi yedek kanalını
        // (`fcm_fallback_notification_channel`, önem DEFAULT) kullanıyor ve bildirim ekranda
        // BELİRMİYOR, sessizce gölgeye düşüyor. Cihazın `dumpsys notification` kaydıyla
        // doğrulandı. `messages_v6` mobilde önem HIGH ile kuruluyor (bkz. `notifications/push.ts`).
        //
        // 🔴 v1 → v2 (sahip bulgusu 2026-09-01): mobilde kanal titreşim AÇILMADAN kuruluydu, zil
        // modundayken yalnız ses çıkıyordu. Android'de kanal ayarı kurulduktan sonra
        // değiştirilemediği için kimlik artırıldı; bu string mobil taraftaki kanal kimliğiyle
        // BİREBİR aynı kalmak zorunda, biri değişirse diğeri de değişir.
        //
        // v4 → v5 (2026-09-05): titreşim deseni uzatıldı (mobil `MESSAGE_VIBRATE_PATTERN`).
        // ⚠️ Sunucu ile uygulama BİRLİKTE çıkar: eski derlemede v5 kanalı yok, Android
        // tanımadığı kanala gelen bildirimi hiç göstermez.
        //
        // v5 → v6 (Sprint M5f, 2026-09-19): kanal ilk kez kendi sesini taşıyor
        // (`message_channel.wav`); ses de kurulduktan sonra değiştirilemeyen bir kanal ayarı.
        androidChannelId: 'messages_v6',
        priority: 'high',
      })
      .catch(() => {});
  }

  /**
   * KUSUR 3 düzeltmesi — bahsetme token'larını (`<@userId>`, `<@&roleId>`) okunabilir metne çözer.
   * `notifyMentions` (kanal/DM mention önizlemesi) VE `sendDmPush` (DM push gövdesi) TEK bu
   * yardımcıyı kullanır: davranış iki yerde ayrı yazılsaydı ilk değişiklikte ayrışır, kullanıcı
   * bildirimde farklı metin görürdü (bkz. sözleşme notu — aynı risk R14/R15'te @everyone
   * bastırmasında ikinci bir süzgeç kopyası için de yazılmıştı).
   *
   * Token'lar İÇERİKTEN regex ile çıkarılır (parametre olarak verilen listeden değil) — R15'in
   * rol token'ı için zaten kullandığı yaklaşımın aynısı: mesajda geçen HER token çözülür, yalnız
   * kapıdan geçmiş/resolveMentions çıktısındakiler değil.
   *
   * `guildId` null ise (DM) rol sorgusu atlanır — DM'de rol kavramı yok; token yine de gelirse
   * (savunmacı) nötr "@rol" karşılığı döner.
   */
  async resolveMentionPreview(content: string, guildId: string | null): Promise<string> {
    const userIds = Array.from(content.matchAll(/<@([a-zA-Z0-9_-]+)>/g)).map((m) => m[1]);
    const roleIds = Array.from(content.matchAll(/<@&([a-zA-Z0-9_-]+)>/g)).map((m) => m[1]);

    const usernameById = new Map<string, string>();
    if (userIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });
      for (const u of users) usernameById.set(u.id, u.username);
    }

    const roleNameById = new Map<string, string>();
    if (roleIds.length > 0 && guildId) {
      const roles = await this.prisma.role.findMany({
        where: { guildId, id: { in: roleIds } },
        select: { id: true, name: true, isEveryone: true },
      });
      for (const r of roles) roleNameById.set(r.id, r.isEveryone ? 'everyone' : r.name);
    }

    return content
      .replace(/<@&([a-zA-Z0-9_-]+)>/g, (_m, id: string) => `@${roleNameById.get(id) ?? 'rol'}`)
      .replace(/<@([a-zA-Z0-9_-]+)>/g, (_m, id: string) => {
        const username = usernameById.get(id);
        return username ? `@${username}` : '@bilinmeyen';
      })
      .slice(0, 100);
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
    // R20: enum-ADMIN kısa devresi kalktı — izin sistemi (OWNER/ADMINISTRATOR) tek kaynak.
    let eligible: Set<string>;
    if (channel.isPrivate) {
      const [cms, privileged] = await Promise.all([
        this.prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } }),
        this.permissions.guildPrivilegedUserIds(guildId),
      ]);
      let ids = [...cms.map((m) => m.userId), ...privileged];
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
    const rawContent = typeof messageDto['content'] === 'string' ? messageDto['content'] : '';
    const preview = (rawContent.trim().length > 0 ? rawContent : '[dosya]')
      .replace(/<@&[a-zA-Z0-9_-]+>/g, '@everyone')
      .replace(/<@[a-zA-Z0-9_-]+>/g, '@birisi')
      .slice(0, 100);

    const basePayload = { channelId, guildId, authorId };
    const richPayload = {
      ...basePayload,
      author: { id: author.id, username: author.username },
      preview,
    };

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
    // R15 — rol bahsetmesi üçüncü kaynak. Kapıdan geçmiş rol id'leri (everyone HARİÇ).
    const mentionRoles = (messageDto['mentionRoles'] as string[] | undefined) ?? [];
    if (mentions.length === 0 && !mentionsEveryone && mentionRoles.length === 0) return;

    const authorId = (messageDto['author'] as Record<string, string>)['id'];

    // Kanal: guildId + özel mi + yaş kapısı (DM ise guildId null)
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: {
        guildId: true,
        isPrivate: true,
        ageGated: true,
        guild: { select: { adultsOnly: true } },
      },
    });
    const guildId = channel?.guildId ?? null;
    const needsAgeCheck = !!channel && (channel.ageGated || (channel.guild?.adultsOnly ?? false));

    /**
     * R15 — preview'da rol token'ı artık sabit "@everyone" DEĞİL, rolün kendi adı.
     * Preview sunucuda üretiliyor ve bildirim listesinde aynen gösteriliyor; sabit metin
     * bırakılsaydı "@Moderatörler" etiketi bildirimde "@everyone" yazardı.
     * İçerikteki TÜM rol token'ları çözülür (yalnız kapıdan geçenler değil): kapıya takılan
     * token da metinde duruyor ve okunur görünmeli.
     *
     * KUSUR 3 düzeltmesi — bu çözüm artık `resolveMentionPreview` yardımcısında: `sendDmPush`
     * (DM push gövdesi) AYNI yardımcıyı kullanır, davranış iki yerde ayrışmaz.
     */
    const content = (messageDto['content'] as string) ?? '';
    const preview = await this.resolveMentionPreview(content, guildId);

    const author = messageDto['author'] as {
      id: string;
      username: string;
      avatarUrl: string | null;
    };

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
    //
    // R14 §2.4a — @everyone bastırma: alıcı YALNIZ everyone genişlemesinden geliyorsa ve ortam
    // tercihinde `suppressEveryone` açıksa ne emit ne persist edilir. Doğrudan `<@kullanıcı>`
    // bahsetmesi HER ZAMAN geçer (kullanıcı adıyla çağrıldıysa susturulmaz).
    let recipients: string[];
    let suppressedEveryone = new Set<string>();
    // R15 — rol genişlemesinden gelenler ayrı tutulur: susturma tercihleri farklı bayraklar
    // (`suppressEveryone` vs `suppressRoleMentions`) ve bir kullanıcı iki kaynaktan birden gelebilir.
    let suppressedRoleMentions = new Set<string>();
    const fromEveryone = new Set<string>();
    const fromRole = new Set<string>();

    if ((mentionsEveryone || mentionRoles.length > 0) && guildId) {
      /**
       * Özel kanalda GÖRÜNÜR küme: kanal üyeleri ∪ tam yetkili (OWNER/ADMINISTRATOR — R20).
       * Toplu bahsetmelerin tamamı (everyone VE rol) bu kümeyle kesiştirilir — kanalı görmeyen
       * üye, rolü yüzünden ping alıp kanalın varlığını öğrenemez. Sızıntı kapısı iki yolda da AYNI.
       */
      let visibleSet: Set<string> | null = null;
      if (channel?.isPrivate) {
        const [cms, privileged] = await Promise.all([
          this.prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } }),
          this.permissions.guildPrivilegedUserIds(guildId),
        ]);
        visibleSet = new Set([...cms.map((m) => m.userId), ...privileged]);
      }

      if (mentionsEveryone) {
        if (visibleSet) {
          for (const id of visibleSet) fromEveryone.add(id);
        } else {
          const members = await this.prisma.guildMember.findMany({
            where: { guildId },
            select: { userId: true, user: { select: { isMinor: true } } },
          });
          const eligible = needsAgeCheck ? members.filter((m) => !m.user.isMinor) : members;
          for (const m of eligible) fromEveryone.add(m.userId);
        }
      }

      if (mentionRoles.length > 0) {
        // Rol üyeleri TEK sorgu. `member.guildId` şartı başka ortamdan sızmayı engeller
        // (rol id'si zaten o ortamdan doğrulandı, bu ikinci kemer).
        const roleMembers = await this.prisma.guildMemberRole.findMany({
          where: { roleId: { in: mentionRoles }, member: { guildId } },
          select: { member: { select: { userId: true, user: { select: { isMinor: true } } } } },
        });
        for (const rm of roleMembers) {
          const userId = rm.member.userId;
          // Yaş kapısı: everyone yolundaki elemenin birebir aynısı.
          if (needsAgeCheck && rm.member.user.isMinor) continue;
          // Özel kanal kesişimi.
          if (visibleSet && !visibleSet.has(userId)) continue;
          fromRole.add(userId);
        }
      }

      recipients = [...new Set([...mentions, ...fromEveryone, ...fromRole])];

      // Yalnız genişlemeden gelenlerin (doğrudan bahsedilmeyenlerin) ortam tercihi TEK sorguda;
      // alıcı başına ek sorgu açılmaz.
      const mentioned = new Set(mentions);
      const expandedOnly = recipients.filter((id) => !mentioned.has(id));
      if (expandedOnly.length > 0) {
        const prefs = await this.prisma.notificationPref.findMany({
          where: {
            userId: { in: expandedOnly },
            targetType: NotifTargetType.GUILD,
            targetId: guildId,
          },
          select: { userId: true, suppressEveryone: true, suppressRoleMentions: true },
        });
        suppressedEveryone = new Set(prefs.filter((p) => p.suppressEveryone).map((p) => p.userId));
        suppressedRoleMentions = new Set(
          prefs.filter((p) => p.suppressRoleMentions).map((p) => p.userId),
        );
      }
    } else {
      recipients = [...new Set(mentions)];
    }

    const directlyMentioned = new Set(mentions);
    for (const mentionedUserId of recipients) {
      // Yazara kendi bahsetmesi için event gönderme
      if (mentionedUserId === authorId) continue;
      /**
       * R14 + R15 — toplu bahsetme bastırma. Yalnız GENİŞLEMEDEN gelen alıcıya uygulanır:
       * adıyla çağrılan kullanıcı her zaman bildirim alır (iki bayrak da onu susturmaz).
       *
       * Bir kullanıcı iki kaynaktan birden gelebilir (hem @everyone hem rolü etiketlenmiş).
       * O zaman susturulmayan kaynak yeter: rol pingini kapatmış ama @everyone'ı açık bırakmış
       * biri @everyone mesajını almaya devam eder. Tek bayrağa bakıp elemek, kullanıcının
       * açık bıraktığı kanalı da sessizce kapatırdı.
       */
      if (!directlyMentioned.has(mentionedUserId)) {
        const viaEveryone =
          fromEveryone.has(mentionedUserId) && !suppressedEveryone.has(mentionedUserId);
        const viaRole =
          fromRole.has(mentionedUserId) && !suppressedRoleMentions.has(mentionedUserId);
        if (!viaEveryone && !viaRole) continue;
      }
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
        // C35: webhook mesajında author.id bir webhook kimliği (User değil → FK ihlali) ve
        // oluşturanı ele vermemeli; kalıcı bildirim aktörsüz yazılır.
        actorId: messageDto['webhook'] ? undefined : author.id,
        guildId: guildId ?? undefined,
        channelId,
        messageId: messageDto['id'] as string,
        preview,
      });
    }
  }
}
