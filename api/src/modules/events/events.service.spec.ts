import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';

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
};

const membershipMock = {
  requireGuildMembership: jest.fn(),
  requireChannelAccess: jest.fn(),
};

const permissionsMock = {
  hasGuildPermission: jest.fn(),
};

const realtimeMock = { emitToUser: jest.fn(), emitToUsers: jest.fn(), emitToRoom: jest.fn() };

function makeService() {
  return new EventsService(prismaMock as any, membershipMock as any, permissionsMock as any, realtimeMock as any);
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
});
