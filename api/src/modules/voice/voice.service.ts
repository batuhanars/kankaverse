import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
  TrackSource,
} from 'livekit-server-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { DmPermissionService } from '../../shared/dm-permission/dm-permission.service';

interface ParticipantMeta {
  avatarUrl?: string | null;
}

/**
 * VoiceService — LiveKit ses kanalları (audio-only v1).
 * Sözleşme: contracts/SPRINT_V2_LIVEKIT_CONTRACT.md.
 * KURAL: ses kaydı/egress YOK · video grant YOK · karantina → konuşma kapalı.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly url: string; // wss://...
  private readonly roomService: RoomServiceClient | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private membership: MembershipService,
    private realtime: RealtimeService,
    private dmPermission: DmPermissionService,
  ) {
    this.apiKey = this.config.get<string>('livekit.apiKey') ?? '';
    this.apiSecret = this.config.get<string>('livekit.apiSecret') ?? '';
    this.url = this.config.get<string>('livekit.url') ?? '';
    this.enabled = !!(this.apiKey && this.apiSecret && this.url);

    if (this.enabled) {
      // RoomServiceClient HTTP host ister; wss:// → https:// (ws:// → http://)
      const httpUrl = this.url.replace(/^ws/, 'http');
      this.roomService = new RoomServiceClient(httpUrl, this.apiKey, this.apiSecret);
    } else {
      this.logger.warn('LiveKit env eksik — ses kanalları devre dışı (503).');
    }
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new ServiceUnavailableException({
        message: 'Ses kanalları şu anda kullanılamıyor.',
        error: 'VOICE_DISABLED',
      });
    }
  }

  /**
   * C1 — Katılım token'ı (R7). Erişim kapısı mint'ten ÖNCE; audio-only grant;
   * karantinadaki üye dinler ama konuşamaz.
   */
  async mintToken(userId: string, channelId: string) {
    this.assertEnabled();

    // Erişim + yaş + özel kanal/üyelik kapısı — mevcut helper, hata kodları sapmadan yayılır
    const channel = await this.membership.requireChannelAccess(userId, channelId);

    // Tür kapısı + konuşma izni (kurul: davet gate'i sinyalde, mint'te tekrar)
    let canPublish: boolean;
    if (channel.type === 'GUILD_VOICE') {
      canPublish = await this.resolveCanPublish(userId, channel.guildId);
    } else if (channel.type === 'DM' || channel.type === 'GROUP_DM') {
      // DM/grup sesli arama: block + (1-1 için) ilişki re-check; guild-karantinası yok → konuşabilir
      await this.requireDmCallGate(userId, channelId, channel.type);
      canPublish = true;
    } else {
      throw new BadRequestException({
        message: 'Bu bir ses kanalı değil.',
        error: 'NOT_VOICE_CHANNEL',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, avatarUrl: true },
    });

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: user?.username ?? userId,
      ttl: '10m',
      metadata: JSON.stringify({ avatarUrl: user?.avatarUrl ?? null } satisfies ParticipantMeta),
    });
    at.addGrant({
      roomJoin: true,
      room: channelId,
      canSubscribe: true,
      canPublish,
      canPublishData: false,
      // audio-only: yalnız mikrofon — video/ekran grant'i HİÇBİR yolda açılmaz
      canPublishSources: [TrackSource.MICROPHONE],
    });

    const token = await at.toJwt();
    return { token, url: this.url, canPublish };
  }

  /**
   * Karantina: bu guild'e yeni katılan üye (joinedAt > now - quarantineHours) konuşamaz.
   * quarantineHours=0 → karantina kapalı. Guild dışı (teorik) → uygulanmaz.
   */
  private async resolveCanPublish(userId: string, guildId: string | null): Promise<boolean> {
    if (!guildId) return true;
    const quarantineHours = this.config.get<number>('quarantineHours') ?? 24;
    if (quarantineHours <= 0) return true;

    const member = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { joinedAt: true, role: true },
    });
    if (!member) return false; // erişim kapısı geçti ama üyelik yoksa güvenli taraf

    // OWNER/ADMIN ses karantinasından MUAF — ortamın güvenilir operatörleri (REV-6:
    // sahibin kendi yeni kurduğu ortamda konuşamaması bug'ı). Karantina yalnız yeni
    // MEMBER'ı broadcast'ten alıkoyar (anti-spam); minör/erişim kapıları ayrı + bozulmaz.
    if (member.role === 'OWNER' || member.role === 'ADMIN') return true;

    const cutoff = new Date(Date.now() - quarantineHours * 60 * 60 * 1000);
    return member.joinedAt < cutoff; // cutoff'tan önce katıldıysa yerleşik → konuşabilir
  }

  /**
   * DM/grup sesli arama kapısı (R7). Block her zaman; 1-1'de ilişki re-check (canDm).
   * Kurul: token mint'te gate tekrar (block/ilişki değişmiş olabilir). Jenerik DM_NOT_ALLOWED (sızıntı yok).
   */
  private async requireDmCallGate(userId: string, channelId: string, type: 'DM' | 'GROUP_DM') {
    await this.membership.requireNoDmBlock(userId, channelId);
    if (type === 'DM') {
      const other = await this.otherDmMember(channelId, userId);
      if (other) {
        const res = await this.dmPermission.canDm(userId, other);
        if (!res.allowed) {
          throw new ForbiddenException({ message: 'Bu kişiyle sesli görüşemezsin.', error: 'DM_NOT_ALLOWED' });
        }
      }
    }
    // GROUP_DM: üyelik (requireChannelAccess) + block yeterli — grup arkadaş-tabanlı/yetişkin-only.
  }

  /** 1-1 DM kanalındaki diğer üyenin userId'si (yoksa null). */
  private async otherDmMember(channelId: string, userId: string): Promise<string | null> {
    const other = await this.prisma.channelMember.findFirst({
      where: { channelId, userId: { not: userId } },
      select: { userId: true },
    });
    return other?.userId ?? null;
  }

  /**
   * C3 — Anlık katılımcılar. Kaynak: LiveKit room state (DB değil).
   */
  async listParticipants(userId: string, channelId: string) {
    this.assertEnabled();
    const channel = await this.membership.requireChannelAccess(userId, channelId);
    // REV-11: ses GUILD_VOICE + DM + GROUP_DM'de olabilir (devam eden çağrı tespiti).
    // GUILD_TEXT vb. ses barındırmaz → NOT_VOICE_CHANNEL.
    const voiceCapable = channel.type === 'GUILD_VOICE' || channel.type === 'DM' || channel.type === 'GROUP_DM';
    if (!voiceCapable) {
      throw new BadRequestException({
        message: 'Bu bir ses kanalı değil.',
        error: 'NOT_VOICE_CHANNEL',
      });
    }

    try {
      const participants = await this.roomService!.listParticipants(channelId);
      // REV-13b: kanal aktif-süresi = en erken katılımcı joinedAt (LiveKit saniye → ms).
      const joinTimes = participants
        .map((p) => Number(p.joinedAt) * 1000)
        .filter((t) => Number.isFinite(t) && t > 0);
      const startedAt = joinTimes.length ? Math.min(...joinTimes) : null;
      return {
        startedAt,
        participants: participants.map((p) => ({
          userId: p.identity,
          username: p.name || p.identity,
          avatarUrl: this.parseAvatar(p.metadata),
        })),
      };
    } catch {
      // Oda henüz açılmadıysa LiveKit hata döndürür → boş
      return { startedAt: null, participants: [] };
    }
  }

  /**
   * C2 — LiveKit webhook (R7). İmza doğrulaması; VoiceSession audit + WS presence.
   * İşleme hatası fırlatmaz (LiveKit retry fırtınası olmasın); yalnız imza hatası 401.
   */
  async handleWebhook(rawBody: string, authHeader: string | undefined) {
    this.assertEnabled();

    const receiver = new WebhookReceiver(this.apiKey, this.apiSecret);
    let event: Awaited<ReturnType<WebhookReceiver['receive']>>;
    try {
      event = await receiver.receive(rawBody, authHeader);
    } catch {
      throw new UnauthorizedException({
        message: 'Geçersiz webhook imzası.',
        error: 'INVALID_WEBHOOK_SIGNATURE',
      });
    }

    const room = event.room?.name;
    const participant = event.participant;

    try {
      switch (event.event) {
        case 'participant_joined':
          if (room && participant?.identity) {
            await this.onParticipantJoined(room, participant.identity, participant.name, participant.metadata);
          }
          break;
        case 'participant_left':
          if (room && participant?.identity) {
            await this.onParticipantLeft(room, participant.identity);
          }
          break;
        case 'room_finished':
          if (room) await this.onRoomFinished(room);
          break;
        default:
          break; // track_*, room_started vb. yok sayılır
      }
    } catch (err) {
      this.logger.error(`Webhook işleme hatası (${event.event}): ${String(err)}`);
      // yutulur — 200 dön
    }
  }

  private async onParticipantJoined(
    channelId: string,
    userId: string,
    name: string | undefined,
    metadata: string | undefined,
  ) {
    // İdempotent: açık session zaten varsa çift joined'i yok say
    const open = await this.prisma.voiceSession.findFirst({
      where: { channelId, userId, leftAt: null },
      select: { id: true },
    });
    if (!open) {
      await this.prisma.voiceSession.create({ data: { channelId, userId } });
    }

    this.realtime.emitToRoom(channelId, 'voice.participant_joined', {
      channelId,
      participant: {
        userId,
        username: name || userId,
        avatarUrl: this.parseAvatar(metadata),
      },
    });
  }

  private async onParticipantLeft(channelId: string, userId: string) {
    // En son açık session'ı kapat
    const open = await this.prisma.voiceSession.findFirst({
      where: { channelId, userId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
      select: { id: true },
    });
    if (open) {
      await this.prisma.voiceSession.update({
        where: { id: open.id },
        data: { leftAt: new Date() },
      });
    }

    this.realtime.emitToRoom(channelId, 'voice.participant_left', { channelId, userId });
  }

  private async onRoomFinished(channelId: string) {
    // Güvenlik ağı: odanın tüm açık session'larını kapat
    await this.prisma.voiceSession.updateMany({
      where: { channelId, leftAt: null },
      data: { leftAt: new Date() },
    });
  }

  private parseAvatar(metadata: string | undefined): string | null {
    if (!metadata) return null;
    try {
      const parsed = JSON.parse(metadata) as ParticipantMeta;
      return parsed.avatarUrl ?? null;
    } catch {
      return null;
    }
  }
}
