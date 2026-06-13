import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  channelCategory: {
    aggregate: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  channel: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const membershipMock = {
  requireGuildMembership: jest.fn(),
};

function makeService() {
  return new CategoriesService(prismaMock as any, membershipMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const GUILD_ID = 'guild-1';
const OTHER_GUILD_ID = 'guild-2';
const USER_ID = 'user-1';
const CATEGORY_ID = 'cat-1';

const OWNER_MEMBERSHIP = { guildId: GUILD_ID, userId: USER_ID, role: 'OWNER' };
const ADMIN_MEMBERSHIP = { guildId: GUILD_ID, userId: 'admin-1', role: 'ADMIN' };
const MEMBER_MEMBERSHIP = { guildId: GUILD_ID, userId: 'member-1', role: 'MEMBER' };
const GUILD = { id: GUILD_ID, deletedAt: null };

function makeCategory(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CATEGORY_ID,
    guildId: GUILD_ID,
    name: 'Genel',
    position: 0,
    deletedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── CategoriesService.create ──────────────────────────────────────────────────

describe('CategoriesService.create', () => {
  let service: CategoriesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('MEMBER → 403 FORBIDDEN fırlatır', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: MEMBER_MEMBERSHIP });

    await expect(service.create('member-1', GUILD_ID, { name: 'Yeni' })).rejects.toThrow(ForbiddenException);
    await expect(service.create('member-1', GUILD_ID, { name: 'Yeni' })).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('OWNER → kategori oluşturur; position = max + 1', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channelCategory.aggregate.mockResolvedValue({ _max: { position: 2 } });
    const created = makeCategory({ name: 'Yeni', position: 3 });
    prismaMock.channelCategory.create.mockResolvedValue(created);

    const result = await service.create(USER_ID, GUILD_ID, { name: 'Yeni' });

    expect(prismaMock.channelCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ guildId: GUILD_ID, name: 'Yeni', position: 3 }),
      }),
    );
    expect(result).toMatchObject({ id: CATEGORY_ID, guildId: GUILD_ID, name: 'Yeni', position: 3 });
  });

  it('ADMIN → kategori oluşturur', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: ADMIN_MEMBERSHIP });
    prismaMock.channelCategory.aggregate.mockResolvedValue({ _max: { position: null } });
    const created = makeCategory({ name: 'Admin Kategori', position: 0 });
    prismaMock.channelCategory.create.mockResolvedValue(created);

    const result = await service.create('admin-1', GUILD_ID, { name: 'Admin Kategori' });
    expect(result).toMatchObject({ name: 'Admin Kategori' });
  });

  it('ilk kategori (max=null) → position 0 hesaplanır', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channelCategory.aggregate.mockResolvedValue({ _max: { position: null } });
    const created = makeCategory({ position: 0 });
    prismaMock.channelCategory.create.mockResolvedValue(created);

    await service.create(USER_ID, GUILD_ID, { name: 'İlk' });

    expect(prismaMock.channelCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 0 }) }),
    );
  });

  it('ikinci kategori (max=0) → position 1 hesaplanır', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.channelCategory.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = makeCategory({ position: 1 });
    prismaMock.channelCategory.create.mockResolvedValue(created);

    await service.create(USER_ID, GUILD_ID, { name: 'İkinci' });

    expect(prismaMock.channelCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 1 }) }),
    );
  });
});

// ── CategoriesService.findByGuild ─────────────────────────────────────────────

describe('CategoriesService.findByGuild', () => {
  let service: CategoriesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('üye → kategorileri position asc sırasıyla döner', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    const cats = [
      makeCategory({ id: 'cat-1', name: 'A', position: 0 }),
      makeCategory({ id: 'cat-2', name: 'B', position: 1 }),
    ];
    prismaMock.channelCategory.findMany.mockResolvedValue(cats);

    const result = await service.findByGuild(USER_ID, GUILD_ID);

    expect(prismaMock.channelCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId: GUILD_ID, deletedAt: null },
        orderBy: { position: 'asc' },
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'cat-1', position: 0 });
    expect(result[1]).toMatchObject({ id: 'cat-2', position: 1 });
  });

  it('üye değil → requireGuildMembership exception fırlatır', async () => {
    membershipMock.requireGuildMembership.mockRejectedValue(new ForbiddenException('FORBIDDEN'));

    await expect(service.findByGuild('stranger', GUILD_ID)).rejects.toThrow(ForbiddenException);
    expect(prismaMock.channelCategory.findMany).not.toHaveBeenCalled();
  });

  it('silinmiş kategoriler dahil edilmez (where filtresi)', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: MEMBER_MEMBERSHIP });
    prismaMock.channelCategory.findMany.mockResolvedValue([]);

    await service.findByGuild('member-1', GUILD_ID);

    expect(prismaMock.channelCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });
});

// ── CategoriesService.update ──────────────────────────────────────────────────

describe('CategoriesService.update', () => {
  let service: CategoriesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('kategori yok → 404 CATEGORY_NOT_FOUND', async () => {
    prismaMock.channelCategory.findUnique.mockResolvedValue(null);

    await expect(service.update(USER_ID, CATEGORY_ID, { name: 'Yeni' })).rejects.toThrow(NotFoundException);
    await expect(service.update(USER_ID, CATEGORY_ID, { name: 'Yeni' })).rejects.toMatchObject({
      response: { error: 'CATEGORY_NOT_FOUND' },
    });
  });

  it('MEMBER → 403 FORBIDDEN', async () => {
    prismaMock.channelCategory.findUnique.mockResolvedValue(makeCategory());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: MEMBER_MEMBERSHIP });

    await expect(service.update('member-1', CATEGORY_ID, { name: 'Yeni' })).rejects.toThrow(ForbiddenException);
  });

  it('OWNER → adı günceller', async () => {
    prismaMock.channelCategory.findUnique.mockResolvedValue(makeCategory());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    const updated = makeCategory({ name: 'Güncel Ad' });
    prismaMock.channelCategory.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CATEGORY_ID, { name: 'Güncel Ad' });
    expect(result).toMatchObject({ name: 'Güncel Ad' });
    expect(prismaMock.channelCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Güncel Ad' }) }),
    );
  });

  it('OWNER → position günceller', async () => {
    prismaMock.channelCategory.findUnique.mockResolvedValue(makeCategory({ position: 0 }));
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    const updated = makeCategory({ position: 3 });
    prismaMock.channelCategory.update.mockResolvedValue(updated);

    const result = await service.update(USER_ID, CATEGORY_ID, { position: 3 });
    expect(result.position).toBe(3);
  });
});

// ── CategoriesService.remove ──────────────────────────────────────────────────

describe('CategoriesService.remove', () => {
  let service: CategoriesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('kategori yok → 404 CATEGORY_NOT_FOUND', async () => {
    prismaMock.channelCategory.findUnique.mockResolvedValue(null);

    await expect(service.remove(USER_ID, CATEGORY_ID)).rejects.toThrow(NotFoundException);
    await expect(service.remove(USER_ID, CATEGORY_ID)).rejects.toMatchObject({
      response: { error: 'CATEGORY_NOT_FOUND' },
    });
  });

  it('MEMBER → 403 FORBIDDEN', async () => {
    prismaMock.channelCategory.findUnique.mockResolvedValue(makeCategory());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: MEMBER_MEMBERSHIP });

    await expect(service.remove('member-1', CATEGORY_ID)).rejects.toThrow(ForbiddenException);
  });

  it('OWNER → transaction: kanallar categoryId=null, kategori soft-delete; null döner', async () => {
    prismaMock.channelCategory.findUnique.mockResolvedValue(makeCategory());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MEMBERSHIP });
    prismaMock.$transaction.mockResolvedValue([{ count: 2 }, makeCategory({ deletedAt: new Date() })]);

    const result = await service.remove(USER_ID, CATEGORY_ID);

    expect(prismaMock.$transaction).toHaveBeenCalled();
    // Transaction içinde channel.updateMany ve channelCategory.update çağrılmalı
    expect(prismaMock.channel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId: CATEGORY_ID, deletedAt: null },
        data: { categoryId: null },
      }),
    );
    expect(prismaMock.channelCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CATEGORY_ID },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(result).toBeNull();
  });

  it('ADMIN → silme yetkisi var', async () => {
    prismaMock.channelCategory.findUnique.mockResolvedValue(makeCategory());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: ADMIN_MEMBERSHIP });
    prismaMock.$transaction.mockResolvedValue([]);

    const result = await service.remove('admin-1', CATEGORY_ID);
    expect(result).toBeNull();
  });
});

// ── ChannelsService — INVALID_CATEGORY (cross-guild) ─────────────────────────
// Bu testler ChannelsService'in validateCategoryBelongsToGuild mantığını test eder.
// Import edip mock üzerinden test edelim.

import { ChannelsService } from '../channels/channels.service';

describe('ChannelsService — categoryId cross-guild guard (INVALID_CATEGORY)', () => {
  const channelPrismaMock = {
    channel: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    channelRead: { upsert: jest.fn() },
    message: { count: jest.fn() },
    channelCategory: { findUnique: jest.fn() },
  };

  const channelMembershipMock = {
    requireGuildMembership: jest.fn(),
    requireChannelAccess: jest.fn(),
  };

  let channelService: ChannelsService;

  const OWNER_MS = { guildId: GUILD_ID, userId: USER_ID, role: 'OWNER' };

  beforeEach(() => {
    jest.resetAllMocks();
    channelService = new ChannelsService(channelPrismaMock as any, channelMembershipMock as any);
  });

  it('create: başka guild kategorisi → 400 INVALID_CATEGORY', async () => {
    channelMembershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MS });
    // Kategori başka guild'e ait
    channelPrismaMock.channelCategory.findUnique.mockResolvedValue({
      id: 'cat-other',
      guildId: OTHER_GUILD_ID,
      deletedAt: null,
    });

    await expect(
      channelService.create(USER_ID, GUILD_ID, { name: 'kanal', categoryId: 'cat-other' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      channelService.create(USER_ID, GUILD_ID, { name: 'kanal', categoryId: 'cat-other' }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_CATEGORY' } });
  });

  it('create: silinmiş kategori → 400 INVALID_CATEGORY', async () => {
    channelMembershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MS });
    channelPrismaMock.channelCategory.findUnique.mockResolvedValue({
      id: CATEGORY_ID,
      guildId: GUILD_ID,
      deletedAt: new Date(), // silinmiş
    });

    await expect(
      channelService.create(USER_ID, GUILD_ID, { name: 'kanal', categoryId: CATEGORY_ID }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_CATEGORY' } });
  });

  it('create: var olmayan kategori → 400 INVALID_CATEGORY', async () => {
    channelMembershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MS });
    channelPrismaMock.channelCategory.findUnique.mockResolvedValue(null);

    await expect(
      channelService.create(USER_ID, GUILD_ID, { name: 'kanal', categoryId: 'nonexistent' }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_CATEGORY' } });
  });

  it('update: başka guild kategorisi → 400 INVALID_CATEGORY', async () => {
    channelPrismaMock.channel.findUnique.mockResolvedValue({
      id: 'ch-1', guildId: GUILD_ID, deletedAt: null,
    });
    channelMembershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MS });
    channelPrismaMock.channelCategory.findUnique.mockResolvedValue({
      id: 'cat-other', guildId: OTHER_GUILD_ID, deletedAt: null,
    });

    await expect(
      channelService.update(USER_ID, 'ch-1', { categoryId: 'cat-other' }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_CATEGORY' } });
  });

  it('create: geçerli kategori (aynı guild, silinmemiş) → başarıyla oluşturulur', async () => {
    channelMembershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MS });
    channelPrismaMock.channelCategory.findUnique.mockResolvedValue({
      id: CATEGORY_ID, guildId: GUILD_ID, deletedAt: null,
    });
    channelPrismaMock.channel.aggregate.mockResolvedValue({ _max: { position: 0 } });
    const created = {
      id: 'ch-new', type: 'GUILD_TEXT', guildId: GUILD_ID, categoryId: CATEGORY_ID,
      name: 'kanal', ageGated: false, position: 1, slowModeSeconds: 0, deletedAt: null, createdAt: new Date(),
    };
    channelPrismaMock.channel.create.mockResolvedValue(created);

    const result = await channelService.create(USER_ID, GUILD_ID, { name: 'kanal', categoryId: CATEGORY_ID });
    expect(result).toMatchObject({ categoryId: CATEGORY_ID });
  });

  it('update: categoryId=null → kategorisizleştirir (doğrulama çalışmaz)', async () => {
    channelPrismaMock.channel.findUnique.mockResolvedValue({
      id: 'ch-1', guildId: GUILD_ID, deletedAt: null,
    });
    channelMembershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD, membership: OWNER_MS });
    const updated = {
      id: 'ch-1', type: 'GUILD_TEXT', guildId: GUILD_ID, categoryId: null,
      name: 'kanal', ageGated: false, position: 0, slowModeSeconds: 0, deletedAt: null, createdAt: new Date(),
    };
    channelPrismaMock.channel.update.mockResolvedValue(updated);

    const result = await channelService.update(USER_ID, 'ch-1', { categoryId: null });

    // validateCategoryBelongsToGuild çağrılmamalı
    expect(channelPrismaMock.channelCategory.findUnique).not.toHaveBeenCalled();
    expect(result).toMatchObject({ categoryId: null });
  });
});
