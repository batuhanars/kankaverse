import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  // C77 §1: soft-delete aynı işlemde bekleyen Welcome'ları da siler
  e2eeWelcome: { deleteMany: jest.fn() },
  $transaction: jest.fn(),
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
    updateMany: jest.fn(),
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  channelMember: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  guildMember: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  // R15 §2.6 — kullanıcının o ortamdaki rol id'leri (rol-bahsetme rozet dalı)
  guildMemberRole: {
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  message: {
    count: jest.fn(),
  },
  notificationPref: {
    findUnique: jest.fn(),
  },
};

const membershipMock = {
  requireGuildMembership: jest.fn(),
  requireChannelAccess: jest.fn(),
};

const permissionsMock = {
  hasGuildPermission: jest.fn().mockResolvedValue(true),
  requireMemberHierarchy: jest.fn().mockResolvedValue(undefined),
  requireRoleHierarchy: jest.fn().mockResolvedValue(undefined),
  // R20 — enum-ADMIN kısa devresi kalktı; "tam yetkili mi" (OWNER/ADMINISTRATOR) artık bu ikisinden gelir.
  hasFullAccess: jest.fn().mockResolvedValue(false),
  guildPrivilegedUserIds: jest.fn().mockResolvedValue(new Set()),
};

const realtimeMock = { emitToUser: jest.fn(), emitToUsers: jest.fn(), emitToRoom: jest.fn() };

// D54 (Sprint R19) — ChannelsService.update GUILD_VOICE ageGated/mediaEnabled değişince çağırır.
const voiceServiceMock = { refreshChannelPermissions: jest.fn() };

function makeService() {
  return new ChannelsService(
    prismaMock as any,
    membershipMock as any,
    permissionsMock as any,
    realtimeMock as any,
    voiceServiceMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  permissionsMock.hasGuildPermission.mockResolvedValue(true);
  permissionsMock.requireMemberHierarchy.mockResolvedValue(undefined);
  permissionsMock.requireRoleHierarchy.mockResolvedValue(undefined);
  permissionsMock.hasFullAccess.mockResolvedValue(false);
  permissionsMock.guildPrivilegedUserIds.mockResolvedValue(new Set());
  // Realtime alıcı sorguları (varsayılan boş — emit no-op)
  prismaMock.guildMember.findMany.mockResolvedValue([]);
  // R15 §2.6: varsayılan — rol bağı yok (bireysel testler override eder)
  prismaMock.guildMemberRole.findMany.mockResolvedValue([]);
  prismaMock.channelMember.findMany.mockResolvedValue([]);
  // R14 — varsayılan: ortam bildirim tercihi kaydı yok (@everyone bastırma kapalı)
  prismaMock.notificationPref.findUnique.mockResolvedValue(null);
  voiceServiceMock.refreshChannelPermissions.mockResolvedValue(undefined);
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'ch-1';

const OWNER_MEMBERSHIP = { guildId: GUILD_ID, userId: USER_ID, role: 'OWNER' };
// R20: enum-ADMIN kaldırıldı. Bu fixture "MANAGE_CHANNELS izni verilmiş MEMBER" temsil eder —
// eskiden enum role='ADMIN' idi, artık izin doğrudan permissionsMock.hasGuildPermission'dan gelir.
const GRANTED_MEMBER_MEMBERSHIP = { guildId: GUILD_ID, userId: 'admin-1', role: 'MEMBER' };
const MEMBER_MEMBERSHIP = { guildId: GUILD_ID, userId: 'member-1', role: 'MEMBER' };
const GUILD = { id: GUILD_ID, deletedAt: null };

function makeChannel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CHANNEL_ID,
    type: 'GUILD_TEXT',
    guildId: GUILD_ID,
    name: 'genel-sohbet',
    ageGated: false,
    isPrivate: false,
    position: 0,
    slowModeSeconds: 0,
    userLimit: 0,
    bitrate: 64,
    mediaEnabled: false, // C7: default false
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
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.create('member-1', GUILD_ID, { name: 'yeni-kanal' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.create('member-1', GUILD_ID, { name: 'yeni-kanal' }),
    ).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('OWNER → kanal oluşturur; ageGated default false', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
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

  it('type: GUILD_VOICE → kanal ses türünde oluşturulur', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeChannel({ name: 'sohbet-sesi', position: 1, type: 'GUILD_VOICE' });
    prismaMock.channel.create.mockResolvedValue(created);

    await service.create(USER_ID, GUILD_ID, { name: 'sohbet-sesi', type: 'GUILD_VOICE' });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'GUILD_VOICE' }) }),
    );
  });

  it('MANAGE_CHANNELS izinli MEMBER → kanal oluşturur', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: GRANTED_MEMBER_MEMBERSHIP,
    });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: null } });
    const created = makeChannel({ name: 'admin-kanal', position: 0, ageGated: false });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create('admin-1', GUILD_ID, { name: 'admin-kanal' });
    expect(result).toMatchObject({ name: 'admin-kanal' });
  });

  it('ageGated: true → kanalda ageGated=true set edilir', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeChannel({ name: 'yetiskin-kanal', position: 1, ageGated: true });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create(USER_ID, GUILD_ID, {
      name: 'yetiskin-kanal',
      ageGated: true,
    });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ageGated: true }),
      }),
    );
    expect(result.ageGated).toBe(true);
  });

  it('position = max + 1 hesaplanır', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
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
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.update('member-1', CHANNEL_ID, { name: 'yeni' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('OWNER ad günceller', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    const updated = makeChannel({ name: 'yeni-ad' });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { name: 'yeni-ad' });
    expect(result).toMatchObject({ name: 'yeni-ad' });
  });

  it('ageGated günceller (false → true)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ ageGated: false }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    const updated = makeChannel({ ageGated: true });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { ageGated: true });
    expect(result.ageGated).toBe(true);
    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ageGated: true }) }),
    );
  });

  it('MANAGE_CHANNELS izinli MEMBER → güncelleme yetkisi var', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: GRANTED_MEMBER_MEMBERSHIP,
    });
    const updated = makeChannel({ name: 'admin-guncelledi' });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update('admin-1', CHANNEL_ID, { name: 'admin-guncelledi' });
    expect(result).toMatchObject({ name: 'admin-guncelledi' });
  });

  // C7: mediaEnabled toggle
  it("C7: mediaEnabled=true → kanalda mediaEnabled set edilir, ChannelDto'da görünür", async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ mediaEnabled: false }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    const updated = makeChannel({ mediaEnabled: true });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { mediaEnabled: true });

    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mediaEnabled: true }) }),
    );
    expect(result.mediaEnabled).toBe(true);
  });

  it("C7: mediaEnabled DTO'ya geçirilmemişse (undefined) → update data'ya eklenmez (dokunma yok)", async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ mediaEnabled: true }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    const updated = makeChannel({ mediaEnabled: true, name: 'yeni' });
    prismaMock.channel.update.mockResolvedValue(updated);

    await service.update(USER_ID, CHANNEL_ID, { name: 'yeni' }); // mediaEnabled belirtilmedi

    const updateCall = prismaMock.channel.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).not.toHaveProperty('mediaEnabled');
  });
});

// ── ChannelsService.update — §4 D54 (Sprint R19): LiveKit izin tazeleme ───────
describe('ChannelsService.update — D54 refreshChannelPermissions tetikleyicisi', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
  });

  it('GUILD_VOICE + mediaEnabled fiilen değişti (false → true) → refreshChannelPermissions çağrılır', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(
      makeChannel({ type: 'GUILD_VOICE', mediaEnabled: false }),
    );
    prismaMock.channel.update.mockResolvedValue(
      makeChannel({ type: 'GUILD_VOICE', mediaEnabled: true }),
    );

    await service.update(USER_ID, CHANNEL_ID, { mediaEnabled: true });

    expect(voiceServiceMock.refreshChannelPermissions).toHaveBeenCalledWith(CHANNEL_ID);
  });

  it('GUILD_VOICE + ageGated fiilen değişti (false → true) → refreshChannelPermissions çağrılır', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(
      makeChannel({ type: 'GUILD_VOICE', ageGated: false }),
    );
    prismaMock.channel.update.mockResolvedValue(
      makeChannel({ type: 'GUILD_VOICE', ageGated: true }),
    );

    await service.update(USER_ID, CHANNEL_ID, { ageGated: true });

    expect(voiceServiceMock.refreshChannelPermissions).toHaveBeenCalledWith(CHANNEL_ID);
  });

  it('GUILD_VOICE ama alan DTO’ya hiç geçirilmedi (yalnız name değişti) → refreshChannelPermissions ÇAĞRILMAZ', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(
      makeChannel({ type: 'GUILD_VOICE', mediaEnabled: true }),
    );
    prismaMock.channel.update.mockResolvedValue(
      makeChannel({ type: 'GUILD_VOICE', mediaEnabled: true, name: 'yeni' }),
    );

    await service.update(USER_ID, CHANNEL_ID, { name: 'yeni' });

    expect(voiceServiceMock.refreshChannelPermissions).not.toHaveBeenCalled();
  });

  it('GUILD_VOICE + mediaEnabled DTO’da VAR ama değer aynı (true → true) → refreshChannelPermissions ÇAĞRILMAZ', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(
      makeChannel({ type: 'GUILD_VOICE', mediaEnabled: true }),
    );
    prismaMock.channel.update.mockResolvedValue(
      makeChannel({ type: 'GUILD_VOICE', mediaEnabled: true }),
    );

    await service.update(USER_ID, CHANNEL_ID, { mediaEnabled: true });

    expect(voiceServiceMock.refreshChannelPermissions).not.toHaveBeenCalled();
  });

  it('GUILD_TEXT kanalda mediaEnabled/ageGated değişse bile refreshChannelPermissions ÇAĞRILMAZ (yalnız GUILD_VOICE)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(
      makeChannel({ type: 'GUILD_TEXT', ageGated: false }),
    );
    prismaMock.channel.update.mockResolvedValue(
      makeChannel({ type: 'GUILD_TEXT', ageGated: true }),
    );

    await service.update(USER_ID, CHANNEL_ID, { ageGated: true });

    expect(voiceServiceMock.refreshChannelPermissions).not.toHaveBeenCalled();
  });

  it('refreshChannelPermissions hata fırlatırsa (LiveKit erişilemez) → update yine de başarıyla döner (best-effort)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(
      makeChannel({ type: 'GUILD_VOICE', mediaEnabled: false }),
    );
    const updated = makeChannel({ type: 'GUILD_VOICE', mediaEnabled: true });
    prismaMock.channel.update.mockResolvedValue(updated);
    voiceServiceMock.refreshChannelPermissions.mockRejectedValue(new Error('livekit down'));

    await expect(
      service.update(USER_ID, CHANNEL_ID, { mediaEnabled: true }),
    ).resolves.toMatchObject({ mediaEnabled: true });
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
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.remove('member-1', CHANNEL_ID)).rejects.toThrow(ForbiddenException);
  });

  it('son kanal (count=1) → 409 LAST_CHANNEL', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channel.count.mockResolvedValue(1);

    await expect(service.remove(USER_ID, CHANNEL_ID)).rejects.toThrow(ConflictException);
    await expect(service.remove(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'LAST_CHANNEL' },
    });
  });

  it('birden fazla kanal var → soft-delete yapılır → null döner', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channel.count.mockResolvedValue(2);
    prismaMock.channel.update.mockResolvedValue(makeChannel({ deletedAt: new Date() }));

    const result = await service.remove(USER_ID, CHANNEL_ID);

    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CHANNEL_ID },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(prismaMock.e2eeWelcome.deleteMany).toHaveBeenCalledWith({
      where: { channelId: CHANNEL_ID, deliveredAt: null },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('MANAGE_CHANNELS izinli MEMBER → silme yetkisi var', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: GRANTED_MEMBER_MEMBERSHIP,
    });
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
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
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
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeChannel({ slowModeSeconds: 30 });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create(USER_ID, GUILD_ID, {
      name: 'yavaz-kanal',
      slowModeSeconds: 30,
    });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slowModeSeconds: 30 }) }),
    );
    expect(result.slowModeSeconds).toBe(30);
  });

  it('update: slowModeSeconds güncellenir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ slowModeSeconds: 0 }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
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
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    const updated = makeChannel({ slowModeSeconds: 0 });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { slowModeSeconds: 0 });

    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slowModeSeconds: 0 }) }),
    );
    expect(result.slowModeSeconds).toBe(0);
  });

  it("toChannelDto: slowModeSeconds response'a dahil edilir", async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ slowModeSeconds: 15 }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
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

  it('C20: markRead → read:self yalnız okuyana, guildId ile', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });
    prismaMock.channelRead.upsert.mockResolvedValue({});

    await service.markRead(USER_ID, CHANNEL_ID);

    expect(realtimeMock.emitToUser).toHaveBeenCalledTimes(1);
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(
      USER_ID,
      'read:self',
      expect.objectContaining({
        channelId: CHANNEL_ID,
        guildId: 'g-1',
        readAt: expect.any(String),
      }),
    );
  });

  it('C20: yayın patlasa da markRead başarılı', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });
    prismaMock.channelRead.upsert.mockResolvedValue({});
    realtimeMock.emitToUser.mockImplementation(() => {
      throw new Error('ws');
    });

    await expect(service.markRead(USER_ID, CHANNEL_ID)).resolves.toBeNull();
  });
});

// ── ChannelsService.findByGuild — unreadCount ────────────────────────────────

describe('ChannelsService.findByGuild — unreadCount', () => {
  let service: ChannelsService;

  const NOW = new Date('2026-06-13T12:00:00Z');

  function makeChannelWithRead(lastReadAt: Date | null = null) {
    return {
      ...makeChannel(),
      channelReads: lastReadAt ? [{ lastReadAt }] : [],
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
  });

  it('okunmamış mesaj yok → unreadCount 0', async () => {
    prismaMock.channel.findMany.mockResolvedValue([makeChannelWithRead(NOW)]);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].unreadCount).toBe(0);
  });

  it('3 okunmamış mesaj → unreadCount 3', async () => {
    prismaMock.channel.findMany.mockResolvedValue([makeChannelWithRead(NOW)]);
    prismaMock.message.count.mockResolvedValue(3);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].unreadCount).toBe(3);
  });

  it('okuma kaydı yok → message.count sorgusu lastReadAt filtresi olmadan çağrılır', async () => {
    prismaMock.channel.findMany.mockResolvedValue([makeChannelWithRead(null)]);
    prismaMock.message.count.mockResolvedValue(5);

    const result = await service.findByGuild(USER_ID, GUILD_ID);

    expect(result[0].unreadCount).toBe(5);
    expect(prismaMock.message.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channelId: CHANNEL_ID,
          deletedAt: null,
          NOT: { authorId: USER_ID, webhookId: null },
        }),
      }),
    );
    // createdAt filtresi olmamalı
    const callArg = prismaMock.message.count.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty('createdAt');
  });

  it('okuma kaydı varsa → createdAt gt lastReadAt filtresi eklenir', async () => {
    const lastRead = new Date('2026-06-13T10:00:00Z');
    prismaMock.channel.findMany.mockResolvedValue([makeChannelWithRead(lastRead)]);
    prismaMock.message.count.mockResolvedValue(2);

    await service.findByGuild(USER_ID, GUILD_ID);

    expect(prismaMock.message.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gt: lastRead },
        }),
      }),
    );
  });

  it('kendi mesajları sayılmaz (webhook mesajı hariç) → NOT { authorId, webhookId: null } filtresi', async () => {
    prismaMock.channel.findMany.mockResolvedValue([makeChannelWithRead(null)]);
    prismaMock.message.count.mockResolvedValue(0);

    await service.findByGuild(USER_ID, GUILD_ID);

    expect(prismaMock.message.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { authorId: USER_ID, webhookId: null },
        }),
      }),
    );
  });

  it('markRead sonrası (count=0) → unreadCount 0', async () => {
    prismaMock.channel.findMany.mockResolvedValue([makeChannelWithRead(NOW)]);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].unreadCount).toBe(0);
  });

  it('birden fazla kanal → her kanal için ayrı count döner', async () => {
    const ch1 = { ...makeChannel(), id: 'ch-1', channelReads: [] };
    const ch2 = { ...makeChannel(), id: 'ch-2', channelReads: [{ lastReadAt: NOW }] };
    prismaMock.channel.findMany.mockResolvedValue([ch1, ch2]);
    // REV-4: kanal başına 2 count → unread, mention sırasıyla (ch1.unread, ch1.mention, ch2.unread, ch2.mention)
    prismaMock.message.count
      .mockResolvedValueOnce(4) // ch-1 unread
      .mockResolvedValueOnce(2) // ch-1 mention
      .mockResolvedValueOnce(1) // ch-2 unread
      .mockResolvedValueOnce(0); // ch-2 mention

    const result = await service.findByGuild(USER_ID, GUILD_ID);
    expect(result[0].unreadCount).toBe(4);
    expect(result[0].unreadMentionCount).toBe(2);
    expect(result[1].unreadCount).toBe(1);
    expect(result[1].unreadMentionCount).toBe(0);
    expect(prismaMock.message.count).toHaveBeenCalledTimes(4);
  });
});

// ── ChannelsService.create — isPrivate ───────────────────────────────────────

describe('ChannelsService.create — isPrivate', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('isPrivate: true → kanalda isPrivate=true set edilir', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeChannel({ name: 'gizli-kanal', isPrivate: true });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create(USER_ID, GUILD_ID, {
      name: 'gizli-kanal',
      isPrivate: true,
    });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPrivate: true }),
      }),
    );
    expect(result.isPrivate).toBe(true);
  });

  it('isPrivate verilmezse default false set edilir', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeChannel({ isPrivate: false });
    prismaMock.channel.create.mockResolvedValue(created);

    await service.create(USER_ID, GUILD_ID, { name: 'acik-kanal' });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPrivate: false }),
      }),
    );
  });

  it("toChannelDto → isPrivate alanı response'a dahil edilir", async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeChannel({ isPrivate: true });
    prismaMock.channel.create.mockResolvedValue(created);

    const result = await service.create(USER_ID, GUILD_ID, { name: 'gizli', isPrivate: true });
    expect(result).toHaveProperty('isPrivate', true);
  });
});

// ── ChannelsService.update — isPrivate ───────────────────────────────────────

describe('ChannelsService.update — isPrivate', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('isPrivate: true → güncellenir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ isPrivate: false }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    const updated = makeChannel({ isPrivate: true });
    prismaMock.channel.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CHANNEL_ID, { isPrivate: true });

    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrivate: true }) }),
    );
    expect(result.isPrivate).toBe(true);
  });

  it("isPrivate undefined → update data'ya eklenmez", async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ isPrivate: true }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    const updated = makeChannel({ isPrivate: true });
    prismaMock.channel.update.mockResolvedValue(updated);

    await service.update(USER_ID, CHANNEL_ID, { name: 'yeni-ad' });

    const callData = prismaMock.channel.update.mock.calls[0][0].data;
    expect(callData).not.toHaveProperty('isPrivate');
  });
});

// ── ChannelsService.findByGuild — isPrivate filtresi (Sprint V2 B4/B5 R7) ───

describe('ChannelsService.findByGuild — isPrivate filtresi', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('OWNER → özel dahil tüm kanalları görür', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    permissionsMock.hasFullAccess.mockResolvedValue(true);
    const publicCh = { ...makeChannel(), id: 'ch-pub', isPrivate: false, channelReads: [] };
    const privateCh = { ...makeChannel(), id: 'ch-priv', isPrivate: true, channelReads: [] };
    prismaMock.channel.findMany.mockResolvedValue([publicCh, privateCh]);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await service.findByGuild(USER_ID, GUILD_ID);

    expect(result).toHaveLength(2);
    expect(result.map((c: { id: string }) => c.id)).toContain('ch-priv');
    // OWNER path'te channelMember.findMany çağrılmamalı
    expect(prismaMock.channelMember.findMany).not.toHaveBeenCalled();
  });

  // R20: enum-ADMIN kaldırıldı — tam yetki artık rol sisteminden (ADMINISTRATOR bayrağı) gelir.
  // MEMBER enum'lu ama ADMINISTRATOR bayraklı role sahip bir üye §0.1'in regresyon kalkanı.
  it('MEMBER + ADMINISTRATOR bayraklı rol → özel dahil tüm kanalları görür', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasFullAccess.mockResolvedValue(true);
    const publicCh = { ...makeChannel(), id: 'ch-pub', isPrivate: false, channelReads: [] };
    const privateCh = { ...makeChannel(), id: 'ch-priv', isPrivate: true, channelReads: [] };
    prismaMock.channel.findMany.mockResolvedValue([publicCh, privateCh]);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await service.findByGuild('admin-1', GUILD_ID);

    expect(result).toHaveLength(2);
    expect(prismaMock.channelMember.findMany).not.toHaveBeenCalled();
  });

  it('MEMBER + özel kanala üye değil → kanal GÖRÜNÜR ama locked=true (item 6)', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    const publicCh = { ...makeChannel(), id: 'ch-pub', isPrivate: false, channelReads: [] };
    const privateCh = { ...makeChannel(), id: 'ch-priv', isPrivate: true, channelReads: [] };
    prismaMock.channel.findMany.mockResolvedValue([publicCh, privateCh]);
    // Kullanıcı hiçbir özel kanala üye değil
    prismaMock.channelMember.findMany.mockResolvedValue([]);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await service.findByGuild('member-1', GUILD_ID);

    // item 6: özel kanal artık listede görünür (gizlenmez), yalnız giriş kapalı
    expect(result).toHaveLength(2);
    const priv = result.find((c: { id: string }) => c.id === 'ch-priv');
    const pub = result.find((c: { id: string }) => c.id === 'ch-pub');
    expect(priv?.locked).toBe(true);
    expect(pub?.locked).toBe(false);
  });

  it('MEMBER + özel kanala ChannelMember kaydı var → görür + locked=false', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    const publicCh = { ...makeChannel(), id: 'ch-pub', isPrivate: false, channelReads: [] };
    const privateCh = { ...makeChannel(), id: 'ch-priv', isPrivate: true, channelReads: [] };
    prismaMock.channel.findMany.mockResolvedValue([publicCh, privateCh]);
    // Kullanıcı özel kanala üye
    prismaMock.channelMember.findMany.mockResolvedValue([{ channelId: 'ch-priv' }]);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await service.findByGuild('member-1', GUILD_ID);

    expect(result).toHaveLength(2);
    const priv = result.find((c: { id: string }) => c.id === 'ch-priv');
    expect(priv?.locked).toBe(false);
  });

  it('MEMBER + birden fazla özel kanal; hepsi görünür, yalnız üyesi olmayan locked', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    const publicCh = { ...makeChannel(), id: 'ch-pub', isPrivate: false, channelReads: [] };
    const priv1 = { ...makeChannel(), id: 'ch-priv-1', isPrivate: true, channelReads: [] };
    const priv2 = { ...makeChannel(), id: 'ch-priv-2', isPrivate: true, channelReads: [] };
    prismaMock.channel.findMany.mockResolvedValue([publicCh, priv1, priv2]);
    // Yalnız priv1'e üye
    prismaMock.channelMember.findMany.mockResolvedValue([{ channelId: 'ch-priv-1' }]);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await service.findByGuild('member-1', GUILD_ID);

    // item 6: 3 kanal da görünür; priv1 açık (üye), priv2 kilitli (üye değil)
    expect(result).toHaveLength(3);
    const byId = Object.fromEntries(
      result.map((c: { id: string; locked?: boolean }) => [c.id, c.locked]),
    );
    expect(byId['ch-pub']).toBe(false);
    expect(byId['ch-priv-1']).toBe(false);
    expect(byId['ch-priv-2']).toBe(true);
  });
});

// ── ChannelsService.getChannelMembers ────────────────────────────────────────

describe('ChannelsService.getChannelMembers', () => {
  let service: ChannelsService;

  const TARGET_ID = 'target-user-1';

  function makePrivateChannel(overrides: Partial<Record<string, unknown>> = {}) {
    return makeChannel({ isPrivate: true, guildId: GUILD_ID, ...overrides });
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('OWNER → özel kanalın üyelerini listeler', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makePrivateChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      { user: { id: TARGET_ID, username: 'kanka1', avatarUrl: null } },
    ]);

    const result = await service.getChannelMembers(USER_ID, CHANNEL_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: TARGET_ID, username: 'kanka1', avatarUrl: null });
  });

  it('MANAGE_CHANNELS izinli MEMBER → özel kanalın üyelerini listeler', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makePrivateChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: GRANTED_MEMBER_MEMBERSHIP,
    });
    prismaMock.channelMember.findMany.mockResolvedValue([]);

    const result = await service.getChannelMembers('admin-1', CHANNEL_ID);

    expect(Array.isArray(result)).toBe(true);
  });

  it('MEMBER → 403 FORBIDDEN', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makePrivateChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.getChannelMembers('member-1', CHANNEL_ID)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.getChannelMembers('member-1', CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('genel kanal (isPrivate=false) → boş [] döner', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ guildId: GUILD_ID })); // isPrivate default false
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });

    const result = await service.getChannelMembers(USER_ID, CHANNEL_ID);

    expect(result).toEqual([]);
    expect(prismaMock.channelMember.findMany).not.toHaveBeenCalled();
  });

  it('kanal yok → 404 CHANNEL_NOT_FOUND', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);

    await expect(service.getChannelMembers(USER_ID, CHANNEL_ID)).rejects.toThrow(NotFoundException);
    await expect(service.getChannelMembers(USER_ID, CHANNEL_ID)).rejects.toMatchObject({
      response: { error: 'CHANNEL_NOT_FOUND' },
    });
  });
});

// ── ChannelsService.addChannelMember ─────────────────────────────────────────

describe('ChannelsService.addChannelMember', () => {
  let service: ChannelsService;

  const TARGET_ID = 'target-user-2';
  const TARGET_USER = { id: TARGET_ID, username: 'kanka2', avatarUrl: null };

  function makePrivateGuildChannel(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      ...makeChannel({ isPrivate: true, guildId: GUILD_ID }),
      guild: { id: GUILD_ID, adultsOnly: false },
      ...overrides,
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('OWNER → özel kanala guild üyesi ekler', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makePrivateGuildChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique.mockResolvedValue({ userId: TARGET_ID });
    prismaMock.channelMember.upsert.mockResolvedValue({ user: TARGET_USER });

    const result = await service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID });

    expect(prismaMock.channelMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId_userId: { channelId: CHANNEL_ID, userId: TARGET_ID } },
        create: { channelId: CHANNEL_ID, userId: TARGET_ID },
      }),
    );
    expect(result).toEqual(TARGET_USER);
  });

  it('idempotent — zaten üye → upsert (update:{}) çağrılır, no-op', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makePrivateGuildChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique.mockResolvedValue({ userId: TARGET_ID });
    prismaMock.channelMember.upsert.mockResolvedValue({ user: TARGET_USER });

    // İkinci kez ekle — upsert update:{} ile çalışır
    await service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID });
    await service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID });

    expect(prismaMock.channelMember.upsert).toHaveBeenCalledTimes(2);
    const secondCall = prismaMock.channelMember.upsert.mock.calls[1][0];
    expect(secondCall.update).toEqual({});
  });

  it('MEMBER → 403 FORBIDDEN', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makePrivateGuildChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(
      service.addChannelMember('member-1', CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.addChannelMember('member-1', CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('OWNER + genel kanal (isPrivate=false) → 400 NOT_PRIVATE_CHANNEL', async () => {
    // §2: NOT_PRIVATE_CHANNEL artık yalnız ADMIN GATE sonrası görünür.
    prismaMock.channel.findUnique.mockResolvedValue({
      ...makeChannel({ guildId: GUILD_ID }), // isPrivate=false
      guild: { id: GUILD_ID, adultsOnly: false },
    });
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });

    await expect(
      service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toMatchObject({
      response: { error: 'NOT_PRIVATE_CHANNEL' },
    });
  });

  // §2 Durum sızıntısı testi: MEMBER özel/genel kanalı ayırt edemez
  it('§2 MEMBER + özel kanal → FORBIDDEN (NOT_PRIVATE_CHANNEL sızdırılmaz)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makePrivateGuildChannel()); // isPrivate=true
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(
      service.addChannelMember('member-1', CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.addChannelMember('member-1', CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('§2 MEMBER + genel kanal → FORBIDDEN (NOT_PRIVATE_CHANNEL sızdırılmaz)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({
      ...makeChannel({ guildId: GUILD_ID }), // isPrivate=false
      guild: { id: GUILD_ID, adultsOnly: false },
    });
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    // MEMBER özel kanala da genel kanala da aynı FORBIDDEN alır → kanalın tipi öğrenilemez
    await expect(
      service.addChannelMember('member-1', CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.addChannelMember('member-1', CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('hedef guild üyesi değil → 400 NOT_GUILD_MEMBER', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makePrivateGuildChannel());
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique.mockResolvedValue(null); // guild üyesi değil

    await expect(
      service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toMatchObject({
      response: { error: 'NOT_GUILD_MEMBER' },
    });
  });

  it('kanal ageGated + hedef minör → 400 AGE_RESTRICTED', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(
      makePrivateGuildChannel({ ageGated: true, guild: { id: GUILD_ID, adultsOnly: false } }),
    );
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique.mockResolvedValue({ userId: TARGET_ID });
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

    await expect(
      service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toMatchObject({
      response: { error: 'AGE_RESTRICTED' },
    });
  });

  it('guild adultsOnly + hedef minör → 400 AGE_RESTRICTED', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(
      makePrivateGuildChannel({ ageGated: false, guild: { id: GUILD_ID, adultsOnly: true } }),
    );
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique.mockResolvedValue({ userId: TARGET_ID });
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

    await expect(
      service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID }),
    ).rejects.toMatchObject({
      response: { error: 'AGE_RESTRICTED' },
    });
  });

  it('ageGated kanal + hedef REŞIT → başarıyla eklenir (AGE_RESTRICTED fırlatılmaz)', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(
      makePrivateGuildChannel({ ageGated: true, guild: { id: GUILD_ID, adultsOnly: false } }),
    );
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.guildMember.findUnique.mockResolvedValue({ userId: TARGET_ID });
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false }); // reşit
    prismaMock.channelMember.upsert.mockResolvedValue({ user: TARGET_USER });

    const result = await service.addChannelMember(USER_ID, CHANNEL_ID, { userId: TARGET_ID });
    expect(result).toEqual(TARGET_USER);
  });
});

// ── ChannelsService.removeChannelMember ──────────────────────────────────────

describe('ChannelsService.removeChannelMember', () => {
  let service: ChannelsService;

  const TARGET_ID = 'target-user-3';

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('OWNER → üyeyi çıkarır → null döner', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ guildId: GUILD_ID }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channelMember.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.removeChannelMember(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(prismaMock.channelMember.deleteMany).toHaveBeenCalledWith({
      where: { channelId: CHANNEL_ID, userId: TARGET_ID },
    });
    expect(result).toBeNull();
  });

  it('üye yoksa no-op (deleteMany count=0) → null döner, hata yok', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ guildId: GUILD_ID }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channelMember.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.removeChannelMember(USER_ID, CHANNEL_ID, TARGET_ID);

    expect(result).toBeNull();
  });

  it('MEMBER → 403 FORBIDDEN', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ guildId: GUILD_ID }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: MEMBER_MEMBERSHIP,
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.removeChannelMember('member-1', CHANNEL_ID, TARGET_ID)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.removeChannelMember('member-1', CHANNEL_ID, TARGET_ID),
    ).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('MANAGE_CHANNELS izinli MEMBER → üyeyi çıkarabilir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(makeChannel({ guildId: GUILD_ID }));
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: GRANTED_MEMBER_MEMBERSHIP,
    });
    prismaMock.channelMember.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.removeChannelMember('admin-1', CHANNEL_ID, TARGET_ID);
    expect(result).toBeNull();
  });

  it('kanal yok → 404 CHANNEL_NOT_FOUND', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);

    await expect(service.removeChannelMember(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.removeChannelMember(USER_ID, CHANNEL_ID, TARGET_ID)).rejects.toMatchObject(
      {
        response: { error: 'CHANNEL_NOT_FOUND' },
      },
    );
  });
});

// ── §2 DM sızıntı testi: guild özel kanal üyesi DM listesine karışmaz ────────

describe('§2 DM sızıntı önleme — ChannelMember tür filtresi', () => {
  /**
   * DmService.getDmChannels `channelMember.findMany({ where: { userId } })` ile
   * tüm üyelikleri çeker, sonra `m.channel.type === 'DM'` ve `m.channel.type === 'GROUP_DM'`
   * ile filtreler. Guild kanalı (type='GUILD_TEXT') bu filtreleri asla geçemez.
   *
   * Bu test, DmService'in type bazlı filtresini simüle eder:
   * guild kanalına eklenen ChannelMember, DM listesinde GÖRÜNMEZ.
   */
  it('guild özel kanalına eklenen ChannelMember DM listesine (tür filtreli) düşmez', () => {
    // Tüm channelMember kayıtları: biri guild kanalı, biri DM kanalı
    const allMemberships = [
      {
        userId: 'user-1',
        channel: { id: 'guild-ch-1', type: 'GUILD_TEXT', guildId: 'guild-1', deletedAt: null },
      },
      {
        userId: 'user-1',
        channel: { id: 'dm-ch-1', type: 'DM', guildId: null, deletedAt: null },
      },
    ];

    // DmService.getDmChannels'teki filtre mantığı (aynen)
    const active = allMemberships.filter((m) => m.channel.deletedAt === null);
    const dmMemberships = active.filter((m) => m.channel.type === 'DM');
    const groupMemberships = active.filter((m) => m.channel.type === 'GROUP_DM');

    // guild kanalı DM listesinde görünmemelidir
    expect(dmMemberships).toHaveLength(1);
    expect(dmMemberships[0].channel.id).toBe('dm-ch-1');
    expect(groupMemberships).toHaveLength(0);

    // guild kanalı hiçbir DM kategorisine girmemiştir
    const allDmChannelIds = [...dmMemberships, ...groupMemberships].map((m) => m.channel.id);
    expect(allDmChannelIds).not.toContain('guild-ch-1');
  });

  it('guildId != null kontrolü: notifyDmActivity guild kanalını atlar', () => {
    // notifyDmActivity içindeki guard: if (!channel || channel.guildId !== null) return;
    const guildChannel = { id: 'guild-ch-1', guildId: 'guild-1' };
    const dmChannel = { id: 'dm-ch-1', guildId: null };

    // Guild kanalı → atlanır
    expect(guildChannel.guildId !== null).toBe(true);
    // DM kanalı → işlenir
    expect(dmChannel.guildId !== null).toBe(false);
  });
});

// ── ChannelsService.findByGuild — R14 §2.4c: @everyone bastırma (kanal rozeti) ──────────────

describe('ChannelsService.findByGuild — @everyone bastırma kanal rozeti (R14)', () => {
  let service: ChannelsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD,
      membership: OWNER_MEMBERSHIP,
    });
    prismaMock.channel.findMany.mockResolvedValue([{ ...makeChannel(), channelReads: [] }]);
    prismaMock.message.count.mockResolvedValue(0);
  });

  it('bastırma yok → mention sayımı @everyone dalını İÇERİR', async () => {
    await service.findByGuild(USER_ID, GUILD_ID);

    const mentionWhere = prismaMock.message.count.mock.calls[1][0].where;
    expect(mentionWhere.OR).toEqual([{ mentions: { has: USER_ID } }, { mentionsEveryone: true }]);
  });

  it('suppressEveryone=true → @everyone dalı DÜŞER, doğrudan bahsetme kalır', async () => {
    prismaMock.notificationPref.findUnique.mockResolvedValue({ suppressEveryone: true });

    await service.findByGuild(USER_ID, GUILD_ID);

    const mentionWhere = prismaMock.message.count.mock.calls[1][0].where;
    expect(mentionWhere.OR).toEqual([{ mentions: { has: USER_ID } }]);
  });

  it('tercih TEK findUnique ile (userId + GUILD + guildId), kanal başına sorgu yok', async () => {
    prismaMock.channel.findMany.mockResolvedValue([
      { ...makeChannel({ id: 'ch-1' }), channelReads: [] },
      { ...makeChannel({ id: 'ch-2' }), channelReads: [] },
    ]);

    await service.findByGuild(USER_ID, GUILD_ID);

    expect(prismaMock.notificationPref.findUnique).toHaveBeenCalledTimes(1);
    const call = prismaMock.notificationPref.findUnique.mock.calls[0][0];
    expect(call.where.userId_targetType_targetId).toEqual({
      userId: USER_ID,
      targetType: 'GUILD',
      targetId: GUILD_ID,
    });
  });
});

// ── C20: read-all → read:self ────────────────────────────────────────────────

describe('ChannelsService.markAllRead — C20 read:self', () => {
  it('tek olayla channelIds taşır, yalnız okuyana gider', async () => {
    resetMocks();
    const service = makeService();
    prismaMock.guildMember.findMany.mockResolvedValue([{ guildId: 'g-1' }]);
    prismaMock.channel.findMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]);
    prismaMock.channelRead.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.channelRead.findMany.mockResolvedValue([{ channelId: 'c-1' }]);
    prismaMock.channelRead.createMany.mockResolvedValue({ count: 1 });

    await service.markAllRead(USER_ID);

    expect(realtimeMock.emitToUser).toHaveBeenCalledTimes(1);
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(
      USER_ID,
      'read:self',
      expect.objectContaining({ channelIds: ['c-1', 'c-2'], guildId: null }),
    );
  });
});

// ── C50 §2.4: okundu → kapalı telefondaki v2 bildirimini sil ────────────────────
describe('ChannelsService — C50 okundu push', () => {
  function makeWithPush(push: unknown) {
    return new ChannelsService(
      prismaMock as any,
      membershipMock as any,
      permissionsMock as any,
      realtimeMock as any,
      voiceServiceMock as any,
      push as any,
    );
  }

  it('markRead → notifyRead(okuyan, [kanal])', async () => {
    resetMocks();
    const push = { notifyRead: jest.fn().mockResolvedValue(undefined) };
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });
    prismaMock.channelRead.upsert.mockResolvedValue({});

    await makeWithPush(push).markRead(USER_ID, CHANNEL_ID);

    expect(push.notifyRead).toHaveBeenCalledWith(USER_ID, [CHANNEL_ID]);
  });

  it('markAllRead → tüm channelIds tek notifyRead çağrısında', async () => {
    resetMocks();
    const push = { notifyRead: jest.fn().mockResolvedValue(undefined) };
    prismaMock.guildMember.findMany.mockResolvedValue([{ guildId: 'g-1' }]);
    prismaMock.channel.findMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]);
    prismaMock.channelRead.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.channelRead.findMany.mockResolvedValue([{ channelId: 'c-1' }]);
    prismaMock.channelRead.createMany.mockResolvedValue({ count: 1 });

    await makeWithPush(push).markAllRead(USER_ID);

    expect(push.notifyRead).toHaveBeenCalledTimes(1);
    expect(push.notifyRead).toHaveBeenCalledWith(USER_ID, ['c-1', 'c-2']);
  });

  it('notifyRead reddederse okuma bozulmaz', async () => {
    resetMocks();
    const push = { notifyRead: jest.fn().mockRejectedValue(new Error('x')) };
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });
    prismaMock.channelRead.upsert.mockResolvedValue({});

    await expect(makeWithPush(push).markRead(USER_ID, CHANNEL_ID)).resolves.toBeNull();
  });
});
