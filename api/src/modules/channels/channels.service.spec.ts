import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { ChannelsService } from './channels.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  channel: {
    aggregate: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  channelRead: {
    upsert: jest.fn(),
  },
};

const membershipMock = {
  requireGuildMembership: jest.fn(),
  requireChannelAccess: jest.fn(),
};

function makeService() {
  return new ChannelsService(prismaMock as any, membershipMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'ch-1';

const OWNER_MEMBERSHIP = { guildId: GUILD_ID, userId: USER_ID, role: 'OWNER' };
const ADMIN_MEMBERSHIP = { guildId: GUILD_ID, userId: 'admin-1', role: 'ADMIN' };
const MEMBER_MEMBERSHIP = { guildId: GUILD_ID, userId: 'member-1', role: 'MEMBER' };
const GUILD = { id: GUILD_ID, deletedAt: null };

function makeChannel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CHANNEL_ID,
    type: 'GUILD_TEXT',
    guildId: GUILD_ID,
    name: 'genel-sohbet',
    ageGated: false,
    position: 0,
    slowModeSeconds: 0,
    deletedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── ChannelsService.create ─────────────────────────────────────────────────────

describe('ChannelsService.create', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('MEMBER → 403 FORBIDDEN fırlatır', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: MEMBER_MEMBERSHIP });

    await expect(service.create('member-1', GUILD_ID, { name: 'yeni-kanal' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.create('member-1', GUILD_ID, { name: 'yeni-kanal' })).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('OWNER → kanal oluşturur; ageGated default false', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 2 } });
    const created = makeChannel({ name: 'yeni-kanal', position: 3, ageGated: false });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create(USER_ID, GUILD_ID, { name: 'yeni-kanal' });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ageGated: false, position: 3, type: 'GUILD_TEXT' }),
      }),
    );
    expect(result).toMatchObject({ name: 'yeni-kanal', ageGated: false, position: 3 });
  });

  it('ADMIN → kanal oluşturur', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: ADMIN_MEMBERSHIP });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: null } });
    const created = makeChannel({ name: 'admin-kanal', position: 0, ageGated: false });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create('admin-1', GUILD_ID, { name: 'admin-kanal' });
    expect(result).toMatchObject({ name: 'admin-kanal' });
  });

  it('ageGated: true → kanalda ageGated=true set edilir', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeChannel({ name: 'yetiskin-kanal', position: 1, ageGated: true });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create(USER_ID, GUILD_ID, { name: 'yetiskin-kanal', ageGated: true });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ageGated: true }),
      }),
    );
    expect(result.ageGated).toBe(true);
  });

  it('position = max + 1 hesaplanır', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 4 } });
    const created = makeChannel({ position: 5 });
    prismaMock.channel.create.mockResolvedValue(created);

    await service.create(USER_ID, GUILD_ID, { name: 'yeni' });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 5 }) }),
    );
  });
});

// ── ChannelsService.update ─────────────────────────────────────────────────────

describe('ChannelsService.update', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('kanal yok → 404 CHANNEL_NOT_FOUND', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);

    await expect(service.update(USER_ID, CHANNEL_ID, { name: 'yeni' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.update(USER_ID, CHANNEL_ID, { name: 'yeni' })).rejects.toMatchObject({
      response: { error: 'CHANNEL_NOT_FOUND' },
    });
  });

  it('MEMBER → 403 FORBIDDEN', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: MEMBER_MEMBERSHIP });

    await expect(service.update('member-1', CHANNEL_ID, { name: 'yeni' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('OWNER ad günceller', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    const updated = makeChannel({ name: 'yeni-ad' });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { name: 'yeni-ad' });
    expect(result).toMatchObject({ name: 'yeni-ad' });
  });

  it('ageGated günceller (false → true)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ ageGated: false }));
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    const updated = makeChannel({ ageGated: true });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { ageGated: true });
    expect(result.ageGated).toBe(true);
    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ageGated: true }) }),
    );
  });

  it('ADMIN → güncelleme yetkisi var', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: ADMIN_MEMBERSHIP });
    const updated = makeChannel({ name: 'admin-guncelledi' });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update('admin-1', CHANNEL_ID, { name: 'admin-guncelledi' });
    expect(result).toMatchObject({ name: 'admin-guncelledi' });
  });
});

// ── ChannelsService.remove ─────────────────────────────────────────────────────

describe('ChannelsService.remove', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('kanal yok → 404 CHANNEL_NOT_FOUND', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);

    await expect(service.remove(USER_ID, CHANNEL_ID)).rejects.toThrow(NotFoundException);
    await expect(service.remove(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'CHANNEL_NOT_FOUND' },
    });
  });

  it('MEMBER → 403 FORBIDDEN', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: MEMBER_MEMBERSHIP });

    await expect(service.remove('member-1', CHANNEL_ID)).rejects.toThrow(ForbiddenException);
  });

  it('son kanal (count=1) → 409 LAST_CHANNEL', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channel.count.mockResolvedValue(1);

    await expect(service.remove(USER_ID, CHANNEL_ID)).rejects.toThrow(ConflictException);
    await expect(service.remove(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'LAST_CHANNEL' },
    });
  });

  it('birden fazla kanal var → soft-delete yapılır → null döner', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channel.count.mockResolvedValue(2);
    prismaMock.channel.update.mockResolvedValue(makeChannel({ deletedAt: new Date() }));

    const result = await service.remove(USER_ID, CHANNEL_ID);

    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CHANNEL_ID },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(result).toBeNull();
  });

  it('ADMIN → silme yetkisi var', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: ADMIN_MEMBERSHIP });
    prismaMock.channel.count.mockResolvedValue(3);
    prismaMock.channel.update.mockResolvedValue(makeChannel({ deletedAt: new Date() }));

    const result = await service.remove('admin-1', CHANNEL_ID);
    expect(result).toBeNull();
  });
});

// ── ChannelsService — yavaş mod (slowModeSeconds) ────────────────────────────

describe('ChannelsService — yavaş mod create/update', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('create: slowModeSeconds verilmezse 0 set edilir', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeChannel({ slowModeSeconds: 0 });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create(USER_ID, GUILD_ID, { name: 'genel' });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slowModeSeconds: 0 }) }),
    );
    expect(result.slowModeSeconds).toBe(0);
  });

  it('create: slowModeSeconds=30 verilirse kaydedilir', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeChannel({ slowModeSeconds: 30 });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create(USER_ID, GUILD_ID, { name: 'yavaz-kanal', slowModeSeconds: 30 });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slowModeSeconds: 30 }) }),
    );
    expect(result.slowModeSeconds).toBe(30);
  });

  it('update: slowModeSeconds güncellenir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ slowModeSeconds: 0 }));
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    const updated = makeChannel({ slowModeSeconds: 60 });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { slowModeSeconds: 60 });

    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slowModeSeconds: 60 }) }),
    );
    expect(result.slowModeSeconds).toBe(60);
  });

  it('update: slowModeSeconds=0 ile kapatılır', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ slowModeSeconds: 30 }));
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    const updated = makeChannel({ slowModeSeconds: 0 });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { slowModeSeconds: 0 });

    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slowModeSeconds: 0 }) }),
    );
    expect(result.slowModeSeconds).toBe(0);
  });

  it('toChannelDto: slowModeSeconds response\'a dahil edilir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ slowModeSeconds: 15 }));
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    const updated = makeChannel({ slowModeSeconds: 15 });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { slowModeSeconds: 15 });

    expect(result).toHaveProperty('slowModeSeconds', 15);
  });
});

// ── ChannelsService.markRead ──────────────────────────────────────────────────

describe('ChannelsService.markRead', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('erişim yoksa exception fırlatır (requireChannelAccess)', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(new Error('FORBIDDEN'));

    await expect(service.markRead(USER_ID, CHANNEL_ID)).rejects.toThrow('FORBIDDEN');
    expect(prismaMock.channelRead.upsert).not.toHaveBeenCalled();
  });

  it('erişim varsa channelRead upsert çağrılır → null döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID });
    prismaMock.channelRead.upsert.mockResolvedValue({});

    const result = await service.markRead(USER_ID, CHANNEL_ID);

    expect(prismaMock.channelRead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_channelId: { userId: USER_ID, channelId: CHANNEL_ID } },
        update: expect.objectContaining({ lastReadAt: expect.any(Date) }),
        create: expect.objectContaining({ userId: USER_ID, channelId: CHANNEL_ID }),
      }),
    );
    expect(result).toBeNull();
  });
});

// ── ChannelsService.findByGuild — hasUnread ───────────────────────────────────

describe('ChannelsService.findByGuild — hasUnread', () => {
  let service: ChannelsService;

  const NOW = new Date('2026-06-13T12:00:00Z');
  const BEFORE = new Date('2026-06-13T11:00:00Z');
  const AFTER = new Date('2026-06-13T13:00:00Z');

  function makeChannelWithUnread(overrides: {
    lastMsgAuthorId?: string;
    lastMsgCreatedAt?: Date | null;
    lastReadAt?: Date | null;
  }) {
    return {
      ...makeChannel(),
      messages: overrides.lastMsgCreatedAt
        ? [{ authorId: overrides.lastMsgAuthorId ?? 'other-user', createdAt: overrides.lastMsgCreatedAt }]
        : [],
      channelReads: overrides.lastReadAt ? [{ lastReadAt: overrides.lastReadAt }] : [],
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
  });

  it('kanal mesajsız → hasUnread false', async () => {
    prismaMock.channel.findMany.mockResolvedValue([
      makeChannelWithUnread({ lastMsgCreatedAt: null }),
    ]);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].hasUnread).toBe(false);
  });

  it('son mesaj kullanıcının kendisinden → hasUnread false', async () => {
    prismaMock.channel.findMany.mockResolvedValue([
      makeChannelWithUnread({ lastMsgAuthorId: USER_ID, lastMsgCreatedAt: AFTER, lastReadAt: BEFORE }),
    ]);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].hasUnread).toBe(false);
  });

  it('okuma kaydı yok + başkasından mesaj var → hasUnread true', async () => {
    prismaMock.channel.findMany.mockResolvedValue([
      makeChannelWithUnread({ lastMsgCreatedAt: NOW, lastReadAt: null }),
    ]);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].hasUnread).toBe(true);
  });

  it('son mesaj lastReadAt\'den sonra → hasUnread true', async () => {
    prismaMock.channel.findMany.mockResolvedValue([
      makeChannelWithUnread({ lastMsgCreatedAt: AFTER, lastReadAt: BEFORE }),
    ]);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].hasUnread).toBe(true);
  });

  it('son mesaj lastReadAt\'den önce → hasUnread false', async () => {
    prismaMock.channel.findMany.mockResolvedValue([
      makeChannelWithUnread({ lastMsgCreatedAt: BEFORE, lastReadAt: NOW }),
    ]);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].hasUnread).toBe(false);
  });

  it('markRead sonrası (lastReadAt=NOW, son mesaj=BEFORE) → hasUnread false', async () => {
    prismaMock.channel.findMany.mockResolvedValue([
      makeChannelWithUnread({ lastMsgCreatedAt: BEFORE, lastReadAt: NOW }),
    ]);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].hasUnread).toBe(false);
  });
});
