import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';
import { computeOccurrence } from './occurrence.util';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  guildEvent: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  guildEventInterest: {
    count: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  guildMember: {
    findMany: jest.fn(),
  },
  channel: {
    findUnique: jest.fn(),
  },
  attachment: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const membershipMock = {
  requireGuildMembership: jest.fn(),
  requireChannelAccess: jest.fn(),
};

const permissionsMock = {
  hasGuildPermission: jest.fn(),
};

const realtimeMock = { emitToUser: jest.fn(), emitToUsers: jest.fn(), emitToRoom: jest.fn() };

// ConfigService mock — attachmentScanEnabled bayrağı (her testte override edilebilir)
const configMock = { get: jest.fn() };

// StorageService mock — presignGet (kapak URL çözümü)
const storageMock = { presignGet: jest.fn() };

function makeService() {
  return new EventsService(
    prismaMock as any,
    membershipMock as any,
    permissionsMock as any,
    realtimeMock as any,
    configMock as any,
    storageMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  permissionsMock.hasGuildPermission.mockResolvedValue(true);
  membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
  membershipMock.requireChannelAccess.mockResolvedValue(undefined);
  // İlgi sayaç varsayılanları
  prismaMock.guildEventInterest.count.mockResolvedValue(0);
  prismaMock.guildEventInterest.findUnique.mockResolvedValue(null);
  // WS alıcı sorgusu (varsayılan boş)
  prismaMock.guildMember.findMany.mockResolvedValue([]);
  // Kapak: varsayılan scan KAPALI; presignGet sabit URL döner
  configMock.get.mockReturnValue(false);
  storageMock.presignGet.mockResolvedValue('https://cdn.example/presigned-cover');
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const EVENT_ID = 'event-1';
const VOICE_CHANNEL_ID = 'voice-1';

const GUILD = { id: GUILD_ID, deletedAt: null };
const OWNER_MEMBERSHIP = { guildId: GUILD_ID, userId: USER_ID, role: 'OWNER' };

const FUTURE = new Date(Date.now() + 86_400_000); // +1 gün
const PAST = new Date(Date.now() - 86_400_000); // -1 gün

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EVENT_ID,
    guildId: GUILD_ID,
    creatorId: USER_ID,
    name: 'Oyun Gecesi',
    description: null,
    locationType: 'EXTERNAL',
    channelId: null,
    channel: null,
    externalLocation: 'Kadıköy',
    startAt: FUTURE,
    endAt: null,
    recurrence: 'NONE',
    status: 'SCHEDULED',
    coverImageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function voiceChannel(overrides: Partial<Record<string, unknown>> = {}) {
  return { type: 'GUILD_VOICE', guildId: GUILD_ID, deletedAt: null, ...overrides };
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE
// ────────────────────────────────────────────────────────────────────────────

describe('EventsService.create', () => {
  let service: EventsService;
  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('MANAGE_EVENTS yoksa → 403 FORBIDDEN', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    await expect(
      service.create(USER_ID, GUILD_ID, {
        name: 'X',
        locationType: 'EXTERNAL',
        externalLocation: 'Yer',
        startAt: FUTURE.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { error: 'FORBIDDEN' } });
  });

  it('EXTERNAL → oluşturur, externalLocation düz metin saklanır, WS event_created yayınlanır', async () => {
    const created = makeEvent();
    prismaMock.guildEvent.create.mockResolvedValue(created);
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: USER_ID }, { userId: 'u2' }]);

    const result = await service.create(USER_ID, GUILD_ID, {
      name: 'Oyun Gecesi',
      locationType: 'EXTERNAL',
      externalLocation: 'Kadıköy',
      startAt: FUTURE.toISOString(),
    });

    expect(prismaMock.guildEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationType: 'EXTERNAL',
          externalLocation: 'Kadıköy',
          channelId: null,
          recurrence: 'NONE',
        }),
      }),
    );
    expect(result).toMatchObject({ name: 'Oyun Gecesi', interestedCount: 0, interestedByMe: false });
    // EXTERNAL → tüm guild üyeleri alıcı
    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(
      [USER_ID, 'u2'],
      'guild.event_created',
      expect.objectContaining({ id: EVENT_ID }),
    );
  });

  it('EXTERNAL ama externalLocation boş → EVENT_LOCATION_REQUIRED', async () => {
    await expect(
      service.create(USER_ID, GUILD_ID, {
        name: 'X',
        locationType: 'EXTERNAL',
        startAt: FUTURE.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { error: 'EVENT_LOCATION_REQUIRED' } });
  });

  it('VOICE ama channelId yok → EVENT_LOCATION_REQUIRED', async () => {
    await expect(
      service.create(USER_ID, GUILD_ID, {
        name: 'X',
        locationType: 'VOICE_CHANNEL',
        startAt: FUTURE.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { error: 'EVENT_LOCATION_REQUIRED' } });
  });

  it('startAt geçmişte → EVENT_START_IN_PAST', async () => {
    await expect(
      service.create(USER_ID, GUILD_ID, {
        name: 'X',
        locationType: 'EXTERNAL',
        externalLocation: 'Yer',
        startAt: PAST.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { error: 'EVENT_START_IN_PAST' } });
  });

  it('VOICE: text kanal → INVALID_EVENT_CHANNEL', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(voiceChannel({ type: 'GUILD_TEXT' }));
    await expect(
      service.create(USER_ID, GUILD_ID, {
        name: 'X',
        locationType: 'VOICE_CHANNEL',
        channelId: VOICE_CHANNEL_ID,
        startAt: FUTURE.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_EVENT_CHANNEL' } });
  });

  it('VOICE: başka guild kanalı → INVALID_EVENT_CHANNEL', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(voiceChannel({ guildId: 'other-guild' }));
    await expect(
      service.create(USER_ID, GUILD_ID, {
        name: 'X',
        locationType: 'VOICE_CHANNEL',
        channelId: VOICE_CHANNEL_ID,
        startAt: FUTURE.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_EVENT_CHANNEL' } });
  });

  it('VOICE: creator minör 18+ kanalda → requireChannelAccess AGE_RESTRICTED propagate eder', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(voiceChannel());
    membershipMock.requireChannelAccess.mockRejectedValue(
      new ForbiddenException({ message: 'yaş', error: 'AGE_RESTRICTED' }),
    );
    await expect(
      service.create(USER_ID, GUILD_ID, {
        name: 'X',
        locationType: 'VOICE_CHANNEL',
        channelId: VOICE_CHANNEL_ID,
        startAt: FUTURE.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { error: 'AGE_RESTRICTED' } });
    expect(prismaMock.guildEvent.create).not.toHaveBeenCalled();
  });

  it('VOICE: geçerli kanal + creator erişimli → oluşturur, WS alıcıları kanal-erişimli üyeler', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(voiceChannel());
    const created = makeEvent({ locationType: 'VOICE_CHANNEL', channelId: VOICE_CHANNEL_ID, externalLocation: null, channel: { name: 'sesli' } });
    prismaMock.guildEvent.create.mockResolvedValue(created);
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: USER_ID }, { userId: 'minor-1' }]);
    // minor-1 kanala erişemez (yaş kapısı)
    membershipMock.requireChannelAccess.mockImplementation(async (uid: string) => {
      if (uid === 'minor-1') throw new ForbiddenException({ error: 'AGE_RESTRICTED' });
      return undefined;
    });

    const result = await service.create(USER_ID, GUILD_ID, {
      name: 'Sesli Etkinlik',
      locationType: 'VOICE_CHANNEL',
      channelId: VOICE_CHANNEL_ID,
      startAt: FUTURE.toISOString(),
    });

    expect(result).toMatchObject({ channelId: VOICE_CHANNEL_ID, channelName: 'sesli' });
    // minör süzüldü → yalnız creator alıcı
    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith([USER_ID], 'guild.event_created', expect.anything());
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GÖRÜNÜRLÜK (findByGuild + findOne) — minör/yaş süzme
// ────────────────────────────────────────────────────────────────────────────

describe('EventsService görünürlük (findVisibleEvents / requireEventAccess)', () => {
  let service: EventsService;
  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('voice ageGated etkinlik → minör görmez (listede süzülür)', async () => {
    const voiceEvent = makeEvent({ locationType: 'VOICE_CHANNEL', channelId: VOICE_CHANNEL_ID, channel: { name: 'sesli' } });
    const externalEvent = makeEvent({ id: 'event-2', locationType: 'EXTERNAL' });
    prismaMock.guildEvent.findMany.mockResolvedValue([voiceEvent, externalEvent]);
    // minör voice kanalına erişemez, external'a erişir
    membershipMock.requireChannelAccess.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));

    const result = await service.findByGuild('minor-1', GUILD_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('event-2'); // yalnız external görünür
  });

  it('voice ageGated etkinlik → minör GET 404 (jenerik EVENT_NOT_FOUND, sebep sızmaz)', async () => {
    const voiceEvent = makeEvent({ locationType: 'VOICE_CHANNEL', channelId: VOICE_CHANNEL_ID, channel: { name: 'sesli' } });
    prismaMock.guildEvent.findFirst.mockResolvedValue(voiceEvent);
    membershipMock.requireChannelAccess.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));

    const err = await service.findOne('minor-1', EVENT_ID).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.response).toMatchObject({ error: 'EVENT_NOT_FOUND' });
  });

  it('erişimli kullanıcı → voice etkinliği görür', async () => {
    const voiceEvent = makeEvent({ locationType: 'VOICE_CHANNEL', channelId: VOICE_CHANNEL_ID, channel: { name: 'sesli' } });
    prismaMock.guildEvent.findFirst.mockResolvedValue(voiceEvent);
    membershipMock.requireChannelAccess.mockResolvedValue(undefined);

    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(result).toMatchObject({ id: EVENT_ID, channelName: 'sesli' });
  });

  it('var olmayan etkinlik → EVENT_NOT_FOUND', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(null);
    await expect(service.findOne(USER_ID, 'yok')).rejects.toMatchObject({
      response: { error: 'EVENT_NOT_FOUND' },
    });
  });

  it('voice etkinlik channelId null (kanal silinmiş) → fail-closed, görünmez', async () => {
    const orphan = makeEvent({ locationType: 'VOICE_CHANNEL', channelId: null, channel: null });
    prismaMock.guildEvent.findFirst.mockResolvedValue(orphan);
    await expect(service.findOne(USER_ID, EVENT_ID)).rejects.toMatchObject({
      response: { error: 'EVENT_NOT_FOUND' },
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// UPDATE / DELETE
// ────────────────────────────────────────────────────────────────────────────

describe('EventsService.update / remove', () => {
  let service: EventsService;
  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('update MANAGE_EVENTS yoksa → 403', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent());
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    await expect(service.update(USER_ID, EVENT_ID, { name: 'Yeni' })).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('update startAt geçmişe → EVENT_START_IN_PAST', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent());
    await expect(service.update(USER_ID, EVENT_ID, { startAt: PAST.toISOString() })).rejects.toMatchObject({
      response: { error: 'EVENT_START_IN_PAST' },
    });
  });

  it('update → guild.event_updated yayınlanır', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent());
    prismaMock.guildEvent.update.mockResolvedValue(makeEvent({ name: 'Güncel', channel: null }));
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: USER_ID }]);

    await service.update(USER_ID, EVENT_ID, { name: 'Güncel' });
    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith([USER_ID], 'guild.event_updated', expect.anything());
  });

  it('remove → soft-delete + guild.event_deleted {guildId, eventId}', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent());
    prismaMock.guildEvent.update.mockResolvedValue(makeEvent({ deletedAt: new Date() }));
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: USER_ID }]);

    const result = await service.remove(USER_ID, EVENT_ID);
    expect(result).toBeNull();
    expect(prismaMock.guildEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(
      [USER_ID],
      'guild.event_deleted',
      { guildId: GUILD_ID, eventId: EVENT_ID },
    );
  });

  it('remove var olmayan → EVENT_NOT_FOUND', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(null);
    await expect(service.remove(USER_ID, 'yok')).rejects.toMatchObject({
      response: { error: 'EVENT_NOT_FOUND' },
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// İLGİ (interest) — idempotent
// ────────────────────────────────────────────────────────────────────────────

describe('EventsService interest (idempotent)', () => {
  let service: EventsService;
  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('addInterest → upsert (idempotent tekrar tek kayıt), EventDto döner', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent());
    prismaMock.guildEventInterest.upsert.mockResolvedValue({ eventId: EVENT_ID, userId: USER_ID });
    prismaMock.guildEventInterest.count.mockResolvedValue(1);
    prismaMock.guildEventInterest.findUnique.mockResolvedValue({ eventId: EVENT_ID, userId: USER_ID });

    const result = await service.addInterest(USER_ID, EVENT_ID);

    expect(prismaMock.guildEventInterest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId: { eventId: EVENT_ID, userId: USER_ID } },
        update: {},
        create: { eventId: EVENT_ID, userId: USER_ID },
      }),
    );
    expect(result).toMatchObject({ interestedCount: 1, interestedByMe: true });
  });

  it('addInterest görünmeyen etkinlik (minör/voice) → EVENT_NOT_FOUND, upsert çağrılmaz', async () => {
    const voiceEvent = makeEvent({ locationType: 'VOICE_CHANNEL', channelId: VOICE_CHANNEL_ID, channel: { name: 'sesli' } });
    prismaMock.guildEvent.findFirst.mockResolvedValue(voiceEvent);
    membershipMock.requireChannelAccess.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));

    await expect(service.addInterest('minor-1', EVENT_ID)).rejects.toMatchObject({
      response: { error: 'EVENT_NOT_FOUND' },
    });
    expect(prismaMock.guildEventInterest.upsert).not.toHaveBeenCalled();
  });

  it('removeInterest → deleteMany (idempotent, yoksa no-op), EventDto döner', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent());
    prismaMock.guildEventInterest.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.guildEventInterest.count.mockResolvedValue(0);
    prismaMock.guildEventInterest.findUnique.mockResolvedValue(null);

    const result = await service.removeInterest(USER_ID, EVENT_ID);

    expect(prismaMock.guildEventInterest.deleteMany).toHaveBeenCalledWith({
      where: { eventId: EVENT_ID, userId: USER_ID },
    });
    expect(result).toMatchObject({ interestedCount: 0, interestedByMe: false });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// EventDto status TÜRETİMİ
// ────────────────────────────────────────────────────────────────────────────

describe('EventDto status türetimi', () => {
  let service: EventsService;
  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('startAt gelecekte → status SCHEDULED', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ startAt: FUTURE }));
    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(result.status).toBe('SCHEDULED');
  });

  it('startAt geçmişte → status COMPLETED (türetilir)', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ startAt: PAST }));
    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(result.status).toBe('COMPLETED');
  });

  it('NONE + şu an süren (occStart<=now<=occEnd) → status ACTIVE + occurrence çapaya eşit', async () => {
    const startAt = new Date(Date.now() - 60_000); // 1 dk önce başladı
    const endAt = new Date(Date.now() + 60 * 60_000); // 1 saat sürer
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ startAt, endAt }));
    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(result.status).toBe('ACTIVE');
    expect(result.occurrenceStartAt.getTime()).toBe(startAt.getTime());
    expect(result.occurrenceEndAt.getTime()).toBe(endAt.getTime());
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeOccurrence — saf util birim testleri (§2)
// ────────────────────────────────────────────────────────────────────────────

describe('computeOccurrence (saf util)', () => {
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  it('NONE gelecek → k=0, SCHEDULED, occurrence = çapa', () => {
    const start = new Date('2026-07-01T19:00:00.000Z');
    const now = new Date('2026-06-16T12:00:00.000Z');
    const r = computeOccurrence({ startAt: start, endAt: null, recurrence: 'NONE' }, now);
    expect(r.status).toBe('SCHEDULED');
    expect(r.occurrenceStartAt.getTime()).toBe(start.getTime());
    expect(r.occurrenceEndAt.getTime()).toBe(start.getTime()); // noktasal
  });

  it('NONE geçmiş + bitti → COMPLETED', () => {
    const start = new Date('2026-01-01T19:00:00.000Z');
    const end = new Date('2026-01-01T21:00:00.000Z');
    const now = new Date('2026-06-16T12:00:00.000Z');
    const r = computeOccurrence({ startAt: start, endAt: end, recurrence: 'NONE' }, now);
    expect(r.status).toBe('COMPLETED');
  });

  it('NONE süren pencere → ACTIVE (occStart<=now<=occEnd)', () => {
    const start = new Date('2026-06-16T12:00:00.000Z');
    const end = new Date('2026-06-16T14:00:00.000Z');
    const now = new Date('2026-06-16T13:00:00.000Z');
    const r = computeOccurrence({ startAt: start, endAt: end, recurrence: 'NONE' }, now);
    expect(r.status).toBe('ACTIVE');
  });

  it('DAILY: geçmiş çapa → bir sonraki günlük örnek hesaplanır (SCHEDULED)', () => {
    const start = new Date('2026-06-10T18:00:00.000Z'); // 6 gün önce başladı
    const now = new Date('2026-06-16T12:00:00.000Z'); // bugün 12:00, bugünün 18:00'ı henüz gelmedi
    const r = computeOccurrence({ startAt: start, endAt: null, recurrence: 'DAILY' }, now);
    // ilgili örnek = bugün 18:00 (occEnd>=now, noktasal)
    expect(r.occurrenceStartAt.toISOString()).toBe('2026-06-16T18:00:00.000Z');
    expect(r.status).toBe('SCHEDULED');
  });

  it('DAILY: süre içeren örnek şu an sürüyorsa → ACTIVE', () => {
    const start = new Date('2026-06-10T11:00:00.000Z'); // her gün 11:00, 2 saat
    const end = new Date('2026-06-10T13:00:00.000Z');
    const now = new Date('2026-06-16T12:00:00.000Z'); // bugün 12:00 → 11-13 penceresi içinde
    const r = computeOccurrence({ startAt: start, endAt: end, recurrence: 'DAILY' }, now);
    expect(r.occurrenceStartAt.toISOString()).toBe('2026-06-16T11:00:00.000Z');
    expect(r.occurrenceEndAt.toISOString()).toBe('2026-06-16T13:00:00.000Z');
    expect(r.status).toBe('ACTIVE');
  });

  it('WEEKLY: +7 gün adımı; geçmiş çapadan sonraki haftalık örnek', () => {
    const start = new Date('2026-06-01T20:00:00.000Z'); // Pazartesi
    const now = new Date('2026-06-16T12:00:00.000Z');
    const r = computeOccurrence({ startAt: start, endAt: null, recurrence: 'WEEKLY' }, now);
    // 06-01, 06-08, 06-15 geçti; sonraki = 06-22
    expect(r.occurrenceStartAt.toISOString()).toBe('2026-06-22T20:00:00.000Z');
    expect(r.status).toBe('SCHEDULED');
  });

  it('MONTHLY: aynı gün-of-month sonraki ay', () => {
    const start = new Date('2026-01-15T19:00:00.000Z');
    const now = new Date('2026-06-16T12:00:00.000Z'); // 06-15 geçti
    const r = computeOccurrence({ startAt: start, endAt: null, recurrence: 'MONTHLY' }, now);
    expect(r.occurrenceStartAt.toISOString()).toBe('2026-07-15T19:00:00.000Z');
    expect(r.status).toBe('SCHEDULED');
  });

  it('MONTHLY ay-sonu kıstırma: 31 Ocak aylık → Şubat son günü (28, 2026)', () => {
    const start = new Date('2026-01-31T19:00:00.000Z');
    const now = new Date('2026-02-01T00:00:00.000Z'); // Şubat örneğini hesapla
    const r = computeOccurrence({ startAt: start, endAt: null, recurrence: 'MONTHLY' }, now);
    // 2026 Şubat 28 gün (artık yıl değil) → 28 Şubat'a kıstırılır
    expect(r.occurrenceStartAt.toISOString()).toBe('2026-02-28T19:00:00.000Z');
  });

  it('MONTHLY ay-sonu kıstırma artık yıl: 31 Ocak 2028 aylık → 29 Şubat 2028', () => {
    const start = new Date('2028-01-31T19:00:00.000Z');
    const now = new Date('2028-02-01T00:00:00.000Z');
    const r = computeOccurrence({ startAt: start, endAt: null, recurrence: 'MONTHLY' }, now);
    expect(r.occurrenceStartAt.toISOString()).toBe('2028-02-29T19:00:00.000Z');
  });

  it('tekrarlayan açık-uçlu seri → çok eski çapaya rağmen COMPLETED OLMAZ', () => {
    const start = new Date('2020-01-01T10:00:00.000Z'); // çok eski
    const now = new Date('2026-06-16T12:00:00.000Z');
    for (const recurrence of ['DAILY', 'WEEKLY', 'MONTHLY'] as const) {
      const r = computeOccurrence({ startAt: start, endAt: null, recurrence }, now);
      expect(r.status).not.toBe('COMPLETED');
      expect(['SCHEDULED', 'ACTIVE']).toContain(r.status);
      // ilgili örnek geleceğe/şimdiye düşmeli (occEnd >= now)
      expect(r.occurrenceEndAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
    }
  });

  it('fail-safe: geçersiz tarih → occurrence = çapa, MVP status türetmesi', () => {
    const bad = new Date('not-a-date');
    const now = new Date('2026-06-16T12:00:00.000Z');
    const r = computeOccurrence({ startAt: bad, endAt: null, recurrence: 'DAILY' }, now);
    expect(Number.isNaN(r.occurrenceStartAt.getTime())).toBe(true);
    expect(r.status).toBe('COMPLETED'); // startMs NaN → güvenli COMPLETED
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Motor: recurrence kabulü + occurrence sıralama
// ────────────────────────────────────────────────────────────────────────────

describe('EventsService motor (recurrence + occurrence sıralama)', () => {
  let service: EventsService;
  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('create: DAILY recurrence dto’dan alınır (artık NONE hardcoded değil)', async () => {
    const created = makeEvent({ recurrence: 'DAILY' });
    prismaMock.guildEvent.create.mockResolvedValue(created);
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: USER_ID }]);

    const result = await service.create(USER_ID, GUILD_ID, {
      name: 'Günlük',
      locationType: 'EXTERNAL',
      externalLocation: 'Yer',
      startAt: FUTURE.toISOString(),
      recurrence: 'DAILY' as any,
    });

    expect(prismaMock.guildEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recurrence: 'DAILY' }) }),
    );
    expect(result.recurrence).toBe('DAILY');
  });

  it('create: recurrence verilmezse → NONE varsayılan', async () => {
    prismaMock.guildEvent.create.mockResolvedValue(makeEvent());
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: USER_ID }]);
    await service.create(USER_ID, GUILD_ID, {
      name: 'Tek',
      locationType: 'EXTERNAL',
      externalLocation: 'Yer',
      startAt: FUTURE.toISOString(),
    });
    expect(prismaMock.guildEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recurrence: 'NONE' }) }),
    );
  });

  it('findByGuild: occurrenceStartAt artan sıralar (çapa startAt değil)', async () => {
    const now = Date.now();
    // A: çapa daha erken ama tek-seferlik geçmiş → occurrence geçmişte (COMPLETED) → en başta
    // B: DAILY çapa eski ama ilgili örnek bugün/yakın → occurrence yakın gelecek
    // C: tek-seferlik uzak gelecek
    const completedPast = makeEvent({
      id: 'A-past',
      startAt: new Date(now - 10 * 86_400_000),
      endAt: new Date(now - 10 * 86_400_000 + 3_600_000),
      recurrence: 'NONE',
    });
    const dailySoon = makeEvent({
      id: 'B-daily',
      startAt: new Date(now - 5 * 86_400_000 + 2 * 3_600_000), // ilgili örnek ~2 saat sonra
      endAt: null,
      recurrence: 'DAILY',
    });
    const futureFar = makeEvent({
      id: 'C-future',
      startAt: new Date(now + 30 * 86_400_000),
      endAt: null,
      recurrence: 'NONE',
    });
    // DB döndürme sırası kasıtlı karışık
    prismaMock.guildEvent.findMany.mockResolvedValue([futureFar, completedPast, dailySoon]);
    membershipMock.requireChannelAccess.mockResolvedValue(undefined);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    const ids = result.map((e) => e.id);
    // occurrenceStartAt artan: geçmiş tek-seferlik < bugünkü daily örnek < uzak gelecek
    expect(ids).toEqual(['A-past', 'B-daily', 'C-future']);
    // ayrıca occurrenceStartAt monoton artan
    for (let i = 1; i < result.length; i++) {
      expect(result[i].occurrenceStartAt.getTime()).toBeGreaterThanOrEqual(
        result[i - 1].occurrenceStartAt.getTime(),
      );
    }
  });

  it('DTO: occurrenceStartAt/EndAt computed alanları döner', async () => {
    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(Date.now() + 86_400_000 + 3_600_000);
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ startAt: start, endAt: end, recurrence: 'NONE' }));
    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(result.occurrenceStartAt.getTime()).toBe(start.getTime());
    expect(result.occurrenceEndAt.getTime()).toBe(end.getTime());
    expect(result.status).toBe('SCHEDULED');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// KAPAK GÖRSELİ (cover) — scan-gated Attachment hattı (T&S kilitli §2-§3)
// ────────────────────────────────────────────────────────────────────────────

const COVER_ID = 'attachment-cover-1';

function imageAttachment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: COVER_ID,
    uploaderId: USER_ID,
    contentType: 'image/png',
    messageId: null,
    storageKey: 'cover-key.png',
    scanStatus: 'CLEAN',
    ...overrides,
  };
}

describe('EventsService kapak — attachCover (create/update iliştirme)', () => {
  let service: EventsService;
  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  function createWithCover(coverImageId: string) {
    return service.create(USER_ID, GUILD_ID, {
      name: 'Kapaklı Etkinlik',
      locationType: 'EXTERNAL',
      externalLocation: 'Yer',
      startAt: FUTURE.toISOString(),
      coverImageId,
    });
  }

  it('attachment yok → INVALID_COVER_IMAGE (400), event oluşmaz', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(null);
    await expect(createWithCover(COVER_ID)).rejects.toMatchObject({
      response: { error: 'INVALID_COVER_IMAGE' },
    });
    expect(prismaMock.guildEvent.create).not.toHaveBeenCalled();
  });

  it('başkasının attachment’ı (uploaderId !== userId) → INVALID_COVER_IMAGE', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(imageAttachment({ uploaderId: 'other-user' }));
    await expect(createWithCover(COVER_ID)).rejects.toMatchObject({
      response: { error: 'INVALID_COVER_IMAGE' },
    });
    expect(prismaMock.guildEvent.create).not.toHaveBeenCalled();
  });

  it('image/* olmayan tip → INVALID_COVER_TYPE (400)', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(imageAttachment({ contentType: 'application/pdf' }));
    await expect(createWithCover(COVER_ID)).rejects.toMatchObject({
      response: { error: 'INVALID_COVER_TYPE' },
    });
    expect(prismaMock.guildEvent.create).not.toHaveBeenCalled();
  });

  it('messageId dolu (başka mesaja bağlı) → INVALID_COVER_IMAGE', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(imageAttachment({ messageId: 'msg-1' }));
    await expect(createWithCover(COVER_ID)).rejects.toMatchObject({
      response: { error: 'INVALID_COVER_IMAGE' },
    });
    expect(prismaMock.guildEvent.create).not.toHaveBeenCalled();
  });

  it('scanEnabled=false (dev) → attachment CLEAN ile güncellenir, coverImageId event’e yazılır', async () => {
    configMock.get.mockReturnValue(false);
    service = makeService(); // scanEnabled constructor’da false okunur
    prismaMock.attachment.findUnique.mockResolvedValue(imageAttachment());
    prismaMock.guildEvent.create.mockResolvedValue(makeEvent({ coverImageId: COVER_ID }));

    await createWithCover(COVER_ID);

    expect(prismaMock.attachment.update).toHaveBeenCalledWith({
      where: { id: COVER_ID },
      data: { scanStatus: 'CLEAN' },
    });
    expect(prismaMock.guildEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ coverImageId: COVER_ID }) }),
    );
  });

  it('scanEnabled=true (prod/gelecek) → attachment PENDING ile güncellenir', async () => {
    configMock.get.mockReturnValue(true);
    service = makeService(); // scanEnabled constructor’da true okunur
    prismaMock.attachment.findUnique.mockResolvedValue(imageAttachment());
    prismaMock.guildEvent.create.mockResolvedValue(makeEvent({ coverImageId: COVER_ID }));

    await createWithCover(COVER_ID);

    expect(prismaMock.attachment.update).toHaveBeenCalledWith({
      where: { id: COVER_ID },
      data: { scanStatus: 'PENDING' },
    });
  });

  it('coverImageId verilmezse → attachCover çağrılmaz, coverImageId null', async () => {
    prismaMock.guildEvent.create.mockResolvedValue(makeEvent());
    await service.create(USER_ID, GUILD_ID, {
      name: 'Kapaksız',
      locationType: 'EXTERNAL',
      externalLocation: 'Yer',
      startAt: FUTURE.toISOString(),
    });
    expect(prismaMock.attachment.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.guildEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ coverImageId: null }) }),
    );
  });
});

describe('EventsService kapak — resolveCoverUrl (EventDto.coverImageUrl)', () => {
  let service: EventsService;
  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('coverImageId null → coverImageUrl null, presignGet çağrılmaz', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ coverImageId: null }));
    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(result.coverImageUrl).toBeNull();
    expect(storageMock.presignGet).not.toHaveBeenCalled();
  });

  it('attachment CLEAN → coverImageUrl presigned GET döner', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ coverImageId: COVER_ID }));
    prismaMock.attachment.findUnique.mockResolvedValue(imageAttachment({ scanStatus: 'CLEAN' }));
    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(storageMock.presignGet).toHaveBeenCalledWith('cover-key.png');
    expect(result.coverImageUrl).toBe('https://cdn.example/presigned-cover');
  });

  it('attachment PENDING → coverImageUrl null (taranmamış görsel servis edilmez)', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ coverImageId: COVER_ID }));
    prismaMock.attachment.findUnique.mockResolvedValue(imageAttachment({ scanStatus: 'PENDING' }));
    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(result.coverImageUrl).toBeNull();
    expect(storageMock.presignGet).not.toHaveBeenCalled();
  });

  it('attachment FLAGGED → coverImageUrl null', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ coverImageId: COVER_ID }));
    prismaMock.attachment.findUnique.mockResolvedValue(imageAttachment({ scanStatus: 'FLAGGED' }));
    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(result.coverImageUrl).toBeNull();
    expect(storageMock.presignGet).not.toHaveBeenCalled();
  });

  it('attachment yok (silinmiş) → coverImageUrl null', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ coverImageId: COVER_ID }));
    prismaMock.attachment.findUnique.mockResolvedValue(null);
    const result = await service.findOne(USER_ID, EVENT_ID);
    expect(result.coverImageUrl).toBeNull();
  });
});

describe('EventsService kapak — update semantiği (null/undefined/string)', () => {
  let service: EventsService;
  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('coverImageId undefined → data.coverImageId dokunulmaz', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ coverImageId: COVER_ID }));
    prismaMock.guildEvent.update.mockResolvedValue(makeEvent({ coverImageId: COVER_ID, channel: null }));

    await service.update(USER_ID, EVENT_ID, { name: 'Yeni Ad' });

    const updateArg = prismaMock.guildEvent.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty('coverImageId');
    expect(prismaMock.attachment.update).not.toHaveBeenCalled();
  });

  it('coverImageId null → kaldırılır (data.coverImageId = null), eski attachment’a dokunulmaz', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ coverImageId: COVER_ID }));
    prismaMock.guildEvent.update.mockResolvedValue(makeEvent({ coverImageId: null, channel: null }));

    await service.update(USER_ID, EVENT_ID, { coverImageId: null } as any);

    const updateArg = prismaMock.guildEvent.update.mock.calls[0][0];
    expect(updateArg.data).toMatchObject({ coverImageId: null });
    // kaldırmada attachCover çalışmaz → attachment dokunulmaz
    expect(prismaMock.attachment.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.attachment.update).not.toHaveBeenCalled();
  });

  it('coverImageId string → attachCover + data.coverImageId ata', async () => {
    prismaMock.guildEvent.findFirst.mockResolvedValue(makeEvent({ coverImageId: null }));
    prismaMock.attachment.findUnique.mockResolvedValue(imageAttachment());
    prismaMock.guildEvent.update.mockResolvedValue(makeEvent({ coverImageId: COVER_ID, channel: null }));

    await service.update(USER_ID, EVENT_ID, { coverImageId: COVER_ID });

    expect(prismaMock.attachment.update).toHaveBeenCalledWith({
      where: { id: COVER_ID },
      data: { scanStatus: 'CLEAN' },
    });
    const updateArg = prismaMock.guildEvent.update.mock.calls[0][0];
    expect(updateArg.data).toMatchObject({ coverImageId: COVER_ID });
  });
});
