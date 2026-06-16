import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GuildsService } from './guilds.service';
import { PresignIconDto } from './dto/presign-icon.dto';
import { SetIconDto } from './dto/set-icon.dto';
import { AssignableGuildRole } from './dto/update-member-role.dto';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  guild: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  guildMember: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  guildMemberRole: {
    findMany: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  role: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
  },
  channel: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  channelCategory: {
    create: jest.fn(),
  },
  channelMember: {
    deleteMany: jest.fn(),
  },
  guildBan: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  message: {
    count: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const membershipMock = {
  requireGuildMembership: jest.fn(),
};

// PermissionsService mock — varsayılan: hasGuildPermission → true (yetkili);
// requireMemberHierarchy → undefined (geçer). Bireysel testler override eder.
const permissionsMock = {
  hasGuildPermission: jest.fn().mockResolvedValue(true),
  requireMemberHierarchy: jest.fn().mockResolvedValue(undefined),
  requireRoleHierarchy: jest.fn().mockResolvedValue(undefined),
};

const storageMock = {
  presignPut: jest.fn(),
  presignGet: jest.fn(),
  delete: jest.fn(),
};

const configMock = {
  get: jest.fn((key: string) => {
    const values: Record<string, unknown> = {
      's3.publicUrl': 'http://localhost:9000/kankaverse',
      uploadsEnabled: true,
    };
    return values[key];
  }),
};

const realtimeMock = { emitToUser: jest.fn(), emitToUsers: jest.fn(), emitToRoom: jest.fn() };

function makeService() {
  return new GuildsService(
    prismaMock as any,
    membershipMock as any,
    permissionsMock as any,
    storageMock as any,
    configMock as any,
    realtimeMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  permissionsMock.hasGuildPermission.mockResolvedValue(true);
  permissionsMock.requireMemberHierarchy.mockResolvedValue(undefined);
  permissionsMock.requireRoleHierarchy.mockResolvedValue(undefined);
  configMock.get.mockImplementation((key: string) => {
    const values: Record<string, unknown> = {
      's3.publicUrl': 'http://localhost:9000/kankaverse',
      uploadsEnabled: true,
    };
    return values[key];
  });
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const OWNER_ID = 'user-owner';
const MEMBER_ID = 'user-member';
const GUILD_ID = 'guild-abc';

const GUILD_FIXTURE = {
  id: GUILD_ID,
  name: 'Test Ortamı',
  ownerId: OWNER_ID,
  adultsOnly: false,
  iconUrl: null,
  description: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const OWNER_MEMBERSHIP = { guildId: GUILD_ID, userId: OWNER_ID, role: 'OWNER' };
const MEMBER_MEMBERSHIP = { guildId: GUILD_ID, userId: MEMBER_ID, role: 'MEMBER' };

// ── GuildsService.presignIcon ─────────────────────────────────────────────────

describe('GuildsService.presignIcon', () => {
  let service: GuildsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    storageMock.presignPut.mockResolvedValue('https://minio/presigned-put-url');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // İzin verilmeyen içerik tipi → UNSUPPORTED_TYPE
  // ─────────────────────────────────────────────────────────────────────────
  it('desteklenmeyen contentType → BadRequestException UNSUPPORTED_TYPE', async () => {
    const dto: PresignIconDto = { contentType: 'image/tiff' };

    await expect(service.presignIcon(OWNER_ID, GUILD_ID, dto)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UNSUPPORTED_TYPE' }),
    });

    // Guild kontrolüne bile gitmemeli
    expect(prismaMock.guild.findUnique).not.toHaveBeenCalled();
    expect(storageMock.presignPut).not.toHaveBeenCalled();
  });

  it('video/mp4 → UNSUPPORTED_TYPE', async () => {
    const dto: PresignIconDto = { contentType: 'video/mp4' };
    await expect(service.presignIcon(OWNER_ID, GUILD_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OWNER değil → 403 FORBIDDEN
  // ─────────────────────────────────────────────────────────────────────────
  it('OWNER olmayan üye → ForbiddenException FORBIDDEN', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_MEMBERSHIP);

    const dto: PresignIconDto = { contentType: 'image/png' };

    await expect(service.presignIcon(MEMBER_ID, GUILD_ID, dto)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });

    expect(storageMock.presignPut).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Guild bulunamadı → 404
  // ─────────────────────────────────────────────────────────────────────────
  it('guild yok → NotFoundException GUILD_NOT_FOUND', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(null);

    const dto: PresignIconDto = { contentType: 'image/png' };

    await expect(service.presignIcon(OWNER_ID, GUILD_ID, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(storageMock.presignPut).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Geçerli istek → { uploadUrl, storageKey } döner
  // ─────────────────────────────────────────────────────────────────────────
  it('OWNER + geçerli contentType → presignPut çağrılır, { uploadUrl, storageKey } döner', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);

    const dto: PresignIconDto = { contentType: 'image/png' };

    const result = await service.presignIcon(OWNER_ID, GUILD_ID, dto);

    expect(storageMock.presignPut).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('uploadUrl', 'https://minio/presigned-put-url');
    expect(result).toHaveProperty('storageKey');
    // storageKey bu guild'in icons/ prefix'ini içermeli
    expect((result as { storageKey: string }).storageKey).toMatch(
      new RegExp(`^icons/${GUILD_ID}/`),
    );
  });

  it('OWNER + image/webp → storageKey .webp uzantısıyla biter', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);

    const dto: PresignIconDto = { contentType: 'image/webp' };
    const result = await service.presignIcon(OWNER_ID, GUILD_ID, dto) as { storageKey: string };

    expect(result.storageKey).toMatch(/\.webp$/);
  });
});

// ── GuildsService.setIcon ─────────────────────────────────────────────────────

describe('GuildsService.setIcon', () => {
  let service: GuildsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OWNER değil → 403
  // ─────────────────────────────────────────────────────────────────────────
  it('OWNER olmayan üye → ForbiddenException FORBIDDEN', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_MEMBERSHIP);

    const dto: SetIconDto = { storageKey: `icons/${GUILD_ID}/abc.png` };

    await expect(service.setIcon(MEMBER_ID, GUILD_ID, dto)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });

    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Yanlış prefix → INVALID_STORAGE_KEY
  // ─────────────────────────────────────────────────────────────────────────
  it('yanlış guild prefix → BadRequestException INVALID_STORAGE_KEY', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);

    const dto: SetIconDto = { storageKey: 'icons/other-guild/abc.png' };

    await expect(service.setIcon(OWNER_ID, GUILD_ID, dto)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'INVALID_STORAGE_KEY' }),
    });

    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('attachments/ prefix ile başlayan anahtar → INVALID_STORAGE_KEY', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);

    const dto: SetIconDto = { storageKey: `attachments/${GUILD_ID}/abc.png` };

    await expect(service.setIcon(OWNER_ID, GUILD_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Geçerli storageKey → iconUrl doğru set edilir
  // ─────────────────────────────────────────────────────────────────────────
  it('geçerli storageKey → iconUrl publicUrl + "/" + storageKey olarak kaydedilir', async () => {
    const storageKey = `icons/${GUILD_ID}/550e8400.png`;
    const expectedIconUrl = `http://localhost:9000/kankaverse/${storageKey}`;

    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, iconUrl: expectedIconUrl });

    const dto: SetIconDto = { storageKey };

    const result = await service.setIcon(OWNER_ID, GUILD_ID, dto) as { iconUrl: string | null };

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { iconUrl: expectedIconUrl },
    });
    expect(result.iconUrl).toBe(expectedIconUrl);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // storageKey null → iconUrl null (ikon kaldırma)
  // ─────────────────────────────────────────────────────────────────────────
  it('storageKey null → iconUrl null olarak güncellenir (ikon kaldırma)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, iconUrl: null });

    const dto: SetIconDto = { storageKey: null };

    const result = await service.setIcon(OWNER_ID, GUILD_ID, dto) as { iconUrl: string | null };

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { iconUrl: null },
    });
    expect(result.iconUrl).toBeNull();
  });

  it('storageKey undefined (alan hiç gönderilmemiş) → iconUrl null olarak güncellenir', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, iconUrl: null });

    const dto: SetIconDto = {};

    const result = await service.setIcon(OWNER_ID, GUILD_ID, dto) as { iconUrl: string | null };

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { iconUrl: null },
    });
    expect(result.iconUrl).toBeNull();
  });
});

// ── GuildsService.findMyGuilds — unreadCount ─────────────────────────────────

describe('GuildsService.findMyGuilds — unreadCount', () => {
  let service: GuildsService;

  const NOW = new Date('2026-06-13T12:00:00Z');

  function makeGuildWithChannels(channels: { lastReadAt?: Date | null }[]) {
    return {
      guild: {
        ...GUILD_FIXTURE,
        channels: channels.map((ch, idx) => ({
          id: `ch-${idx + 1}`,
          guildId: GUILD_ID,
          channelReads: ch.lastReadAt ? [{ lastReadAt: ch.lastReadAt }] : [],
        })),
      },
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('tüm kanallar okunmuş (count=0) → guild unreadCount 0', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([{ lastReadAt: NOW }]),
    ]);
    prismaMock.message.count.mockResolvedValue(0);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(0);
  });

  it('bir kanalda 3 okunmamış → guild unreadCount 3', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([{ lastReadAt: NOW }]),
    ]);
    prismaMock.message.count.mockResolvedValue(3);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(3);
  });

  it('okuma kaydı yok → message.count authorId filtresi içerir, createdAt filtresi olmaz', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([{ lastReadAt: null }]),
    ]);
    prismaMock.message.count.mockResolvedValue(5);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(5);

    const callArg = prismaMock.message.count.mock.calls[0][0];
    expect(callArg.where).toMatchObject({ authorId: { not: OWNER_ID } });
    expect(callArg.where).not.toHaveProperty('createdAt');
  });

  it('birden fazla kanal → unreadCount toplamları guild sayacına yansır', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([{ lastReadAt: NOW }, { lastReadAt: null }]),
    ]);
    // REV-4: kanal başına unread + mention sırasıyla
    prismaMock.message.count
      .mockResolvedValueOnce(2) // ch-1 unread
      .mockResolvedValueOnce(0) // ch-1 mention
      .mockResolvedValueOnce(3) // ch-2 unread
      .mockResolvedValueOnce(0); // ch-2 mention

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(5);
  });

  it('kanalı olmayan guild → unreadCount 0', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([]),
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(0);
    expect(prismaMock.message.count).not.toHaveBeenCalled();
  });

  it('birden fazla guild → her guild bağımsız unreadCount alır', async () => {
    const guild2 = { ...GUILD_FIXTURE, id: 'guild-2', name: 'İkinci Ortam' };
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([{ lastReadAt: NOW }]),
      {
        guild: {
          ...guild2,
          channels: [{ id: 'ch-g2', guildId: 'guild-2', channelReads: [] }],
        },
      },
    ]);
    // REV-4: kanal başına unread + mention sırasıyla (guild1.unread, guild1.mention, guild2.unread, guild2.mention)
    prismaMock.message.count
      .mockResolvedValueOnce(1) // guild-1 ch unread
      .mockResolvedValueOnce(0) // guild-1 ch mention
      .mockResolvedValueOnce(7) // guild-2 ch unread
      .mockResolvedValueOnce(0); // guild-2 ch mention

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(1);
    expect(result[1].unreadCount).toBe(7);
  });
});

// ── GuildsService.create — varsayılan kategori (Sprint V2 A) ─────────────────

describe('GuildsService.create — varsayılan kategori', () => {
  let service: GuildsService;

  const CATEGORY_ID = 'cat-default';

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('guild oluşturulunca "Metin Kanalları" kategorisi ve genel-sohbet kanalı o kategoride yaratılır', async () => {
    // $transaction çağrısını gerçek tx objesi simüle ederek tetikle
    const txMock = {
      guild: { create: jest.fn().mockResolvedValue(GUILD_FIXTURE) },
      guildMember: { create: jest.fn().mockResolvedValue({}) },
      channelCategory: {
        create: jest.fn().mockResolvedValue({ id: CATEGORY_ID, name: 'Metin Kanalları', position: 0, guildId: GUILD_ID }),
      },
      channel: { create: jest.fn().mockResolvedValue({}) },
      role: { create: jest.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

    await service.create(OWNER_ID, { name: 'Test Ortamı' });

    // Kategori oluşturuldu
    expect(txMock.channelCategory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        guildId: GUILD_FIXTURE.id,
        name: 'Metin Kanalları',
        position: 0,
      }),
    });

    // Kanal bu kategoriye bağlı oluşturuldu
    expect(txMock.channel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        guildId: GUILD_FIXTURE.id,
        name: 'genel-sohbet',
        categoryId: CATEGORY_ID,
      }),
    });
  });

  it('guild create → toGuildDto sonucu döner (id, name, ownerId)', async () => {
    const txMock = {
      guild: { create: jest.fn().mockResolvedValue(GUILD_FIXTURE) },
      guildMember: { create: jest.fn().mockResolvedValue({}) },
      channelCategory: { create: jest.fn().mockResolvedValue({ id: CATEGORY_ID }) },
      channel: { create: jest.fn().mockResolvedValue({}) },
      role: { create: jest.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

    const result = await service.create(OWNER_ID, { name: 'Test Ortamı' });

    expect(result).toMatchObject({
      id: GUILD_ID,
      name: 'Test Ortamı',
      ownerId: OWNER_ID,
    });
  });

  it('varsayılan kanal categoryId = oluşturulan kategorinin id\'si', async () => {
    const dynamicCatId = 'dyn-cat-999';
    const txMock = {
      guild: { create: jest.fn().mockResolvedValue(GUILD_FIXTURE) },
      guildMember: { create: jest.fn().mockResolvedValue({}) },
      channelCategory: { create: jest.fn().mockResolvedValue({ id: dynamicCatId }) },
      channel: { create: jest.fn().mockResolvedValue({}) },
      role: { create: jest.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

    await service.create(OWNER_ID, { name: 'Yeni Ortam' });

    const channelCall = txMock.channel.create.mock.calls[0][0];
    expect(channelCall.data.categoryId).toBe(dynamicCatId);
  });
});

// ── §A: GuildsService.deleteGuild ────────────────────────────────────────────

describe('GuildsService.deleteGuild — §A', () => {
  let service: GuildsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it('OWNER → guild.update deletedAt set edilir, null döner', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, deletedAt: new Date() });

    const result = await service.deleteGuild(OWNER_ID, GUILD_ID);

    expect(result).toBeNull();
    expect(prismaMock.guild.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: GUILD_ID }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
  });

  it('ADMIN → ForbiddenException FORBIDDEN', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue({ ...MEMBER_MEMBERSHIP, role: 'ADMIN' });

    await expect(service.deleteGuild(MEMBER_ID, GUILD_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('MEMBER → ForbiddenException FORBIDDEN', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_MEMBERSHIP);

    await expect(service.deleteGuild(MEMBER_ID, GUILD_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('guild yok → NotFoundException GUILD_NOT_FOUND', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(null);

    await expect(service.deleteGuild(OWNER_ID, GUILD_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });
});

// ── §B: GuildsService.updateMemberRole ────────────────────────────────────────

const ADMIN_ID = 'user-admin';
const ADMIN_MEMBERSHIP = { id: 'gm-admin', guildId: GUILD_ID, userId: ADMIN_ID, role: 'ADMIN' };
const MEMBER_MEMBERSHIP_WITH_ID = { id: 'gm-member', guildId: GUILD_ID, userId: MEMBER_ID, role: 'MEMBER' };
const OWNER_MEMBERSHIP_WITH_ID = { id: 'gm-owner', guildId: GUILD_ID, userId: OWNER_ID, role: 'OWNER' };

const USER_ADMIN = { id: ADMIN_ID, username: 'admin-user', avatarUrl: null };
const USER_MEMBER = { id: MEMBER_ID, username: 'member-user', avatarUrl: null };

describe('GuildsService.updateMemberRole — §B (R7)', () => {
  let service: GuildsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  // ── Başarılı senaryolar ───────────────────────────────────────────────────

  it('OWNER → MEMBER\'ı ADMIN\'e yükseltir; güncel üye DTO döner', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP_WITH_ID)            // requireOwner actor kontrolü
      .mockResolvedValueOnce({ ...MEMBER_MEMBERSHIP_WITH_ID, user: USER_MEMBER }); // hedef

    const updatedMember = { ...MEMBER_MEMBERSHIP_WITH_ID, role: 'ADMIN', user: USER_MEMBER };
    prismaMock.guildMember.update.mockResolvedValue(updatedMember);

    const result = await service.updateMemberRole(OWNER_ID, GUILD_ID, MEMBER_ID, { role: AssignableGuildRole.ADMIN });

    expect(prismaMock.guildMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId_userId: { guildId: GUILD_ID, userId: MEMBER_ID } },
        data: { role: 'ADMIN' },
      }),
    );
    expect(result.role).toBe('ADMIN');
    expect(result.userId).toBe(MEMBER_ID);
  });

  it('OWNER → ADMIN\'i MEMBER\'a düşürür', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP_WITH_ID)
      .mockResolvedValueOnce({ ...ADMIN_MEMBERSHIP, user: USER_ADMIN });

    const updatedMember = { ...ADMIN_MEMBERSHIP, role: 'MEMBER', user: USER_ADMIN };
    prismaMock.guildMember.update.mockResolvedValue(updatedMember);

    const result = await service.updateMemberRole(OWNER_ID, GUILD_ID, ADMIN_ID, { role: AssignableGuildRole.MEMBER });

    expect(result.role).toBe('MEMBER');
  });

  it('idempotent: zaten ADMIN olan hedef ADMIN→ADMIN → güncelleme yine çağrılır (no-op-ok)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP_WITH_ID)
      .mockResolvedValueOnce({ ...ADMIN_MEMBERSHIP, user: USER_ADMIN });

    const updatedMember = { ...ADMIN_MEMBERSHIP, role: 'ADMIN', user: USER_ADMIN };
    prismaMock.guildMember.update.mockResolvedValue(updatedMember);

    const result = await service.updateMemberRole(OWNER_ID, GUILD_ID, ADMIN_ID, { role: AssignableGuildRole.ADMIN });
    expect(result.role).toBe('ADMIN');
    expect(prismaMock.guildMember.update).toHaveBeenCalledTimes(1);
  });

  // ── Hata senaryoları ─────────────────────────────────────────────────────

  it('ADMIN aktör → ForbiddenException FORBIDDEN (R7: yalnız OWNER değiştirir)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBERSHIP); // requireOwner: ADMIN → reddeder

    await expect(
      service.updateMemberRole(ADMIN_ID, GUILD_ID, MEMBER_ID, { role: AssignableGuildRole.MEMBER }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ error: 'FORBIDDEN' }) });

    expect(prismaMock.guildMember.update).not.toHaveBeenCalled();
  });

  it('hedef OWNER → BadRequestException CANNOT_MODIFY_OWNER', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP_WITH_ID)
      .mockResolvedValueOnce({ ...OWNER_MEMBERSHIP_WITH_ID, user: { id: OWNER_ID, username: 'owner', avatarUrl: null } });

    await expect(
      service.updateMemberRole(OWNER_ID, GUILD_ID, OWNER_ID, { role: AssignableGuildRole.MEMBER }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ error: 'CANNOT_MODIFY_OWNER' }) });

    expect(prismaMock.guildMember.update).not.toHaveBeenCalled();
  });

  it('hedef guild üyesi değil → NotFoundException NOT_GUILD_MEMBER', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP_WITH_ID)
      .mockResolvedValueOnce(null); // hedef bulunamadı

    await expect(
      service.updateMemberRole(OWNER_ID, GUILD_ID, 'unknown-user', { role: AssignableGuildRole.ADMIN }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ error: 'NOT_GUILD_MEMBER' }) });
  });

  it('başarılı rol değişimi → AuditLog yazılır', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(OWNER_MEMBERSHIP_WITH_ID)
      .mockResolvedValueOnce({ ...MEMBER_MEMBERSHIP_WITH_ID, user: USER_MEMBER });

    prismaMock.guildMember.update.mockResolvedValue({ ...MEMBER_MEMBERSHIP_WITH_ID, role: 'ADMIN', user: USER_MEMBER });

    await service.updateMemberRole(OWNER_ID, GUILD_ID, MEMBER_ID, { role: AssignableGuildRole.ADMIN });

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prismaMock.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe('guild.member_role_updated');
    expect(auditCall.data.actorId).toBe(OWNER_ID);
    expect(auditCall.data.metadata).toMatchObject({ targetUserId: MEMBER_ID, newRole: 'ADMIN' });
  });
});

// ── §C: GuildsService.kickMember ─────────────────────────────────────────────

describe('GuildsService.kickMember — §C (R7)', () => {
  let service: GuildsService;

  const ANOTHER_MEMBER_ID = 'user-another-member';

  // membershipMock'u her testte yapılandıracağız
  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.auditLog.create.mockResolvedValue({});
    // Varsayılan: tx çağrısı iki Prisma operasyonu dizisi ([deleteMany, delete])
    prismaMock.$transaction.mockResolvedValue([{}, {}]);
  });

  function mockActorRole(role: 'OWNER' | 'ADMIN' | 'MEMBER') {
    const actorId = role === 'OWNER' ? OWNER_ID : role === 'ADMIN' ? ADMIN_ID : MEMBER_ID;
    const membershipRecord = { id: `gm-${role.toLowerCase()}`, guildId: GUILD_ID, userId: actorId, role };
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: membershipRecord,
    });
    return actorId;
  }

  function mockTargetMember(targetId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') {
    prismaMock.guildMember.findUnique.mockResolvedValue({
      id: `gm-target-${role.toLowerCase()}`,
      guildId: GUILD_ID,
      userId: targetId,
      role,
    });
  }

  function mockChannels() {
    prismaMock.channel.findMany.mockResolvedValue([
      { id: 'ch-1' },
      { id: 'ch-2' },
    ]);
  }

  // ── OWNER başarılı senaryolar ─────────────────────────────────────────────

  it('OWNER → ADMIN üyeyi atar; null döner', async () => {
    const actorId = mockActorRole('OWNER');
    mockTargetMember(ADMIN_ID, 'ADMIN');
    mockChannels();

    const result = await service.kickMember(actorId, GUILD_ID, ADMIN_ID);

    expect(result).toBeNull();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('OWNER → MEMBER üyeyi atar', async () => {
    const actorId = mockActorRole('OWNER');
    mockTargetMember(MEMBER_ID, 'MEMBER');
    mockChannels();

    const result = await service.kickMember(actorId, GUILD_ID, MEMBER_ID);

    expect(result).toBeNull();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  // ── ADMIN başarılı senaryo ─────────────────────────────────────────────────

  it('ADMIN → MEMBER üyeyi atar', async () => {
    const actorId = mockActorRole('ADMIN');
    mockTargetMember(MEMBER_ID, 'MEMBER');
    mockChannels();

    const result = await service.kickMember(actorId, GUILD_ID, MEMBER_ID);

    expect(result).toBeNull();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  // ── Hata senaryoları — R7 yetki hiyerarşisi ──────────────────────────────

  it('ADMIN → ADMIN üyeyi atamaz: hiyerarşi eşit → ForbiddenException MEMBER_HIERARCHY (Faz 3)', async () => {
    const actorId = mockActorRole('ADMIN');
    mockTargetMember(ANOTHER_MEMBER_ID, 'ADMIN'); // hedef de ADMIN
    permissionsMock.requireMemberHierarchy.mockRejectedValueOnce(
      Object.assign(new (require('@nestjs/common').ForbiddenException)(), {
        response: { error: 'MEMBER_HIERARCHY' },
      }),
    );

    await expect(service.kickMember(actorId, GUILD_ID, ANOTHER_MEMBER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'MEMBER_HIERARCHY' }),
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('hedef OWNER → BadRequestException CANNOT_KICK_OWNER (R7)', async () => {
    const actorId = mockActorRole('OWNER');
    mockTargetMember('other-owner', 'OWNER');

    await expect(service.kickMember(actorId, GUILD_ID, 'other-owner')).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'CANNOT_KICK_OWNER' }),
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('self kick → BadRequestException CANNOT_KICK_SELF (R7)', async () => {
    // Actor OWNER kendini atmaya çalışıyor
    const actorId = mockActorRole('OWNER');

    await expect(service.kickMember(actorId, GUILD_ID, actorId)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'CANNOT_KICK_SELF' }),
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('MEMBER aktör → ForbiddenException FORBIDDEN — yetki önce kontrol edilir (R7 sızıntı yok)', async () => {
    const actorId = mockActorRole('MEMBER');
    // KICK_MEMBERS izni yok → hasGuildPermission false döner
    permissionsMock.hasGuildPermission.mockResolvedValueOnce(false);
    // Not: targetMember findUnique çağrılmaz çünkü FORBIDDEN önce fırlatılır

    await expect(service.kickMember(actorId, GUILD_ID, ADMIN_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });
    // Hedef rolü sorgulanmadan reddedildi — sızıntı yok
    expect(prismaMock.guildMember.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('hedef üye değil → NotFoundException NOT_GUILD_MEMBER', async () => {
    const actorId = mockActorRole('OWNER');
    prismaMock.guildMember.findUnique.mockResolvedValue(null); // hedef yok

    await expect(service.kickMember(actorId, GUILD_ID, 'non-existent')).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'NOT_GUILD_MEMBER' }),
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  // ── ChannelMember temizliği (tx) doğrulaması ──────────────────────────────

  it('kick tx: channelMember.deleteMany + guildMember.delete çağrılır; channelIds guild kanallarından gelir', async () => {
    const actorId = mockActorRole('OWNER');
    mockTargetMember(MEMBER_ID, 'MEMBER');

    const channels = [{ id: 'ch-private-1' }, { id: 'ch-private-2' }];
    prismaMock.channel.findMany.mockResolvedValue(channels);

    // tx array-form çağrısı (Prisma.$transaction([op1, op2]))
    // Service iki Prisma promise dizisi geçiyor; mock ile doğrula
    let capturedOps: unknown[] | null = null;
    prismaMock.$transaction.mockImplementation((ops: unknown[]) => {
      capturedOps = ops;
      return Promise.resolve([{}, {}]);
    });

    // channelMember.deleteMany ve guildMember.delete promise döndürmeli
    prismaMock.channelMember.deleteMany.mockReturnValue(Promise.resolve({ count: 1 }));
    prismaMock.guildMember.delete.mockReturnValue(Promise.resolve({}));

    await service.kickMember(actorId, GUILD_ID, MEMBER_ID);

    // channel.findMany doğru filtre ile çağrıldı mı?
    expect(prismaMock.channel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: GUILD_ID, deletedAt: null } }),
    );

    // $transaction array-form ile çağrıldı (iki operasyon)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(capturedOps).toHaveLength(2);

    // deleteMany doğru parametrelerle çağrıldı
    expect(prismaMock.channelMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, channelId: { in: ['ch-private-1', 'ch-private-2'] } },
    });

    // guildMember.delete doğru unique koşulla çağrıldı
    expect(prismaMock.guildMember.delete).toHaveBeenCalledWith({
      where: { guildId_userId: { guildId: GUILD_ID, userId: MEMBER_ID } },
    });
  });

  it('başarılı kick → AuditLog yazılır', async () => {
    const actorId = mockActorRole('OWNER');
    mockTargetMember(MEMBER_ID, 'MEMBER');
    mockChannels();

    await service.kickMember(actorId, GUILD_ID, MEMBER_ID);

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prismaMock.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe('guild.member_kicked');
    expect(auditCall.data.actorId).toBe(OWNER_ID);
    expect(auditCall.data.metadata).toMatchObject({ targetUserId: MEMBER_ID, guildId: GUILD_ID });
  });
});

// ── §D-F: leave / transfer / ban (R7) ────────────────────────────────────────
describe('GuildsService — ortam yönetimi (leave/transfer/ban)', () => {
  let service: GuildsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.guildMember.findMany.mockResolvedValue([]);
    prismaMock.channel.findMany.mockResolvedValue([{ id: 'ch-1' }]);
    prismaMock.$transaction.mockResolvedValue([{}, {}, {}]);
  });

  // leaveGuild
  it('leaveGuild: OWNER ayrılamaz → OWNER_CANNOT_LEAVE', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD_FIXTURE, membership: { role: 'OWNER', userId: OWNER_ID } });
    await expect(service.leaveGuild(OWNER_ID, GUILD_ID)).rejects.toMatchObject({ response: { error: 'OWNER_CANNOT_LEAVE' } });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('leaveGuild: MEMBER ayrılır → null + member_left', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD_FIXTURE, membership: { role: 'MEMBER', userId: MEMBER_ID } });
    const r = await service.leaveGuild(MEMBER_ID, GUILD_ID);
    expect(r).toBeNull();
    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(expect.any(Array), 'guild.member_left', { guildId: GUILD_ID, userId: MEMBER_ID });
  });

  // transferOwnership
  it('transferOwnership: OWNER değil → FORBIDDEN', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'ADMIN', userId: ADMIN_ID });
    await expect(service.transferOwnership(ADMIN_ID, GUILD_ID, MEMBER_ID)).rejects.toMatchObject({ response: { error: 'FORBIDDEN' } });
  });

  it('transferOwnership: hedef üye değil → NOT_GUILD_MEMBER', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER', userId: OWNER_ID })
      .mockResolvedValueOnce(null);
    await expect(service.transferOwnership(OWNER_ID, GUILD_ID, 'ghost')).rejects.toMatchObject({ response: { error: 'NOT_GUILD_MEMBER' } });
  });

  it('transferOwnership: başarı → null', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER', userId: OWNER_ID })
      .mockResolvedValueOnce({ role: 'MEMBER', userId: MEMBER_ID });
    prismaMock.$transaction.mockResolvedValue([
      {},
      { role: 'OWNER', user: { id: MEMBER_ID, username: 'm', avatarUrl: null } },
      { role: 'ADMIN', user: { id: OWNER_ID, username: 'o', avatarUrl: null } },
    ]);
    const r = await service.transferOwnership(OWNER_ID, GUILD_ID, MEMBER_ID);
    expect(r).toBeNull();
  });

  // banMember
  it('banMember: BAN_MEMBERS izni yok → FORBIDDEN', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD_FIXTURE, membership: { role: 'MEMBER', userId: MEMBER_ID } });
    permissionsMock.hasGuildPermission.mockResolvedValueOnce(false);
    await expect(service.banMember(MEMBER_ID, GUILD_ID, 'other-user')).rejects.toMatchObject({ response: { error: 'FORBIDDEN' } });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('banMember: ADMIN, hedef ADMIN → hiyerarşi eşit → MEMBER_HIERARCHY (Faz 3)', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD_FIXTURE, membership: { role: 'ADMIN', userId: ADMIN_ID } });
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'ADMIN', userId: 'other-admin', id: 'gm-x' });
    permissionsMock.requireMemberHierarchy.mockRejectedValueOnce(
      Object.assign(new (require('@nestjs/common').ForbiddenException)(), {
        response: { error: 'MEMBER_HIERARCHY' },
      }),
    );
    await expect(service.banMember(ADMIN_ID, GUILD_ID, 'other-admin')).rejects.toMatchObject({ response: { error: 'MEMBER_HIERARCHY' } });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('banMember: hedef OWNER → CANNOT_BAN_OWNER', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD_FIXTURE, membership: { role: 'ADMIN', userId: ADMIN_ID } });
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'OWNER', userId: OWNER_ID, id: 'gm-o' });
    await expect(service.banMember(ADMIN_ID, GUILD_ID, OWNER_ID)).rejects.toMatchObject({ response: { error: 'CANNOT_BAN_OWNER' } });
  });

  it('banMember: OWNER → MEMBER yasaklar → null + tx (GuildBan upsert dahil)', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD_FIXTURE, membership: { role: 'OWNER', userId: OWNER_ID } });
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER', userId: MEMBER_ID, id: 'gm-m' });
    const r = await service.banMember(OWNER_ID, GUILD_ID, MEMBER_ID, 'spam');
    expect(r).toBeNull();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
