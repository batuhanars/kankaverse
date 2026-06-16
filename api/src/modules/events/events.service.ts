import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { StorageService } from '../../shared/storage/storage.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { GuildEvent, ScanStatus } from '@prisma/client';
import { computeOccurrence } from './occurrence.util';

/**
 * EventDto (Sözleşme §3 — Etkinlik Motoru). status + occurrence TÜRETİLİR
 * (computeOccurrence saf util; tek kaynak). startAt/endAt ÇAPA olarak korunur;
 * occurrenceStartAt/occurrenceEndAt ilgili (şu an süren / sonraki) örneği taşır.
 * status artık ACTIVE'i de türetir. DB status kolonu okunmaz/yazılmaz (forward-compat).
 * coverImageUrl: kapak görselinin kısa-ömürlü presigned GET URL'i (yalnız CLEAN; aksi null).
 * SYNC kalır (occurrence sync) — URL servis tarafında ÖNCEDEN çözülüp param olarak geçilir.
 */
export function toEventDto(
  event: GuildEvent & { channel?: { name: string | null } | null },
  interestedCount: number,
  interestedByMe: boolean,
  coverImageUrl: string | null = null,
) {
  const occ = computeOccurrence(
    { startAt: event.startAt, endAt: event.endAt, recurrence: event.recurrence },
    new Date(),
  );
  return {
    id: event.id,
    guildId: event.guildId,
    creatorId: event.creatorId,
    name: event.name,
    description: event.description,
    locationType: event.locationType,
    channelId: event.channelId,
    channelName: event.channel?.name ?? null, // voice ise çözülür
    externalLocation: event.externalLocation,
    startAt: event.startAt, // ÇAPA
    endAt: event.endAt, // ÇAPA (tek örnek süresi)
    occurrenceStartAt: occ.occurrenceStartAt, // ilgili örnek
    occurrenceEndAt: occ.occurrenceEndAt,
    recurrence: event.recurrence,
    status: occ.status,
    interestedCount,
    interestedByMe,
    coverImageUrl, // yalnız CLEAN'de dolu (resolveCoverUrl); aksi null
    createdAt: event.createdAt,
  };
}

type EventWithChannel = GuildEvent & { channel: { name: string | null } | null };

@Injectable()
export class EventsService {
  // ATTACHMENT_SCAN_ENABLED=false (dev) → kapak iliştirmede CLEAN; true (prod, R5) → PENDING.
  // messages.service deseniyle birebir (T&S: kapak = mesaj-eki ile aynı scan hattı).
  private readonly scanEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private permissions: PermissionsService,
    private realtime: RealtimeService,
    private config: ConfigService,
    private storage: StorageService,
  ) {
    this.scanEnabled = config.get<boolean>('attachmentScanEnabled') ?? false;
  }

  /** MANAGE_EVENTS iznini kontrol et; yoksa 403 FORBIDDEN. */
  private async requireManageEvents(userId: string, guildId: string): Promise<void> {
    const allowed = await this.permissions.hasGuildPermission(userId, guildId, 'MANAGE_EVENTS');
    if (!allowed) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // KAPAK GÖRSELİ — mevcut scan-gated Attachment hattı (T&S kilitli §2-§3)
  // Yeni public/baypas yol AÇILMAZ — mesaj-eki ile birebir aynı seviye/kural.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Kapak iliştirme doğrulaması + scan-gate (messages.service attach deseni birebir).
   *  - Attachment var mı (yoksa INVALID_COVER_IMAGE 400)
   *  - uploaderId === userId (başkasının ek'i değil → INVALID_COVER_IMAGE)
   *  - contentType image/* (değilse INVALID_COVER_TYPE 400)
   *  - messageId === null (başka mesaja bağlanmamış → INVALID_COVER_IMAGE)
   * Sonra scanStatus = scanEnabled ? PENDING : CLEAN (messageId NULL kalır; claim = event.coverImageId).
   */
  private async attachCover(coverImageId: string, userId: string): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: coverImageId },
      select: { id: true, uploaderId: true, contentType: true, messageId: true },
    });

    if (!attachment) {
      throw new BadRequestException({ message: 'Geçersiz kapak görseli.', error: 'INVALID_COVER_IMAGE' });
    }
    if (attachment.uploaderId !== userId) {
      throw new BadRequestException({ message: 'Geçersiz kapak görseli.', error: 'INVALID_COVER_IMAGE' });
    }
    if (!attachment.contentType.startsWith('image/')) {
      throw new BadRequestException({ message: 'Kapak görseli bir resim olmalıdır.', error: 'INVALID_COVER_TYPE' });
    }
    if (attachment.messageId !== null) {
      throw new BadRequestException({ message: 'Geçersiz kapak görseli.', error: 'INVALID_COVER_IMAGE' });
    }

    // scan-gate: dev (false) → CLEAN; prod/gelecek (true) → PENDING → tarama servisi (R5)
    const newScanStatus: ScanStatus = this.scanEnabled ? ScanStatus.PENDING : ScanStatus.CLEAN;
    await this.prisma.attachment.update({
      where: { id: coverImageId },
      data: { scanStatus: newScanStatus }, // messageId null kalır (kapak mesaj değil)
    });
  }

  /**
   * Kapak görseli URL'ini çöz (§3): yalnız scanStatus === CLEAN ise presigned GET (300s).
   * PENDING/FLAGGED/yok → null (taranmamış görsel servis edilmez — serve kapısıyla aynı kural).
   */
  private async resolveCoverUrl(coverImageId: string | null): Promise<string | null> {
    if (!coverImageId) return null;
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: coverImageId },
      select: { storageKey: true, scanStatus: true },
    });
    if (!attachment || attachment.scanStatus !== ScanStatus.CLEAN) return null;
    return this.storage.presignGet(attachment.storageKey);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GÖRÜNÜRLÜK — TEK CHOKE-POINT (Sözleşme §5, R7-hafif)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Bir etkinliği viewer GÖREBİLİR Mİ? Fail-closed.
   *  - VOICE_CHANNEL: MembershipService.requireChannelAccess(viewer, channelId) MİRASI.
   *    → yaş/adultsOnly/özel kanal süzme otomatik gelir (minör 18+ kanal etkinliğini görmez).
   *    Kanal silinmiş/yok (channelId null) → görünmez.
   *  - EXTERNAL: tüm guild üyeleri (kanal kapısı yok).
   * Erişim yoksa `false` döner (sebep SIZMAZ — çağıran jenerik 404 verir).
   */
  private async canViewEvent(viewerId: string, event: GuildEvent): Promise<boolean> {
    if (event.locationType === 'VOICE_CHANNEL') {
      if (!event.channelId) return false; // kanal SetNull oldu → fail-closed
      try {
        await this.membership.requireChannelAccess(viewerId, event.channelId);
        return true;
      } catch {
        return false; // yaş/özel/üyelik kapısı — sebep sızmaz
      }
    }
    // EXTERNAL → guild üyeliği yeterli
    try {
      await this.membership.requireGuildMembership(viewerId, event.guildId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Tek etkinlik erişim kapısı: görünmüyorsa jenerik 404 EVENT_NOT_FOUND
   * (minör statüsü / yaş sebebi sızmaz). Görünüyorsa event döner.
   */
  private async requireEventAccess(viewerId: string, eventId: string): Promise<EventWithChannel> {
    const event = (await this.prisma.guildEvent.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { channel: { select: { name: true } } },
    })) as EventWithChannel | null;
    if (!event) {
      throw new NotFoundException({ message: 'Etkinlik bulunamadı.', error: 'EVENT_NOT_FOUND' });
    }
    const visible = await this.canViewEvent(viewerId, event);
    if (!visible) {
      throw new NotFoundException({ message: 'Etkinlik bulunamadı.', error: 'EVENT_NOT_FOUND' });
    }
    return event;
  }

  /**
   * Guild'in viewer'a GÖRÜNÜR etkinliklerini döndürür (startAt artan).
   * Voice etkinlikleri requireChannelAccess süzmesinden geçer (minör/yaş/özel),
   * external'lar tüm üyelere açık.
   */
  private async findVisibleEvents(viewerId: string, guildId: string): Promise<EventWithChannel[]> {
    const events = (await this.prisma.guildEvent.findMany({
      where: { guildId, deletedAt: null },
      orderBy: { startAt: 'asc' },
      include: { channel: { select: { name: true } } },
    })) as EventWithChannel[];

    const flags = await Promise.all(events.map((e) => this.canViewEvent(viewerId, e)));
    return events.filter((_, i) => flags[i]);
  }

  /**
   * Bir etkinliği görebilecek üye id'lerini hesaplar (WS alıcıları — §7).
   *  - VOICE: kanal-erişimli guild üyeleri (requireChannelAccess süzmesi).
   *  - EXTERNAL: tüm guild üyeleri.
   * Sızıntı-güvenli: minör 18+ kanal etkinliği yayınını ALMAZ.
   */
  private async eventRecipients(event: GuildEvent): Promise<string[]> {
    const members = await this.prisma.guildMember.findMany({
      where: { guildId: event.guildId },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);

    if (event.locationType === 'EXTERNAL') return memberIds;

    if (!event.channelId) return [];
    const flags = await Promise.all(
      memberIds.map(async (uid) => {
        try {
          await this.membership.requireChannelAccess(uid, event.channelId!);
          return true;
        } catch {
          return false;
        }
      }),
    );
    return memberIds.filter((_, i) => flags[i]);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // İlgi sayaçları
  // ───────────────────────────────────────────────────────────────────────────

  private async interestInfo(eventId: string, viewerId: string): Promise<{ count: number; byMe: boolean }> {
    const [count, mine] = await Promise.all([
      this.prisma.guildEventInterest.count({ where: { eventId } }),
      this.prisma.guildEventInterest.findUnique({
        where: { eventId_userId: { eventId, userId: viewerId } },
      }),
    ]);
    return { count, byMe: mine !== null };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * POST /guilds/:id/events — MANAGE_EVENTS.
   * Doğrulama sırası: üyelik → MANAGE_EVENTS → konum/tarih → (voice) creator kanal erişimi.
   * R7: VOICE etkinlik oluştururken creator de requireChannelAccess geçmeli
   *     → minör 18+ kanalda etkinlik KURAMAZ (AGE_RESTRICTED propagate eder).
   */
  async create(userId: string, guildId: string, dto: CreateEventDto) {
    await this.membership.requireGuildMembership(userId, guildId);
    await this.requireManageEvents(userId, guildId);

    const startAt = new Date(dto.startAt);
    if (startAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        message: 'Etkinlik başlangıcı gelecekte olmalıdır.',
        error: 'EVENT_START_IN_PAST',
      });
    }

    let endAt: Date | null = null;
    if (dto.endAt) {
      endAt = new Date(dto.endAt);
      if (endAt.getTime() <= startAt.getTime()) {
        // endAt sırası — sözleşmede özel kod yok; jenerik 400 (BAD_REQUEST).
        throw new BadRequestException('Bitiş tarihi başlangıçtan sonra olmalıdır.');
      }
    }

    let channelId: string | null = null;
    let externalLocation: string | null = null;

    if (dto.locationType === 'VOICE_CHANNEL') {
      if (!dto.channelId) {
        throw new BadRequestException({ message: 'Ses kanalı seçilmelidir.', error: 'EVENT_LOCATION_REQUIRED' });
      }
      await this.validateVoiceChannel(dto.channelId, guildId);
      // R7: creator de kanala erişebilmeli (minör/yaş kapısı) — AGE_RESTRICTED propagate eder
      await this.membership.requireChannelAccess(userId, dto.channelId);
      channelId = dto.channelId;
    } else {
      // EXTERNAL
      if (!dto.externalLocation || dto.externalLocation.trim().length === 0) {
        throw new BadRequestException({ message: 'Konum belirtilmelidir.', error: 'EVENT_LOCATION_REQUIRED' });
      }
      externalLocation = dto.externalLocation;
    }

    // Kapak: verildiyse scan-gated Attachment hattıyla iliştir (doğrula + scanStatus)
    let coverImageId: string | null = null;
    if (dto.coverImageId) {
      await this.attachCover(dto.coverImageId, userId);
      coverImageId = dto.coverImageId;
    }

    const event = (await this.prisma.guildEvent.create({
      data: {
        guildId,
        creatorId: userId,
        name: dto.name,
        description: dto.description ?? null,
        locationType: dto.locationType,
        channelId,
        externalLocation,
        startAt,
        endAt,
        recurrence: dto.recurrence ?? 'NONE', // motor: NONE/DAILY/WEEKLY/MONTHLY
        coverImageId,
      },
      include: { channel: { select: { name: true } } },
    })) as EventWithChannel;

    const coverImageUrl = await this.resolveCoverUrl(event.coverImageId);
    const dtoOut = toEventDto(event, 0, false, coverImageUrl);
    const recipients = await this.eventRecipients(event);
    this.realtime.emitToUsers(recipients, 'guild.event_created', dtoOut);

    return dtoOut;
  }

  /**
   * GET /guilds/:id/events — üye + görünürlük (§4).
   * Görünürlük süzme ÖNCE; sonra **occurrenceStartAt artan** sıralama (çapa değil —
   * tekrarlayan seriler ilgili örnek zamanına göre dizilir). computeOccurrence tek kaynak.
   */
  async findByGuild(userId: string, guildId: string) {
    await this.membership.requireGuildMembership(userId, guildId);
    const events = await this.findVisibleEvents(userId, guildId);

    const now = new Date();
    const sorted = [...events].sort((a, b) => {
      const oa = computeOccurrence({ startAt: a.startAt, endAt: a.endAt, recurrence: a.recurrence }, now);
      const ob = computeOccurrence({ startAt: b.startAt, endAt: b.endAt, recurrence: b.recurrence }, now);
      return oa.occurrenceStartAt.getTime() - ob.occurrenceStartAt.getTime();
    });

    const [infos, coverUrls] = await Promise.all([
      Promise.all(sorted.map((e) => this.interestInfo(e.id, userId))),
      Promise.all(sorted.map((e) => this.resolveCoverUrl(e.coverImageId))),
    ]);
    return sorted.map((e, i) => toEventDto(e, infos[i].count, infos[i].byMe, coverUrls[i]));
  }

  /** GET /events/:id — üye + görünürlük. Görünmüyorsa jenerik 404. */
  async findOne(userId: string, eventId: string) {
    const event = await this.requireEventAccess(userId, eventId);
    const info = await this.interestInfo(event.id, userId);
    const coverImageUrl = await this.resolveCoverUrl(event.coverImageId);
    return toEventDto(event, info.count, info.byMe, coverImageUrl);
  }

  /** PATCH /events/:id — MANAGE_EVENTS. */
  async update(userId: string, eventId: string, dto: UpdateEventDto) {
    const existing = (await this.prisma.guildEvent.findFirst({
      where: { id: eventId, deletedAt: null },
    })) as GuildEvent | null;
    if (!existing) {
      throw new NotFoundException({ message: 'Etkinlik bulunamadı.', error: 'EVENT_NOT_FOUND' });
    }

    await this.membership.requireGuildMembership(userId, existing.guildId);
    await this.requireManageEvents(userId, existing.guildId);

    // Hedef konum türü (dto'da varsa onu, yoksa mevcut)
    const locationType = dto.locationType ?? existing.locationType;

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.recurrence !== undefined) data.recurrence = dto.recurrence;

    // Kapak semantiği (engine endAt deseni): undefined → değişmez · null → kaldır
    // (eski attachment'a dokunma, D13 temizliği ayrı) · string → attachCover + ata.
    if (dto.coverImageId !== undefined) {
      if (dto.coverImageId === null) {
        data.coverImageId = null;
      } else {
        await this.attachCover(dto.coverImageId, userId);
        data.coverImageId = dto.coverImageId;
      }
    }

    // startAt değişiyorsa geçmiş kontrolü
    let startAt = existing.startAt;
    if (dto.startAt !== undefined) {
      startAt = new Date(dto.startAt);
      if (startAt.getTime() <= Date.now()) {
        throw new BadRequestException({
          message: 'Etkinlik başlangıcı gelecekte olmalıdır.',
          error: 'EVENT_START_IN_PAST',
        });
      }
      data.startAt = startAt;
    }
    if (dto.endAt !== undefined) {
      if (dto.endAt === null) {
        data.endAt = null;
      } else {
        const endAt = new Date(dto.endAt);
        if (endAt.getTime() <= startAt.getTime()) {
          throw new BadRequestException('Bitiş tarihi başlangıçtan sonra olmalıdır.');
        }
        data.endAt = endAt;
      }
    }

    // Konum güncellemesi (locationType ya da channelId/externalLocation dokunulduysa)
    const locationTouched =
      dto.locationType !== undefined ||
      dto.channelId !== undefined ||
      dto.externalLocation !== undefined;

    if (locationTouched) {
      if (locationType === 'VOICE_CHANNEL') {
        const channelId = dto.channelId ?? existing.channelId;
        if (!channelId) {
          throw new BadRequestException({ message: 'Ses kanalı seçilmelidir.', error: 'EVENT_LOCATION_REQUIRED' });
        }
        await this.validateVoiceChannel(channelId, existing.guildId);
        await this.membership.requireChannelAccess(userId, channelId);
        data.locationType = 'VOICE_CHANNEL';
        data.channelId = channelId;
        data.externalLocation = null;
      } else {
        const externalLocation = dto.externalLocation ?? existing.externalLocation;
        if (!externalLocation || externalLocation.trim().length === 0) {
          throw new BadRequestException({ message: 'Konum belirtilmelidir.', error: 'EVENT_LOCATION_REQUIRED' });
        }
        data.locationType = 'EXTERNAL';
        data.externalLocation = externalLocation;
        data.channelId = null;
      }
    }

    const updated = (await this.prisma.guildEvent.update({
      where: { id: eventId },
      data,
      include: { channel: { select: { name: true } } },
    })) as EventWithChannel;

    const info = await this.interestInfo(updated.id, userId);
    const coverImageUrl = await this.resolveCoverUrl(updated.coverImageId);
    const dtoOut = toEventDto(updated, info.count, info.byMe, coverImageUrl);

    const recipients = await this.eventRecipients(updated);
    this.realtime.emitToUsers(recipients, 'guild.event_updated', dtoOut);

    return dtoOut;
  }

  /** DELETE /events/:id — MANAGE_EVENTS, soft-delete. → null */
  async remove(userId: string, eventId: string) {
    const existing = (await this.prisma.guildEvent.findFirst({
      where: { id: eventId, deletedAt: null },
    })) as GuildEvent | null;
    if (!existing) {
      throw new NotFoundException({ message: 'Etkinlik bulunamadı.', error: 'EVENT_NOT_FOUND' });
    }

    await this.membership.requireGuildMembership(userId, existing.guildId);
    await this.requireManageEvents(userId, existing.guildId);

    // Alıcıları silmeden ÖNCE hesapla (görünürlük)
    const recipients = await this.eventRecipients(existing);

    await this.prisma.guildEvent.update({
      where: { id: eventId },
      data: { deletedAt: new Date() },
    });

    this.realtime.emitToUsers(recipients, 'guild.event_deleted', {
      guildId: existing.guildId,
      eventId,
    });

    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // İlgi (interest) — her üye + görünürlük; idempotent
  // ───────────────────────────────────────────────────────────────────────────

  /** POST /events/:id/interest — idempotent upsert. → EventDto */
  async addInterest(userId: string, eventId: string) {
    const event = await this.requireEventAccess(userId, eventId);

    await this.prisma.guildEventInterest.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: {},
      create: { eventId, userId },
    });

    const info = await this.interestInfo(eventId, userId);
    const coverImageUrl = await this.resolveCoverUrl(event.coverImageId);
    return toEventDto(event, info.count, info.byMe, coverImageUrl);
  }

  /**
   * DELETE /events/:id/interest — idempotent. → EventDto
   * Sözleşme §4: yetki = "üye" (görünürlük ŞART DEĞİL). Kasıtlı: kullanıcı kanal
   * erişimini sonradan kaybetse bile kendi ilgisini her zaman geri çekebilmeli
   * (görünürlük kapısı koyarsak öksüz-ilgi tuzağı doğar). Event yoksa 404.
   */
  async removeInterest(userId: string, eventId: string) {
    const event = (await this.prisma.guildEvent.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { channel: { select: { name: true } } },
    })) as EventWithChannel | null;
    if (!event) {
      throw new NotFoundException({ message: 'Etkinlik bulunamadı.', error: 'EVENT_NOT_FOUND' });
    }
    await this.membership.requireGuildMembership(userId, event.guildId);

    await this.prisma.guildEventInterest.deleteMany({
      where: { eventId, userId },
    });

    const info = await this.interestInfo(eventId, userId);
    const coverImageUrl = await this.resolveCoverUrl(event.coverImageId);
    return toEventDto(event, info.count, info.byMe, coverImageUrl);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Yardımcılar
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Kanal var mı + aynı guild'e ait mi + GUILD_VOICE türünde mi.
   * Değilse 400 INVALID_EVENT_CHANNEL (text kanal / başka guild / silinmiş).
   */
  private async validateVoiceChannel(channelId: string, guildId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { type: true, guildId: true, deletedAt: true },
    });
    if (
      !channel ||
      channel.deletedAt !== null ||
      channel.guildId !== guildId ||
      channel.type !== 'GUILD_VOICE'
    ) {
      throw new BadRequestException({ message: 'Geçersiz ses kanalı.', error: 'INVALID_EVENT_CHANNEL' });
    }
  }
}
