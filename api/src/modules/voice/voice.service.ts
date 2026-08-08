import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, WebhookReceiver, TrackSource } from 'livekit-server-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { DmPermissionService } from '../../shared/dm-permission/dm-permission.service';

interface ParticipantMeta {
  avatarUrl?: string | null;
}

/**
 * R17 §2 — resolveVideoSources / resolveCanPublishSources'ın ihtiyaç duyduğu kanal alanları.
 * mintToken (requireChannelAccess) ve unmuteParticipant (requireGuildVoiceChannel) farklı
 * Prisma select'lerden gelir ama ikisi de bu şekle uyar — tek tip, tek hesap (Rule of Three).
 */
interface VideoSourceChannel {
  id: string;
  type: string;
  guildId: string | null;
  ageGated?: boolean;
  mediaEnabled?: boolean;
  guild?: { adultsOnly: boolean } | null;
}

/**
 * VoiceService — LiveKit ses + video/ekran kanalları.
 * Sözleşme: contracts/SPRINT_V2_LIVEKIT_CONTRACT.md (audio) +
 *            contracts/SPRINT_C4_VIDEO_SCREEN_CONTRACT.md (video, BUILD-DARK).
 * KURAL: ses/video kaydı/egress YOK · video grant yalnız yetişkin-yalıtılmış bağlamda ·
 *        karantina → konuşma+video kapalı · minör → video ASLA.
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
    private permissions: PermissionsService,
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
   * C1 — Katılım token'ı (R7). Erişim kapısı mint'ten ÖNCE; audio-only + koşullu video grant;
   * karantinadaki üye dinler ama konuşamaz/video açamaz. Sprint C4: video BUILD-DARK.
   *
   * B1 (R11B) — Teftiş-girişi (R7 ÇEKİRDEK):
   *   requireChannelAccess NOT_CHANNEL_MEMBER fırlattığında MUTE_MEMBERS sahibi bypass edebilir.
   *   AGE_RESTRICTED her zaman fırlatılır — yaş kapısı moda da kapalı, bypass ASLA.
   *   Bypass-giriş AuditLog'a yazılır (voice.inspect). requireChannelAccess helper DEĞİŞTİRİLMEDİ.
   */
  async mintToken(userId: string, channelId: string) {
    this.assertEnabled();

    // Erişim + yaş + özel kanal/üyelik kapısı — mevcut helper, hata kodları sapmadan yayılır
    let channel: Awaited<ReturnType<typeof this.membership.requireChannelAccess>>;
    let isInspectEntry = false; // bypass-giriş bayrağı — audit kararı için
    let isEmergencyInspect = false; // A4-7b: platform-mod acil-yanıt teftiş-girişi (ayrı audit aksiyonu)

    try {
      channel = await this.membership.requireChannelAccess(userId, channelId);
    } catch (err: unknown) {
      // B1: yalnız NOT_CHANNEL_MEMBER bypass'lanabilir (özel kanal üyeliği eksik).
      // AGE_RESTRICTED ve diğer tüm hatalar ASLA bypass edilmez — her zaman fırlat.
      const errorCode = (err as { response?: { error?: string } })?.response?.error;
      if (errorCode !== 'NOT_CHANNEL_MEMBER') {
        // AGE_RESTRICTED dahil tüm diğer hatalar — yaş kapısı moda da kapalı.
        throw err;
      }

      // NOT_CHANNEL_MEMBER: aktörün MUTE_MEMBERS izni varsa teftiş-girişi olarak devam.
      // Önce kanal varlığını doğrudan çek (requireChannelAccess yerine) — guildId lazım.
      const rawChannel = await this.prisma.channel.findFirst({
        where: { id: channelId, deletedAt: null },
        include: { guild: true },
      });
      if (!rawChannel || !rawChannel.guildId) {
        // Kanal yoksa veya DM kanalıysa (guildId null) — orijinal hatayı fırlat.
        throw err;
      }

      const hasMutePermission = await this.permissions.hasGuildPermission(
        userId,
        rawChannel.guildId,
        'MUTE_MEMBERS',
      );
      if (!hasMutePermission) {
        // A4-7b — Platform güvenliği (isModerator) acil-yanıtı: guild rolü olmasa da, bu kanalda
        // AÇIK bir EMERGENCY raporu varsa teftiş-girişi yapabilir. Yetki MİNİMAL ve amaca bağlı:
        // yalnız platform mod + yalnız aktif acil → mod'lar rastgele ses kanalına SIZAMAZ.
        // Görünür (LiveKit participant) + ayrı audit (voice.emergency_inspect). Yaş kapısı yine aşılmaz
        // (yalnız NOT_CHANNEL_MEMBER bypass'lanıyor; AGE_RESTRICTED yukarıda fırlatıldı).
        const actor = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { isModerator: true },
        });
        const hasOpenEmergency =
          actor?.isModerator === true &&
          (await this.prisma.report.count({
            where: {
              reason: 'EMERGENCY',
              targetType: 'CHANNEL',
              targetId: channelId,
              status: { in: ['OPEN', 'TRIAGED'] },
            },
          })) > 0;
        if (!hasOpenEmergency) {
          // Ne guild MUTE_MEMBERS ne platform-acil-yanıt → orijinal NOT_CHANNEL_MEMBER hatası.
          throw err;
        }
        isEmergencyInspect = true;
      }

      // Yetki onaylandı (guild MUTE_MEMBERS veya platform acil-yanıt) → teftiş-girişi.
      channel = rawChannel;
      isInspectEntry = true;
    }

    // Tür kapısı + konuşma izni (kurul: davet gate'i sinyalde, mint'te tekrar)
    let canPublish: boolean;
    let otherDmUserId: string | null = null;
    if (channel.type === 'GUILD_VOICE') {
      // R10: kullanıcı limiti — erişim kapısından SONRA, mint'ten ÖNCE.
      await this.enforceUserLimit(userId, channel.id, channel.userLimit, channel.guildId);
      // R11: kalıcı server-mute → konuşamaz (yeniden katılsa da). Mute yoksa karantinaya saygı.
      const muted = await this.isVoiceMuted(channel.id, userId);
      canPublish = muted ? false : await this.resolveCanPublish(userId, channel.guildId);
    } else if (channel.type === 'DM' || channel.type === 'GROUP_DM') {
      // DM/grup sesli arama: block + (1-1 için) ilişki re-check; guild-karantinası yok → konuşabilir
      await this.requireDmCallGate(userId, channelId, channel.type);
      canPublish = true;
      // DM: video kapısı için diğer üyeyi şimdiden bul (resolveVideoSources'a geçer)
      if (channel.type === 'DM') {
        otherDmUserId = await this.otherDmMember(channelId, userId);
      }
    } else {
      throw new BadRequestException({
        message: 'Bu bir ses kanalı değil.',
        error: 'NOT_VOICE_CHANNEL',
      });
    }

    // Sprint C4 — video/ekran kaynak kararı (T&S, R7). BUILD-DARK: bayraklar false → [].
    // R17 §2 — paylaşılan hesap: resolveCanPublishSources (unmuteParticipant de AYNI metodu çağırır).
    const canPublishSources = await this.resolveCanPublishSources(userId, channel, otherDmUserId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, avatarUrl: true, isMinor: true },
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
      canPublishSources,
    });

    const token = await at.toJwt();

    // Presence yayını (dev-fix): LiveKit webhook localhost'a ulaşamadığında
    // mintToken'dan güvenilir katılım sinyali gönderir. Webhook onParticipantJoined ile
    // aynı payload şekli — frontend addParticipant idempotent olduğu için çift-yayın zararsız.
    // GUILD_VOICE + DM + GROUP_DM (ayrılış simetriği announceLeave'de).
    if (this.isVoiceCapable(channel.type)) {
      // VoiceSession kaydını katılım anında oluştur (idempotent). Eskiden yalnız webhook yapardı;
      // dev'de webhook localhost'a ulaşamadığından kayıt hiç oluşmuyordu → acil bağlam (channelId)
      // çözülemiyordu. Mint'te oluşturmak dev'i çalıştırır + prod'u webhook gecikmesine dayanıklı yapar.
      // Best-effort: kayıt patlasa da katılım engellenmez (webhook + onRoomFinished yedek).
      try {
        await this.ensureOpenVoiceSession(channelId, userId);
      } catch {
        /* best-effort — webhook/room_finished yedek */
      }

      const joinedPayload = {
        channelId,
        participant: {
          userId,
          username: user?.username ?? userId,
          avatarUrl: user?.avatarUrl ?? null,
        },
      };
      this.realtime.emitToRoom(channelId, 'voice.participant_joined', joinedPayload);
      this.realtime.emitToVoicePresence(channelId, 'voice.participant_joined', joinedPayload);
    }

    // B1 — Teftiş-girişi audit: mod normal-üye olmadığı kanala bypass ile girdiğinde.
    // Normal üyenin kendi kanalına girişi audit'lenmez — yalnız bypass-giriş kaydedilir.
    if (isInspectEntry && channel.guildId) {
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: isEmergencyInspect ? 'voice.emergency_inspect' : 'voice.inspect',
          entityType: 'channel',
          entityId: channelId,
          metadata: {
            guildId: channel.guildId,
            targetChannelPrivate: channel.isPrivate ?? false,
          },
        },
      });
    }

    // bitrate: GUILD_VOICE kanal ayarı; DM/grup çağrısında varsayılan 64. İstemci publish'te uygular.
    // canPublishCamera/canPublishScreen: istemci bu bayraklarla UI butonlarını gösterir/gizler.
    return {
      token,
      url: this.url,
      canPublish,
      bitrate: channel.bitrate ?? 64,
      canPublishCamera: canPublishSources.includes(TrackSource.CAMERA),
      canPublishScreen: canPublishSources.includes(TrackSource.SCREEN_SHARE),
    };
  }

  /** R11 — bu kanalda kullanıcı için kalıcı (server) mute kaydı var mı. mintToken bunu zorlar. */
  private async isVoiceMuted(channelId: string, userId: string): Promise<boolean> {
    const mute = await this.prisma.voiceMute.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { id: true },
    });
    return !!mute;
  }

  /**
   * Sprint C7 (C4 revizyonu) — T&S video/ekran kaynak kararı (R7, ÇEKIRDEK).
   * Fail-closed: kuşkuda boş dizi (video yok). mintToken'a `[TrackSource.MICROPHONE, ...sonuç]` olarak eklenir.
   *
   * C7 DEĞİŞİKLİKLERİ:
   *  - Kapı 2 (minör mutlak ret) GUILD_VOICE'tan KALDIRILDI. Minör artık genel + mediaEnabled=true kanalda video alabilir.
   *  - DM dalında minör reti KORUNDU (kapı 5 DM bölümüne taşındı: self-minör + other-minör kontrolü).
   *  - Kapı 5 GUILD_VOICE: yalnız mediaEnabled || ageGated || adultsOnly ise grant; değilse [].
   *  - adultsOnly/ageGated kanallar mediaEnabled'dan BAĞIMSIZ medya almaya devam eder (C4 regresyon yok).
   *
   * Sıralı kapılar:
   *  1. Bayrak: CAMERA_ENABLED/SCREEN_ENABLED false → ilgili kaynak aday-dışı; ikisi de false → erken [].
   *  2. ~~Minör mutlak ret~~ GUILD_VOICE için KALDIRILDI. DM reti kapı 5 DM dalına taşındı.
   *  3. Karantina: GUILD_VOICE'ta resolveCanPublish false → []. (Video, audio'dan ağır kısıt.)
   *  4. Server-mute: isVoiceMuted → []. (Her yayını keser, video dahil.)
   *  5. Bağlam kapısı (revize):
   *     - GUILD_VOICE: channel.mediaEnabled || channel.ageGated || guild.adultsOnly ise video; değilse [].
   *       mediaEnabled=false + ageGated=false + adultsOnly=false (genel kanal) → [].
   *       mediaEnabled=true → minör dahil herkese video (erişim kapısı zaten ageGated/adultsOnly'ye minörü sokmaz).
   *     - DM (1-1): self veya other minörse → []. İki taraf da yetişkinse video.
   *     - GROUP_DM: TÜM üyeler (self dahil) yetişkinse video; bir minör bile → [].
   *
   * SCREEN_SHARE_AUDIO: yalnız SCREEN_SHARE izinliyse eklenir.
   * EgressClient/kayıt: YOK — bu fonksiyon yalnız grant kararı verir.
   * Re-mint tetikleyicisi: mediaEnabled değişiminde istemci channel.updated WS olayıyla re-mint yapar (C4-C3 deseni).
   */
  private async resolveVideoSources(
    userId: string,
    channel: VideoSourceChannel,
    otherDmUserId: string | null,
  ): Promise<TrackSource[]> {
    const cameraEnabled = this.config.get<boolean>('cameraEnabled') ?? false;
    const screenEnabled = this.config.get<boolean>('screenEnabled') ?? false;

    // Kapı 1: Bayrak — ikisi de kapalıysa erken çık (audio-only davranış birebir)
    if (!cameraEnabled && !screenEnabled) return [];

    // Adaylar: yalnız açık bayrağa sahip kaynaklar
    const cameraCandidate = cameraEnabled;
    const screenCandidate = screenEnabled;

    // Kapı 2: GUILD_VOICE için KALDIRILDI (C7). DM minör reti kapı 5 DM dalına taşındı.
    // Açıklama: minör artık mediaEnabled=true genel kanalda video alabilir (sahip kararı 2026-06-30).
    // Savunma derinliği: ageGated/adultsOnly kanallar erişim kapısında (requireChannelAccess) zaten AGE_RESTRICTED fırlatır.

    // Kapı 3: Karantina (yalnız GUILD_VOICE) — video audio'dan ağır; karantinada video da kapalı
    if (channel.type === 'GUILD_VOICE' && channel.guildId) {
      const canPublish = await this.resolveCanPublish(userId, channel.guildId);
      if (!canPublish) return [];
    }

    // Kapı 4: Server-mute — her yayını keser (video dahil)
    const muted = await this.isVoiceMuted(channel.id, userId);
    if (muted) return [];

    // Kapı 5: Bağlam kapısı (C7.1 — tam ayrıştırma, sahip kararı 2026-06-30)
    if (channel.type === 'GUILD_VOICE') {
      // Medya YALNIZ admin mediaEnabled toggle'ına bağlı. 18+ (ageGated/adultsOnly) bir YAŞ-ERİŞİM
      // ayarıdır, medya ayarı DEĞİL → tek başına medya AÇMAZ (önceki C7 auto-grant kaldırıldı).
      // adultsOnly/ageGated kanalda da kamera/ekran için admin mediaEnabled açmalı; minör tarafı
      // değişmez (minör 18+'a zaten giremez; genel kanalda medya yine toggle'a bağlı).
      if (channel.mediaEnabled !== true) return [];
    } else if (channel.type === 'DM') {
      // C7: DM minör reti KORUNUR — self-minör kontrolü kapı 2'den buraya taşındı.
      // 1-1 DM: iki taraf da yetişkin olmalı (self + other).
      const selfUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { isMinor: true },
      });
      if (!selfUser || selfUser.isMinor) return []; // self minörse → video []

      if (!otherDmUserId) return []; // diğer üye bulunamazsa fail-closed
      const otherUser = await this.prisma.user.findUnique({
        where: { id: otherDmUserId },
        select: { isMinor: true },
      });
      if (otherUser?.isMinor === true) return []; // karşı taraf minörse → video []
    } else if (channel.type === 'GROUP_DM') {
      // GROUP_DM: TÜM üyeler yetişkin olmalı — varsayıma güvenme, fiilen kontrol et.
      // Self userId de ChannelMember olduğundan self-minör bu sayımda kapsanır.
      const members = await this.prisma.channelMember.findMany({
        where: { channelId: channel.id },
        select: { userId: true },
      });
      if (members.length === 0) return []; // fail-closed: üye listesi boşsa

      const memberIds = members.map((m) => m.userId);
      const minorCount = await this.prisma.user.count({
        where: { id: { in: memberIds }, isMinor: true },
      });
      if (minorCount > 0) return []; // bir minör bile → tüm video kapalı
    } else {
      // Bilinmeyen bağlam → fail-closed
      return [];
    }

    // Tüm kapılar geçildi → izin verilen kaynakları derle
    const sources: TrackSource[] = [];
    if (cameraCandidate) sources.push(TrackSource.CAMERA);
    if (screenCandidate) {
      sources.push(TrackSource.SCREEN_SHARE);
      sources.push(TrackSource.SCREEN_SHARE_AUDIO); // ekran sesi yalnız ekran paylaşımıyla
    }
    return sources;
  }

  /**
   * R17 §2 — Tek doğruluk kaynağı: `canPublishSources` grant değeri (MICROPHONE +
   * resolveVideoSources sonucu). `mintToken` VE `unmuteParticipant` AYNI metodu çağırır — hesap
   * kopyalanmaz, paylaşılır (üçüncü kullanım yeri, Rule of Three burada tetiklendi).
   *
   * 🔴 LiveKit semantiği (§0 — bu sprintin kalbi): `updateParticipant`'a `canPublishSources` HİÇ
   * gönderilmezse ya da boş dizi `[]` gönderilirse LiveKit bunu "HİÇBİRİ" değil "HEPSİ SERBEST" diye
   * yorumlar. Bu yüzden `canPublish:true` yazan her çağrı (mint + unmute) kaynak listesini de MUTLAKA
   * — ve bu kanalın/bağlamın T&S kararına göre — açıkça yazmak ZORUNDADIR. `canPublish:false` yazan
   * çağrılarda (muteParticipant) sorun yok — kapı zaten kapalı, kaynak listesinin içeriği önemsiz.
   */
  private async resolveCanPublishSources(
    userId: string,
    channel: VideoSourceChannel,
    otherDmUserId: string | null,
  ): Promise<TrackSource[]> {
    const videoSources = await this.resolveVideoSources(userId, channel, otherDmUserId);
    return [TrackSource.MICROPHONE, ...videoSources];
  }

  /**
   * §2 (Sprint R19) — zaten YAYINDA olan track'i gerçekten kes. `updateParticipant` yalnız
   * gelecekteki publish izinlerini (`canPublish`/`canPublishSources`) günceller; halihazırda
   * yayınlanan bir track'e DOKUNMAZ — bu sprintin kök nedeni (§0: sahip cihazda susturdu, hedef
   * konuşmaya/kameraya devam etti çünkü kesilme LiveKit'in yan etkisine bırakılmıştı).
   * `mutePublishedTrack` LiveKit'e "bu track'i ŞİMDİ kes" der — izin değil, aksiyon.
   *
   * Best-effort, iki seviyeli: katılımcı bağlı değilse/oda yoksa `getParticipant` patlar → sessiz
   * geç (henüz publish edilmiş bir şey yok, keseceğimiz track de yok). Katılımcı bulunduysa her
   * track için AYRI dene — bir track'in mute çağrısı patlarsa diğerleri yine denenir.
   *
   * `predicate` verilmezse TÜM track'ler kesilir (sustur: ses+video+ekran). `stopBroadcast`
   * yalnız mikrofon-DIŞI kaynakları geçiren bir predicate verir (§2: video/ekran keser, ses kalır).
   */
  private async forceMuteTracks(
    channelId: string,
    targetUserId: string,
    predicate: (source: TrackSource) => boolean = () => true,
  ): Promise<void> {
    if (!this.roomService) return;

    let participant: Awaited<ReturnType<RoomServiceClient['getParticipant']>>;
    try {
      participant = await this.roomService.getParticipant(channelId, targetUserId);
    } catch {
      return; // bağlı değil / oda yok → kesecek bir track de yok
    }

    const tracks = (participant.tracks ?? []).filter((t) => predicate(t.source));
    await Promise.all(
      tracks.map(async (t) => {
        try {
          await this.roomService!.mutePublishedTrack(channelId, targetUserId, t.sid, true);
        } catch {
          // tek track'in mute çağrısı patlarsa diğerleri yine denenir
        }
      }),
    );
  }

  /**
   * R11 — Sustur (kalıcı/server-mute). Yetki: MUTE_MEMBERS. GUILD_VOICE + owner/self bloğu.
   * Kayıt kalıcıdır (mintToken zorlar); LiveKit updateParticipant best-effort (bağlı değilse sessiz geç).
   */
  async muteParticipant(actorId: string, channelId: string, targetUserId: string): Promise<void> {
    this.assertEnabled();
    const channel = await this.requireGuildVoiceChannel(channelId);
    await this.requireGuildPermission(actorId, channel.guildId, 'MUTE_MEMBERS');

    if (targetUserId === actorId) {
      throw new BadRequestException({
        message: 'Kendini susturamazsın.',
        error: 'CANNOT_MUTE_SELF',
      });
    }
    await this.requireTargetNotOwner(
      channel.guildId,
      targetUserId,
      'CANNOT_MUTE_OWNER',
      'Ortam sahibi susturulamaz.',
    );

    await this.prisma.voiceMute.upsert({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      create: { channelId, userId: targetUserId, guildId: channel.guildId, mutedById: actorId },
      update: { mutedById: actorId },
    });

    // LiveKit best-effort — katılımcı bağlı değilse / LiveKit yoksa sessiz geç (kayıt kaynak-of-truth).
    // R17 §2 — `canPublishSources` BİLEREK gönderilmiyor. `canPublish:false` zaten her yayını kesiyor;
    // sorun `canPublish:true` + boş/eksik `canPublishSources` kombinasyonunda çıkıyor (§0 — LiveKit
    // boş diziyi "hepsi serbest" sayıyor). Burada `canPublish:false` olduğu için kaynak listesinin
    // içeriği LiveKit tarafında etkisiz — yine de yanlışlıkla `canPublishSources: []` EKLEME: bir
    // sonraki değişiklikte biri `canPublish`'i `true`'ya çevirirse o boş dizi sessizce "hepsi serbest"e
    // döner. Kaynak listesi göndermek gerekirse (örn. mikrofon sesi duyulsun istenirse) daraltılmış bir
    // liste (`[MICROPHONE]`, bkz. stopBroadcast) kullanılır — asla `[]`.
    if (this.roomService) {
      try {
        await this.roomService.updateParticipant(channelId, targetUserId, undefined, {
          canPublish: false,
          canSubscribe: true,
          canPublishData: false,
        });
      } catch {
        // bağlı değil / oda yok → kalıcı kayıt mintToken'da zorlanır
      }
    }

    // §2 (Sprint R19, §0 kusuru) — yukarıdaki updateParticipant yalnız GELECEKTEKİ publish
    // izinlerini keser; hedef ZATEN yayındaysa (mikrofon açık, kamera açık) o track'ler bu
    // çağrıyla kesilmez. Sustur TÜM track'leri (ses + video + ekran) zorla keser — predicate yok.
    await this.forceMuteTracks(channelId, targetUserId);

    this.realtime.emitToRoom(channelId, 'voice.participant_muted', {
      channelId,
      userId: targetUserId,
    });
  }

  /**
   * R11 — Susturmayı kaldır. Yetki: MUTE_MEMBERS. Kayıt silinir; LiveKit canPublish GERİ VERİLİR
   * ama karantinaya saygı: resolveCanPublish (kör true DEĞİL).
   *
   * R17 §2 (🔴 T&S sızıntı düzeltmesi) — `canPublishSources` artık AYRICA yeniden hesaplanıp
   * gönderiliyor (`resolveCanPublishSources`, mintToken ile PAYLAŞILAN hesap). Öncesinde bu alan hiç
   * gönderilmiyordu; `canPublish:true` + eksik `canPublishSources` LiveKit'te "HEPSİ SERBEST" anlamına
   * geliyordu (§0) — susturulup açılan kullanıcı, kamerası kapalı olması gereken bir kanalda bile video
   * yayınlayabiliyordu. Şimdi susturma kalkınca kullanıcı tam olarak kanalın/bağlamın o an izin verdiği
   * kaynaklara dönüyor — ne fazlası (sızıntı) ne eksiği (kamera düğmesinin geri gelmemesi kusuru).
   *
   * 🔴 §3 (Sprint R19) — BİLEREK `forceMuteTracks(..., muted:false)` YOK. `muteParticipant`'ın
   * simetriği "zorla aç" DEĞİLDİR: hedef susturulmadan ÖNCE mikrofonunu kendi isteğiyle kapatmış
   * olabilir; sunucunun izni (`canPublish`) geri vermesi "mikrofonunu aç" demek değildir. Yeniden
   * yayın kararı istemcide kalır (R16/R16m). Bu satırı "simetrik olsun" diye EKLEME — kullanıcı
   * iradesini ezer.
   */
  async unmuteParticipant(actorId: string, channelId: string, targetUserId: string): Promise<void> {
    this.assertEnabled();
    const channel = await this.requireGuildVoiceChannel(channelId);
    await this.requireGuildPermission(actorId, channel.guildId, 'MUTE_MEMBERS');

    await this.prisma.voiceMute.deleteMany({ where: { channelId, userId: targetUserId } });

    if (this.roomService) {
      try {
        const canPublish = await this.resolveCanPublish(targetUserId, channel.guildId);
        const canPublishSources = await this.resolveCanPublishSources(
          targetUserId,
          { ...channel, type: 'GUILD_VOICE' }, // requireGuildVoiceChannel type'ı zaten doğruladı
          null, // GUILD_VOICE — DM diğer-üye kavramı yok
        );
        await this.roomService.updateParticipant(channelId, targetUserId, undefined, {
          canPublish,
          canSubscribe: true,
          canPublishData: false,
          canPublishSources,
        });
      } catch {
        // bağlı değil / oda yok → bir sonraki mintToken doğru canPublish verir
      }
    }

    this.realtime.emitToRoom(channelId, 'voice.participant_unmuted', {
      channelId,
      userId: targetUserId,
    });
  }

  /**
   * §4 D54 (Sprint R19) — kanal ayarı (ageGated/mediaEnabled) değiştiğinde O AN bağlı olan
   * katılımcıların LiveKit izinleri tazelenir. Öncesinde değişiklik yalnız yeniden bağlanınca
   * (bir sonraki mintToken) geçerli oluyordu — ayar SIKILAŞTIĞINDA (örn. mediaEnabled kapandı)
   * bu gecikme T&S açığı: kamera zaten açık kullanıcı ayar kapandıktan sonra da yayına devam
   * ederdi. Çağıran (ChannelsService.update) yalnız GUILD_VOICE + ilgili alan fiilen değiştiyse
   * çağırır — bu metodun kendisi koşulsuz TÜM bağlı katılımcıları tazeler.
   *
   * Best-effort + hata toleranslı (contract §4): N katılımcı = N bağımsız deneme; biri patlarsa
   * diğerleri sürer (`Promise.all` + katılımcı başına try/catch — D54'te tek bir kullanıcının
   * hatası diğerlerini düşürmesin talebi burada karşılanır, `moveParticipant`'taki N-katılımcı
   * desenlerinden farklı olarak per-item hata yutma).
   *
   * Zaten sunucu-susturulmuş (VoiceMute) katılımcıya `canPublishSources` YAZILMAZ — yalnız
   * `canPublish:false` yeniden onaylanır (muteParticipant deseni, §0 tuzağı: `canPublish:false`
   * iken kaynak listesinin içeriği LiveKit'te etkisiz). Track'leri zaten `muteParticipant`te
   * kesilmişti; burada tekrar dokunmaya gerek yok.
   *
   * Susturulmamış katılımcı için: `resolveCanPublishSources` (R17 §2 paylaşılan hesap) yeni izni
   * hesaplar VE `forceMuteTracks` — §2'nin AYNI §0 kusuru burada da geçerli olduğundan — yeni
   * kaynak listesinde ARTIK yer almayan, halihazırda yayında olan track'i (örn. mediaEnabled
   * kapanınca canlı kamera) zorla keser. Kaynaklar genişlediyse (ayar gevşetildi) filtre hiçbir
   * track'i eşlemez — o zaman kesecek bir şey yok, istemci kendi kararıyla yeniden yayın açar.
   */
  async refreshChannelPermissions(channelId: string): Promise<void> {
    if (!this.roomService) return;

    let channel: Awaited<ReturnType<typeof this.requireGuildVoiceChannel>>;
    try {
      channel = await this.requireGuildVoiceChannel(channelId);
    } catch {
      return; // kanal yok / GUILD_VOICE değil → tazelenecek bir şey yok
    }

    let participants: Awaited<ReturnType<RoomServiceClient['listParticipants']>>;
    try {
      participants = await this.roomService.listParticipants(channelId);
    } catch {
      return; // oda henüz açılmadı / LiveKit erişilemez
    }

    await Promise.all(
      participants.map(async (p) => {
        try {
          const muted = await this.isVoiceMuted(channelId, p.identity);
          if (muted) {
            await this.roomService!.updateParticipant(channelId, p.identity, undefined, {
              canPublish: false,
              canSubscribe: true,
              canPublishData: false,
            });
            return; // track'leri zaten muteParticipant'ta kesilmişti
          }

          const canPublish = await this.resolveCanPublish(p.identity, channel.guildId);
          const canPublishSources = await this.resolveCanPublishSources(
            p.identity,
            { ...channel, type: 'GUILD_VOICE' },
            null, // GUILD_VOICE — DM diğer-üye kavramı yok
          );
          await this.roomService!.updateParticipant(channelId, p.identity, undefined, {
            canPublish,
            canSubscribe: true,
            canPublishData: false,
            canPublishSources,
          });

          // Ayar sıkılaştıysa zaten yayında olan (artık izinli olmayan) track'i zorla kes.
          await this.forceMuteTracks(
            channelId,
            p.identity,
            (source) => !canPublishSources.includes(source),
          );
        } catch {
          // bir katılımcının hatası diğerlerini düşürmesin (contract §4)
        }
      }),
    );
  }

  /**
   * R11 — Taşı (tam taşı). Yetki: MOVE_MEMBERS. Kaynak+hedef aynı guild GUILD_VOICE; hedef doluysa
   * CHANNEL_FULL (R10 deseni); same/owner/self bloğu. Sunucu kaynaktan çıkarır + yalnız taşınan kullanıcıya
   * socket → istemci hedefe katılır.
   */
  async moveParticipant(
    actorId: string,
    channelId: string,
    targetUserId: string,
    targetChannelId: string,
  ): Promise<void> {
    this.assertEnabled();
    const source = await this.requireGuildVoiceChannel(channelId);
    await this.requireGuildPermission(actorId, source.guildId, 'MOVE_MEMBERS');

    if (targetChannelId === channelId) {
      throw new BadRequestException({
        message: 'Kullanıcı zaten bu kanalda.',
        error: 'SAME_CHANNEL',
      });
    }
    if (targetUserId === actorId) {
      throw new BadRequestException({
        message: 'Kendini taşıyamazsın.',
        error: 'CANNOT_MOVE_SELF',
      });
    }

    // Hedef kanal: var mı + aynı guild + GUILD_VOICE (ageGated + guild.adultsOnly invariant için de fetch et)
    const target = await this.prisma.channel.findFirst({
      where: { id: targetChannelId, deletedAt: null },
      select: {
        id: true,
        type: true,
        guildId: true,
        userLimit: true,
        ageGated: true,
        guild: { select: { adultsOnly: true } },
      },
    });
    if (!target || target.guildId !== source.guildId) {
      throw new BadRequestException({
        message: 'Hedef kanal bulunamadı.',
        error: 'CHANNEL_NOT_FOUND',
      });
    }
    if (target.type !== 'GUILD_VOICE') {
      throw new BadRequestException({
        message: 'Hedef bir ses kanalı değil.',
        error: 'NOT_VOICE_CHANNEL',
      });
    }

    // C7 §D — Yetki-baypas invariant'ı: minör → 18+ hedef bağlam → ret (koşulsuz kemer).
    // R11 moveParticipant hiçbir yetkiyle bir minörü ageGated/adultsOnly bağlama yerleştiremez.
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { isMinor: true },
    });
    if (targetUser?.isMinor) {
      const isAgeRestricted = target.ageGated || target.guild?.adultsOnly === true;
      if (isAgeRestricted) {
        throw new ForbiddenException({
          message: 'Minör kullanıcı 18+ bağlama taşınamaz.',
          error: 'AGE_RESTRICTED',
        });
      }
    }

    await this.requireTargetNotOwner(
      source.guildId,
      targetUserId,
      'CANNOT_MOVE_OWNER',
      'Ortam sahibi taşınamaz.',
    );

    // R10 deseni — hedef doluluk (taşınan kullanıcı hedefte zaten yoksa sayılır). LiveKit erişilemezse geç.
    if (target.userLimit > 0 && this.roomService) {
      let participants: Awaited<ReturnType<RoomServiceClient['listParticipants']>> | null = null;
      try {
        participants = await this.roomService.listParticipants(targetChannelId);
      } catch {
        participants = null; // oda yok / LiveKit erişilemez → güvenli taraf: limiti uygulama
      }
      if (participants && !participants.some((p) => p.identity === targetUserId)) {
        if (participants.length >= target.userLimit) {
          throw new ForbiddenException({
            message: 'Hedef ses kanalı dolu.',
            error: 'CHANNEL_FULL',
          });
        }
      }
    }

    // Kaynaktan çıkar — best-effort. İstemci socket ile hedefe katılır (yeni token mint → mute/karantina yeniden uygulanır).
    if (this.roomService) {
      try {
        await this.roomService.removeParticipant(channelId, targetUserId);
      } catch {
        // bağlı değil / oda yok → yine de yönlendirme event'i gider
      }
    }

    this.realtime.emitToUsers([targetUserId], 'voice.moved', {
      fromChannelId: channelId,
      toChannelId: targetChannelId,
    });
  }

  /**
   * B2 (R11B) — Yayın-durdur. Yetki: MUTE_MEMBERS. GUILD_VOICE + owner/self bloğu. (R7)
   * Etki: video/ekran kaynakları düşer, SES KALIR (canPublish false YAPILMAZ — sustur'dan farkı bu).
   * Kalıcılık YOK — tek-seferlik. Hedef yeniden yayın açabilir; tekrar sorunsa mod sustur'a yükseltir.
   * Re-mint davranışı: hedefin sonraki token mint'inde (TTL≤10dk / reconnect) resolveVideoSources yeniden
   * değerlendirir → bağlam hâlâ izinliyse video geri gelebilir. Yani yayın-durdur anlık + ≤TTL pencere;
   * kalıcı engel = sustur.
   */
  async stopBroadcast(actorId: string, channelId: string, targetUserId: string): Promise<void> {
    this.assertEnabled();
    const channel = await this.requireGuildVoiceChannel(channelId);
    await this.requireGuildPermission(actorId, channel.guildId, 'MUTE_MEMBERS');

    if (targetUserId === actorId) {
      throw new BadRequestException({
        message: 'Kendi yayınını bu komutla durduramazsın.',
        error: 'CANNOT_STOP_SELF',
      });
    }
    await this.requireTargetNotOwner(
      channel.guildId,
      targetUserId,
      'CANNOT_STOP_OWNER',
      'Ortam sahibinin yayını durdurulamaz.',
    );

    // LiveKit: yalnız video/ekran kaynakları düşür — ses (microphone) KALIR.
    // canPublish false YAPILMAZ; bu sustur'dan temel fark.
    if (this.roomService) {
      try {
        await this.roomService.updateParticipant(channelId, targetUserId, undefined, {
          canPublishSources: [TrackSource.MICROPHONE],
          canSubscribe: true,
          canPublishData: false,
        });
      } catch {
        // Katılımcı bağlı değil / LiveKit erişilemez → best-effort (R11 deseni)
      }
    }

    // §2 (Sprint R19, §0 kusuru) — yukarıdaki updateParticipant yalnız GELECEKTEKİ publish
    // izinlerini keser; hedef ZATEN kamera/ekran yayınlıyorsa o track'ler bu çağrıyla kesilmez.
    // Yalnız mikrofon-DIŞI kaynakları zorla sustur — ses (mikrofon) KALIR, sustur'dan fark bu.
    await this.forceMuteTracks(
      channelId,
      targetUserId,
      (source) => source !== TrackSource.MICROPHONE,
    );

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'voice.stop_broadcast',
        entityType: 'channel',
        entityId: channelId,
        metadata: { guildId: channel.guildId, targetUserId },
      },
    });

    this.realtime.emitToRoom(channelId, 'voice.broadcast_stopped', {
      channelId,
      userId: targetUserId,
    });
    this.realtime.emitToVoicePresence(channelId, 'voice.broadcast_stopped', {
      channelId,
      userId: targetUserId,
    });
  }

  /**
   * B3 (R11B) — Odadan-çıkar. Yetki: MOVE_MEMBERS. GUILD_VOICE + owner/self bloğu. (R7)
   * Etki: hedef ses oturumundan düşer. Ortam üyeliğine DOKUNULMAZ (rejoin edebilir).
   * Kalıcı = guild kick/ban ayrı aksiyon. Best-effort (R11 deseni).
   */
  async disconnectParticipant(
    actorId: string,
    channelId: string,
    targetUserId: string,
  ): Promise<void> {
    this.assertEnabled();
    const channel = await this.requireGuildVoiceChannel(channelId);
    await this.requireGuildPermission(actorId, channel.guildId, 'MOVE_MEMBERS');

    if (targetUserId === actorId) {
      throw new BadRequestException({
        message: 'Kendini odadan çıkaramazsın.',
        error: 'CANNOT_DISCONNECT_SELF',
      });
    }
    await this.requireTargetNotOwner(
      channel.guildId,
      targetUserId,
      'CANNOT_DISCONNECT_OWNER',
      'Ortam sahibi odadan çıkarılamaz.',
    );

    // LiveKit: katılımcıyı oturumdan düşür — best-effort.
    if (this.roomService) {
      try {
        await this.roomService.removeParticipant(channelId, targetUserId);
      } catch {
        // Bağlı değil / LiveKit erişilemez → sessiz geç
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'voice.disconnect',
        entityType: 'channel',
        entityId: channelId,
        metadata: { guildId: channel.guildId, targetUserId },
      },
    });

    // voice.participant_left webhook LiveKit tarafından otomatik yayılır.
    // Ek olarak istemciye "moderatör tarafından çıkarıldın" sinyali gönderilir.
    this.realtime.emitToRoom(channelId, 'voice.kicked', { channelId, userId: targetUserId });
  }

  /**
   * A4 — Acil çıkış: kullanıcıyı KENDİ isteğiyle LiveKit odasından çeker. **Yetki kontrolü YOK**
   * (self-initiated; panik butonu). Best-effort: roomService yoksa / bağlı değilse sessiz geç.
   * VoiceSession kaydı LiveKit `participant_left` webhook'uyla temizlenir (mevcut akış). (A4 — R7)
   */
  async pullSelfFromVoice(channelId: string, userId: string): Promise<void> {
    if (!this.roomService) return;
    try {
      await this.roomService.removeParticipant(channelId, userId);
    } catch {
      // bağlı değil / oda yok → best-effort (rapor pull'a bağlı DEĞİL — emergency.service sırası)
    }
  }

  /**
   * A4 — Acil snapshot bağlamı: kanaldaki aktif katılımcılar + yayıncılar (kamera/ekran). **METADATA-only**
   * (kimlik listesi + yayın durumu; canlı AV/içerik DEĞİL). LiveKit erişilemezse VoiceSession'a (leftAt null)
   * düşer, yayıncı = []. İnceleyenin bağlamı görmesi için; hukuk-gated içerik-kanıtı DEĞİL (A4 §0.4).
   */
  async captureVoiceContext(
    channelId: string,
  ): Promise<{ participants: string[]; broadcasters: { userId: string; sources: string[] }[] }> {
    if (this.roomService) {
      try {
        const parts = await this.roomService.listParticipants(channelId);
        // Yayıncı = kamera veya ekran track'i olan katılımcı; hangi track(ler) açık → inceleyene "kime bak".
        const broadcasters = parts
          .map((p) => {
            const sources = [
              ...new Set(
                (p.tracks ?? [])
                  .filter(
                    (t) => t.source === TrackSource.CAMERA || t.source === TrackSource.SCREEN_SHARE,
                  )
                  .map((t) => (t.source === TrackSource.CAMERA ? 'camera' : 'screen')),
              ),
            ];
            return { userId: p.identity, sources };
          })
          .filter((b) => b.sources.length > 0);
        return { participants: parts.map((p) => p.identity), broadcasters };
      } catch {
        // LiveKit erişilemez → VoiceSession'a düş
      }
    }
    const sessions = await this.prisma.voiceSession.findMany({
      where: { channelId, leftAt: null },
      select: { userId: true },
    });
    return { participants: sessions.map((s) => s.userId), broadcasters: [] };
  }

  /**
   * C10 — Kart ses durumu için CANLI katılım doğrulaması. **Yalnız LiveKit**; VoiceSession'a DÜŞMEZ.
   * LiveKit erişilemez/hatalıysa `null` → çağıran "doğrulanamadı" kabul eder ve ifşa etmez (fail-closed).
   * Bu ayrım kritik: VoiceSession dev'de (webhook localhost'a ulaşmaz) ve prod'da (kaçan webhook) bayat
   * kalabilir → ona dayanıp "sesli aramada" göstermek yanlış-pozitif konum ifşasıdır.
   */
  async getLiveParticipation(
    channelId: string,
    userId: string,
  ): Promise<{ present: boolean; streaming: boolean; video: boolean } | null> {
    if (!this.roomService) return null;
    try {
      const parts = await this.roomService.listParticipants(channelId);
      const p = parts.find((x) => x.identity === userId);
      if (!p) return { present: false, streaming: false, video: false };
      const sources = new Set((p.tracks ?? []).map((t) => t.source));
      return {
        present: true,
        streaming: sources.has(TrackSource.SCREEN_SHARE),
        video: sources.has(TrackSource.CAMERA),
      };
    } catch {
      return null; // LiveKit erişilemez → doğrulanamadı (bayat kayda düşme)
    }
  }

  /**
   * R11 — kanal GUILD_VOICE mı + guildId güvence. Değilse NOT_VOICE_CHANNEL/CHANNEL_NOT_FOUND.
   * R17 §2 — ageGated/mediaEnabled/guild.adultsOnly da seçilir: unmuteParticipant bu alanları
   * resolveCanPublishSources'a (VideoSourceChannel) geçirmek için kullanır; diğer çağıranlar
   * (muteParticipant/stopBroadcast/disconnectParticipant/moveParticipant) yalnız guildId okur,
   * ekstra alanlar zararsız — tek select, tek doğruluk kaynağı.
   */
  private async requireGuildVoiceChannel(channelId: string): Promise<{
    id: string;
    guildId: string;
    ageGated: boolean;
    mediaEnabled: boolean;
    guild: { adultsOnly: boolean } | null;
  }> {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, deletedAt: null },
      select: {
        id: true,
        type: true,
        guildId: true,
        ageGated: true,
        mediaEnabled: true,
        guild: { select: { adultsOnly: true } },
      },
    });
    if (!channel) {
      throw new BadRequestException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }
    if (channel.type !== 'GUILD_VOICE' || !channel.guildId) {
      throw new BadRequestException({
        message: 'Bu bir ses kanalı değil.',
        error: 'NOT_VOICE_CHANNEL',
      });
    }
    return {
      id: channel.id,
      guildId: channel.guildId,
      ageGated: channel.ageGated ?? false,
      mediaEnabled: channel.mediaEnabled ?? false,
      guild: channel.guild ?? null,
    };
  }

  /** R11 — yetki kapısı (owner/ADMIN örtük geçer). Yetkisiz → 403 FORBIDDEN. */
  private async requireGuildPermission(
    actorId: string,
    guildId: string,
    permission: 'MUTE_MEMBERS' | 'MOVE_MEMBERS',
  ): Promise<void> {
    const allowed = await this.permissions.hasGuildPermission(actorId, guildId, permission);
    if (!allowed) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkin yok.', error: 'FORBIDDEN' });
    }
  }

  /** R11 — hedef kullanıcı OWNER ise blok (GuildMember.role === 'OWNER'). */
  private async requireTargetNotOwner(
    guildId: string,
    targetUserId: string,
    errorCode: string,
    message: string,
  ): Promise<void> {
    const member = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: targetUserId } },
      select: { role: true },
    });
    if (member?.role === 'OWNER') {
      throw new ForbiddenException({ message, error: errorCode });
    }
  }

  /**
   * Ses yayını izni. Ses-mic karantinası KALDIRILDI (2026-06-19): davetle gelen meşru üye
   * sese girince ANINDA konuşabilsin (24s susturma kötü ilk-deneyim yaratıyordu). İstismar
   * TEPKİSEL araçlarla yönetilir (server-mute / kick / MUTE_MEMBERS — R11). Çocuk-güvenliği
   * kapıları BAĞIMSIZ korunur: kamera/ekran → resolveVideoSources (adultsOnly/ageGated/bayrak/minör);
   * yabancıya DM/arkadaşlık → quarantineHours (orada proaktif koruma haklı). Kalan tek kısıt:
   * üyelik var olmalı (erişim kapısı geçti ama üyelik yoksa güvenli taraf — server-mute call-site'ta).
   */
  private async resolveCanPublish(userId: string, guildId: string | null): Promise<boolean> {
    if (!guildId) return true; // DM/grup — guild karantinası yok
    const member = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { userId: true },
    });
    return !!member;
  }

  /**
   * R10 — GUILD_VOICE kullanıcı limiti. userLimit=0 → sınırsız (kontrol yok).
   * Sıra: zaten-katılımcı (yeniden bağlanma) → bypass (MANAGE_CHANNELS, owner/admin örtük) → doluluk.
   * LiveKit erişilemezse (roomService null / hata) join'i engelleme — ses zaten çalışmaz.
   */
  private async enforceUserLimit(
    userId: string,
    channelId: string,
    userLimit: number,
    guildId: string | null,
  ): Promise<void> {
    if (!(userLimit > 0) || !this.roomService) return;

    let participants: Awaited<ReturnType<RoomServiceClient['listParticipants']>>;
    try {
      participants = await this.roomService.listParticipants(channelId);
    } catch {
      // Oda henüz açılmadı / LiveKit erişilemez → güvenli taraf: limiti uygulama
      return;
    }

    // Yeniden bağlanma / token tazeleme: zaten içeride olan kullanıcı limitten muaf
    if (participants.some((p) => p.identity === userId)) return;

    // Yetkili bypass (owner/admin örtük geçer).
    // B1 (R11B): MUTE_MEMBERS de bypass yapar — mod dolu kanala teftiş için girebilir.
    if (guildId) {
      const bypassManage = await this.permissions.hasGuildPermission(
        userId,
        guildId,
        'MANAGE_CHANNELS',
      );
      if (bypassManage) return;
      const bypassMute = await this.permissions.hasGuildPermission(userId, guildId, 'MUTE_MEMBERS');
      if (bypassMute) return;
    }

    if (participants.length >= userLimit) {
      throw new ForbiddenException({ message: 'Bu ses kanalı dolu.', error: 'CHANNEL_FULL' });
    }
  }

  /**
   * DM/grup sesli arama kapısı (R7). Block her zaman; 1-1'de ilişki re-check (canDm).
   * Kurul: token mint'te gate tekrar (block/ilişki değişmiş olabilir). Jenerik DM_NOT_ALLOWED (sızıntı yok).
   */
  private async requireDmCallGate(userId: string, channelId: string, type: 'DM' | 'GROUP_DM') {
    await this.membership.requireNoDmBlock(userId, channelId);
    if (type === 'DM') {
      // C9: bekleyen mesaj isteği kanalında arama yok (kabul edilene dek).
      const ch = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { dmRequestStatus: true },
      });
      if (ch?.dmRequestStatus === 'PENDING') {
        throw new ForbiddenException({
          message: 'Bu kişiyle sesli görüşemezsin.',
          error: 'DM_NOT_ALLOWED',
        });
      }
      const other = await this.otherDmMember(channelId, userId);
      if (other) {
        const res = await this.dmPermission.canDm(userId, other);
        if (!res.allowed) {
          throw new ForbiddenException({
            message: 'Bu kişiyle sesli görüşemezsin.',
            error: 'DM_NOT_ALLOWED',
          });
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
   * R16 §2 — `mutedUserIds` eklendi (`VoiceMute` tablosu, kalıcı kayıt — LiveKit room state'inden
   * BAĞIMSIZ). Yalnız GUILD_VOICE'ta anlamlı; DM/GROUP_DM'de VoiceMute hiç yazılmaz → her zaman [].
   * Var olan alanların şekli (startedAt/participants) DEĞİŞMEDİ — yalnız yeni alan eklendi.
   */
  async listParticipants(userId: string, channelId: string) {
    this.assertEnabled();
    const channel = await this.membership.requireChannelAccess(userId, channelId);
    // REV-11: ses GUILD_VOICE + DM + GROUP_DM'de olabilir (devam eden çağrı tespiti).
    // GUILD_TEXT vb. ses barındırmaz → NOT_VOICE_CHANNEL.
    const voiceCapable = this.isVoiceCapable(channel.type);
    if (!voiceCapable) {
      throw new BadRequestException({
        message: 'Bu bir ses kanalı değil.',
        error: 'NOT_VOICE_CHANNEL',
      });
    }

    // R16 §2 — kalıcı susturma kaydı, LiveKit room state'inden ayrı sorgu (oda kapalıyken/hata
    // durumunda da doğru dönmesi için try/catch DIŞINDA hesaplanır).
    const mutedUserIds = await this.getMutedUserIds(channel.type, channelId);

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
        mutedUserIds,
      };
    } catch {
      // Oda henüz açılmadıysa LiveKit hata döndürür → boş katılımcı listesi; mute kaydı yine dönsün.
      return { startedAt: null, participants: [], mutedUserIds };
    }
  }

  /** R16 §2 — kanaldaki kalıcı susturulmuş kullanıcı id'leri. Yalnız GUILD_VOICE'ta VoiceMute var. */
  private async getMutedUserIds(channelType: string, channelId: string): Promise<string[]> {
    if (channelType !== 'GUILD_VOICE') return [];
    const mutes = await this.prisma.voiceMute.findMany({
      where: { channelId },
      select: { userId: true },
    });
    return mutes.map((m) => m.userId);
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
            await this.onParticipantJoined(
              room,
              participant.identity,
              participant.name,
              participant.metadata,
            );
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

  /**
   * İdempotent açık VoiceSession kaydı. mintToken (katılım anı) + webhook (onParticipantJoined) ORTAK kullanır.
   * Webhook localhost'a ulaşamasa da (dev) kayıt mint'te oluşur → acil bağlam (channelId) çözümü güvenilir,
   * prod'da webhook gecikmesine dayanıklı. Açık session zaten varsa no-op (çift kayıt yok).
   */
  private async ensureOpenVoiceSession(channelId: string, userId: string): Promise<void> {
    const open = await this.prisma.voiceSession.findFirst({
      where: { channelId, userId, leftAt: null },
      select: { id: true },
    });
    if (!open) {
      await this.prisma.voiceSession.create({ data: { channelId, userId } });
    }
  }

  private async onParticipantJoined(
    channelId: string,
    userId: string,
    name: string | undefined,
    metadata: string | undefined,
  ) {
    // İdempotent kayıt — mintToken (katılım anı) ile ortak; çift joined'i yok sayar.
    await this.ensureOpenVoiceSession(channelId, userId);

    const payload = {
      channelId,
      participant: {
        userId,
        username: name || userId,
        avatarUrl: this.parseAvatar(metadata),
      },
    };
    // room: bağlı oda üyeleri · voice: sidebar gözlemcileri (canlı gir/çık)
    this.realtime.emitToRoom(channelId, 'voice.participant_joined', payload);
    this.realtime.emitToVoicePresence(channelId, 'voice.participant_joined', payload);
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
    this.realtime.emitToVoicePresence(channelId, 'voice.participant_left', { channelId, userId });
  }

  /** Ses barındırabilen kanal türü mü (GUILD_VOICE + DM + GROUP_DM). */
  private isVoiceCapable(type: string): boolean {
    return type === 'GUILD_VOICE' || type === 'DM' || type === 'GROUP_DM';
  }

  /**
   * Dev-fix: istemci tarafından tetiklenen ayrılış sinyali.
   * LiveKit webhook localhost'a ulaşamadığında frontend mintToken'dan sonra bu endpoint'i çağırır.
   * VoiceSession'a DOKUNMAZ — webhook/room_finished kayıt kaynağı olarak kalır.
   * Idempotent: üye yoksa bile zararsızca yayar.
   */
  async announceLeave(userId: string, channelId: string): Promise<void> {
    // GUILD_VOICE + DM + GROUP_DM: DM/grup çağrı presence'ı da yayılır (localhost; REV-11 —
    // aksi halde "Sese katıl" herkes çıktıktan sonra takılı kalır).
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, deletedAt: null },
      select: { type: true },
    });
    if (!channel || !this.isVoiceCapable(channel.type)) return;

    const payload = { channelId, userId };
    this.realtime.emitToRoom(channelId, 'voice.participant_left', payload);
    this.realtime.emitToVoicePresence(channelId, 'voice.participant_left', payload);
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
