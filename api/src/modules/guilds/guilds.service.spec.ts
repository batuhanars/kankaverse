import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GuildsService } from './guilds.service';
import { PresignIconDto } from './dto/presign-icon.dto';
import { SetIconDto } from './dto/set-icon.dto';
import { GuildJoinService } from '../../shared/guild-join/guild-join.service';
import { ImageUploadService } from '../../shared/media/image-upload.service';

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
    findFirst: jest.fn(),
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
  notificationPref: {
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
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
  presignPutPublic: jest.fn(),
  presignGet: jest.fn(),
  delete: jest.fn(),
};

const configMock = {
  get: jest.fn((key: string) => {
    const values: Record<string, unknown> = {
      's3.publicUrl': 'http://localhost:9000/kankaverse',
      's3.publicBaseUrl': 'http://localhost:9000/kankaverse',
      uploadsEnabled: true,
    };
    return values[key];
  }),
};

const realtimeMock = { emitToUser: jest.fn(), emitToUsers: jest.fn(), emitToRoom: jest.fn() };

const notificationsMock = { create: jest.fn() };
const invitesMock = { createInvite: jest.fn() };

// C8: ImageUploadService gerçek örneği — storageMock/configMock ile aynı davranışı taşır
// (guild banner presign/set testleri bunun üzerinden geçer; icon kodu bundan bağımsız kalır).
function makeImageUploadService() {
  return new ImageUploadService(storageMock as any, configMock as any);
}

function makeService() {
  const guildJoin = new GuildJoinService(prismaMock as any, realtimeMock as any);
  return new GuildsService(
    prismaMock as any,
    membershipMock as any,
    permissionsMock as any,
    storageMock as any,
    configMock as any,
    realtimeMock as any,
    guildJoin,
    notificationsMock as any,
    invitesMock as any,
    makeImageUploadService(),
  );
}

function resetMocks() {
  jest.resetAllMocks();
  permissionsMock.hasGuildPermission.mockResolvedValue(true);
  permissionsMock.requireMemberHierarchy.mockResolvedValue(undefined);
  permissionsMock.requireRoleHierarchy.mockResolvedValue(undefined);
  // M2b §10 R1-1: varsayılan — kanal tercihi yok (bireysel testler override eder)
  prismaMock.notificationPref.findMany.mockResolvedValue([]);
  // R15 §2.6: varsayılan — kullanıcının rol bağı yok (rol-bahsetme dalı eklenmez)
  prismaMock.guildMemberRole.findMany.mockResolvedValue([]);
  configMock.get.mockImplementation((key: string) => {
    const values: Record<string, unknown> = {
      's3.publicUrl': 'http://localhost:9000/kankaverse',
      's3.publicBaseUrl': 'http://localhost:9000/kankaverse',
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
  discoverable: false,
  tags: [] as string[],
  bannerColor: null,
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
    storageMock.presignPutPublic.mockResolvedValue('https://minio/presigned-put-url');
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
    expect(storageMock.presignPutPublic).not.toHaveBeenCalled();
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

    expect(storageMock.presignPutPublic).not.toHaveBeenCalled();
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

    expect(storageMock.presignPutPublic).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Geçerli istek → { uploadUrl, storageKey } döner
  // ─────────────────────────────────────────────────────────────────────────
  it('OWNER + geçerli contentType → presignPut çağrılır, { uploadUrl, storageKey } döner', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);

    const dto: PresignIconDto = { contentType: 'image/png' };

    const result = await service.presignIcon(OWNER_ID, GUILD_ID, dto);

    expect(storageMock.presignPutPublic).toHaveBeenCalledTimes(1);
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
    const result = (await service.presignIcon(OWNER_ID, GUILD_ID, dto)) as { storageKey: string };

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

    const result = (await service.setIcon(OWNER_ID, GUILD_ID, dto)) as { iconUrl: string | null };

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { iconUrl: expectedIconUrl, iconAnimatedUrl: null },
    });
    expect(result.iconUrl).toBe(expectedIconUrl);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D14 savunma-derinliği: UPLOADS_ENABLED=false iken yeni ikon SET edilemez
  // ─────────────────────────────────────────────────────────────────────────
  it('UPLOADS_ENABLED=false iken storageKey ile ikon SET → ForbiddenException UPLOADS_DISABLED (D14)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    configMock.get.mockImplementation((key: string) =>
      key === 'uploadsEnabled' ? false : 'http://localhost:9000/kankaverse',
    );

    const dto: SetIconDto = { storageKey: `icons/${GUILD_ID}/abc.png` };

    await expect(service.setIcon(OWNER_ID, GUILD_ID, dto)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UPLOADS_DISABLED' }),
    });
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('UPLOADS_ENABLED=false iken storageKey null → ikon KALDIRMA yine çalışır (kapı yalnız set yolunda)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, iconUrl: null });
    configMock.get.mockImplementation((key: string) =>
      key === 'uploadsEnabled' ? false : 'http://localhost:9000/kankaverse',
    );

    const dto: SetIconDto = { storageKey: null };

    const result = (await service.setIcon(OWNER_ID, GUILD_ID, dto)) as { iconUrl: string | null };
    expect(result.iconUrl).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // storageKey null → iconUrl null (ikon kaldırma)
  // ─────────────────────────────────────────────────────────────────────────
  it('storageKey null → iconUrl null olarak güncellenir (ikon kaldırma)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, iconUrl: null });

    const dto: SetIconDto = { storageKey: null };

    const result = (await service.setIcon(OWNER_ID, GUILD_ID, dto)) as { iconUrl: string | null };

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { iconUrl: null, iconAnimatedUrl: null },
    });
    expect(result.iconUrl).toBeNull();
  });

  it('storageKey undefined (alan hiç gönderilmemiş) → iconUrl null olarak güncellenir', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, iconUrl: null });

    const dto: SetIconDto = {};

    const result = (await service.setIcon(OWNER_ID, GUILD_ID, dto)) as { iconUrl: string | null };

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { iconUrl: null, iconAnimatedUrl: null },
    });
    expect(result.iconUrl).toBeNull();
  });
});

// ── GuildsService.presignBanner / setBanner — C8 (ImageUploadService üzerinden) ──

describe('GuildsService.presignBanner', () => {
  let service: GuildsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    storageMock.presignPutPublic.mockResolvedValue('https://minio/presigned-put-url');
  });

  it('desteklenmeyen contentType → BadRequestException UNSUPPORTED_TYPE', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);

    await expect(
      service.presignBanner(OWNER_ID, GUILD_ID, { contentType: 'image/gif' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UNSUPPORTED_TYPE' }),
    });
    // GIF statik yükleme kararında YOK (sözleşme §0) — presign S3'e gitmemeli
    expect(storageMock.presignPutPublic).not.toHaveBeenCalled();
  });

  it('UPLOADS_ENABLED=false → ForbiddenException UPLOADS_DISABLED', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    configMock.get.mockImplementation((key: string) =>
      key === 'uploadsEnabled' ? false : 'http://localhost:9000/kankaverse',
    );

    await expect(
      service.presignBanner(OWNER_ID, GUILD_ID, { contentType: 'image/png' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UPLOADS_DISABLED' }),
    });
    expect(storageMock.presignPutPublic).not.toHaveBeenCalled();
  });

  it('OWNER olmayan üye → ForbiddenException FORBIDDEN', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_MEMBERSHIP);

    await expect(
      service.presignBanner(MEMBER_ID, GUILD_ID, { contentType: 'image/png' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });
  });

  it('geçerli istek → storageKey guild-banners/ prefix taşır', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);

    const result = await service.presignBanner(OWNER_ID, GUILD_ID, { contentType: 'image/png' });

    expect(result.storageKey.startsWith(`guild-banners/${GUILD_ID}/`)).toBe(true);
    expect(result.uploadUrl).toBe('https://minio/presigned-put-url');
  });
});

describe('GuildsService.setBanner', () => {
  let service: GuildsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('OWNER olmayan üye → ForbiddenException FORBIDDEN', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_MEMBERSHIP);

    await expect(
      service.setBanner(MEMBER_ID, GUILD_ID, { storageKey: `guild-banners/${GUILD_ID}/abc.png` }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('yanlış guild prefix → BadRequestException INVALID_STORAGE_KEY', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);

    await expect(
      service.setBanner(OWNER_ID, GUILD_ID, { storageKey: 'guild-banners/other-guild/abc.png' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'INVALID_STORAGE_KEY' }),
    });
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('UPLOADS_ENABLED=false iken storageKey ile afiş SET → ForbiddenException UPLOADS_DISABLED (D14 savunma-derinliği)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    configMock.get.mockImplementation((key: string) =>
      key === 'uploadsEnabled' ? false : 'http://localhost:9000/kankaverse',
    );

    await expect(
      service.setBanner(OWNER_ID, GUILD_ID, { storageKey: `guild-banners/${GUILD_ID}/abc.png` }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UPLOADS_DISABLED' }),
    });
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('UPLOADS_ENABLED=false iken storageKey null → afiş KALDIRMA yine çalışır', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, bannerUrl: null });
    configMock.get.mockImplementation((key: string) =>
      key === 'uploadsEnabled' ? false : 'http://localhost:9000/kankaverse',
    );

    const result = (await service.setBanner(OWNER_ID, GUILD_ID, { storageKey: null })) as {
      bannerUrl: string | null;
    };
    expect(result.bannerUrl).toBeNull();
  });

  it('geçerli storageKey → bannerUrl publicUrl + "/" + storageKey olarak kaydedilir', async () => {
    const storageKey = `guild-banners/${GUILD_ID}/550e8400.png`;
    const expectedBannerUrl = `http://localhost:9000/kankaverse/${storageKey}`;

    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, bannerUrl: expectedBannerUrl });

    const result = (await service.setBanner(OWNER_ID, GUILD_ID, { storageKey })) as {
      bannerUrl: string | null;
    };

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { bannerUrl: expectedBannerUrl, bannerAnimatedUrl: null },
    });
    expect(result.bannerUrl).toBe(expectedBannerUrl);
  });

  it('storageKey null → bannerUrl null olarak güncellenir (afiş kaldırma)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP);
    prismaMock.guild.update.mockResolvedValue({ ...GUILD_FIXTURE, bannerUrl: null });

    const result = (await service.setBanner(OWNER_ID, GUILD_ID, { storageKey: null })) as {
      bannerUrl: string | null;
    };

    expect(prismaMock.guild.update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { bannerUrl: null, bannerAnimatedUrl: null },
    });
    expect(result.bannerUrl).toBeNull();
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
    expect(callArg.where).toMatchObject({ NOT: { authorId: OWNER_ID, webhookId: null } });
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
    prismaMock.guildMember.findMany.mockResolvedValue([makeGuildWithChannels([])]);

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

// ── GuildsService.findMyGuilds — M2b §10 R1-1: kanal-bazlı NotificationPref süzgeci ──────────

describe('GuildsService.findMyGuilds — kanal bazlı bildirim tercihi süzgeci (M2b R1-1)', () => {
  let service: GuildsService;

  function makeGuildWithOneChannel() {
    return {
      guild: {
        ...GUILD_FIXTURE,
        channels: [{ id: 'ch-1', guildId: GUILD_ID, isPrivate: false, channelReads: [] }],
      },
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guildMember.findMany.mockResolvedValue([makeGuildWithOneChannel()]);
    // ch-1: 2 okunmamış mesaj, bunlardan 1'i bahsetme
    prismaMock.message.count
      .mockResolvedValueOnce(2) // unread
      .mockResolvedValueOnce(1); // mentions
  });

  it('pref yok (varsayılan ALL, susturulmamış) → hem unread hem mention sayılır', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(2);
    expect(result[0].unreadMentionCount).toBe(1);
  });

  it('level=MENTIONS → unread sayılmaz, mention sayılır', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([
      {
        targetType: 'CHANNEL',
        targetId: 'ch-1',
        muted: false,
        mutedUntil: null,
        level: 'MENTIONS',
      },
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(0);
    expect(result[0].unreadMentionCount).toBe(1);
  });

  it('level=NONE → ikisi de sayılmaz', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([
      { targetType: 'CHANNEL', targetId: 'ch-1', muted: false, mutedUntil: null, level: 'NONE' },
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(0);
    expect(result[0].unreadMentionCount).toBe(0);
  });

  it('aktif mute (süresiz) → ikisi de sayılmaz, level ALL olsa bile', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([
      { targetType: 'CHANNEL', targetId: 'ch-1', muted: true, mutedUntil: null, level: 'ALL' },
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(0);
    expect(result[0].unreadMentionCount).toBe(0);
  });

  it('süresi geçmiş mute → mute sona ermiş sayılır, hem unread hem mention sayılır', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([
      {
        targetType: 'CHANNEL',
        targetId: 'ch-1',
        muted: true,
        mutedUntil: new Date('2020-01-01T00:00:00Z'), // geçmiş
        level: 'ALL',
      },
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].unreadCount).toBe(2);
    expect(result[0].unreadMentionCount).toBe(1);
  });

  // R14: sorgu kanal+ortam tercihlerini BİRLİKTE çeker (ortam satırından yalnız
  // suppressEveryone okunur); kanal başına ek sorgu yok — tek findMany kuralı korunur.
  it('tek sorgu: notificationPref.findMany kullanıcının tüm tercihleri için bir kez çağrılır', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([]);

    await service.findMyGuilds(OWNER_ID);
    expect(prismaMock.notificationPref.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.notificationPref.findMany).toHaveBeenCalledWith({
      where: { userId: OWNER_ID },
    });
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
        create: jest.fn().mockResolvedValue({
          id: CATEGORY_ID,
          name: 'Metin Kanalları',
          position: 0,
          guildId: GUILD_ID,
        }),
      },
      channel: { create: jest.fn().mockResolvedValue({}) },
      role: { create: jest.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
    );

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
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
    );

    const result = await service.create(OWNER_ID, { name: 'Test Ortamı' });

    expect(result).toMatchObject({
      id: GUILD_ID,
      name: 'Test Ortamı',
      ownerId: OWNER_ID,
    });
  });

  it("varsayılan kanal categoryId = oluşturulan kategorinin id'si", async () => {
    const dynamicCatId = 'dyn-cat-999';
    const txMock = {
      guild: { create: jest.fn().mockResolvedValue(GUILD_FIXTURE) },
      guildMember: { create: jest.fn().mockResolvedValue({}) },
      channelCategory: { create: jest.fn().mockResolvedValue({ id: dynamicCatId }) },
      channel: { create: jest.fn().mockResolvedValue({}) },
      role: { create: jest.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
    );

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
      expect.objectContaining({
        where: { id: GUILD_ID },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  // R20: requireOwner enum role'e bakar, PermissionsService'e HİÇ sormaz — OWNER-only aksiyonlar
  // (ortam sil/sahiplik devri/rol yönetimi) bilinçli olarak izin sisteminin dışında kalır.
  // ADMINISTRATOR bayraklı bir rol bile bu kapıyı geçemez; yalnız enum role==='OWNER' geçer.
  it('ADMINISTRATOR bayraklı MEMBER → ForbiddenException FORBIDDEN (OWNER-only aksiyon izin sistemini atlar)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_MEMBERSHIP);
    permissionsMock.hasGuildPermission.mockResolvedValue(true); // izin sistemi "evet" dese bile

    await expect(service.deleteGuild(MEMBER_ID, GUILD_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FORBIDDEN' }),
    });
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('MEMBER → ForbiddenException FORBIDDEN', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_MEMBERSHIP);

    await expect(service.deleteGuild(MEMBER_ID, GUILD_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });

  it('guild yok → NotFoundException GUILD_NOT_FOUND', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(null);

    await expect(service.deleteGuild(OWNER_ID, GUILD_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.guild.update).not.toHaveBeenCalled();
  });
});

// R20: §B (PATCH /guilds/:id/members/:userId/role) kaldırıldı — rol vermek artık rol
// sisteminin işi (ADMINISTRATOR bayraklı rol atamak), enum'da geriye atanabilir tek değer
// (ADMIN) kalmadığı için uç anlamsızlaştı. Bu ID, aşağıdaki kickMember/transferOwnership/
// banMember testlerinde "OWNER olmayan ama yetkisi mock'lanmış aktör" fikstürü olarak kalıyor.
const ADMIN_ID = 'user-admin';

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

  // R20: enum-ADMIN kaldırıldı — geriye OWNER ve MEMBER kalıyor. kickMember'ın gerçek yetki
  // kararı zaten `permissions.hasGuildPermission`/`requireMemberHierarchy` mock'larından geliyor
  // (aşağıda), bu yüzden ikinci bir "yetkili ama OWNER değil" aktör temsili için MEMBER + farklı
  // bir userId (ADMIN_ID) kullanılıyor — enum'a hiç dokunmuyor.
  function mockActorRole(role: 'OWNER' | 'MEMBER', actorId: string = MEMBER_ID) {
    const resolvedId = role === 'OWNER' ? OWNER_ID : actorId;
    const membershipRecord = {
      id: `gm-${role.toLowerCase()}-${resolvedId}`,
      guildId: GUILD_ID,
      userId: resolvedId,
      role,
    };
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: membershipRecord,
    });
    return resolvedId;
  }

  function mockTargetMember(targetId: string, role: 'OWNER' | 'MEMBER') {
    prismaMock.guildMember.findUnique.mockResolvedValue({
      id: `gm-target-${role.toLowerCase()}`,
      guildId: GUILD_ID,
      userId: targetId,
      role,
    });
  }

  function mockChannels() {
    prismaMock.channel.findMany.mockResolvedValue([{ id: 'ch-1' }, { id: 'ch-2' }]);
  }

  // ── OWNER başarılı senaryolar ─────────────────────────────────────────────

  it('OWNER → izinli MEMBER üyeyi atar; null döner', async () => {
    const actorId = mockActorRole('OWNER');
    mockTargetMember(ADMIN_ID, 'MEMBER');
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

  // ── KICK_MEMBERS izinli MEMBER başarılı senaryo ─────────────────────────────

  it('KICK_MEMBERS izinli MEMBER → başka MEMBER üyeyi atar', async () => {
    const actorId = mockActorRole('MEMBER', ADMIN_ID);
    mockTargetMember(MEMBER_ID, 'MEMBER');
    mockChannels();

    const result = await service.kickMember(actorId, GUILD_ID, MEMBER_ID);

    expect(result).toBeNull();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  // ── Hata senaryoları — R7 yetki hiyerarşisi ──────────────────────────────

  it('KICK_MEMBERS izinli MEMBER → hiyerarşi eşit hedefi atamaz → ForbiddenException MEMBER_HIERARCHY (Faz 3)', async () => {
    const actorId = mockActorRole('MEMBER', ADMIN_ID);
    mockTargetMember(ANOTHER_MEMBER_ID, 'MEMBER'); // hedef de izinli-ama-hiyerarşi-eşit MEMBER
    permissionsMock.requireMemberHierarchy.mockRejectedValueOnce(
      Object.assign(new ForbiddenException(), {
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
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: { role: 'OWNER', userId: OWNER_ID },
    });
    await expect(service.leaveGuild(OWNER_ID, GUILD_ID)).rejects.toMatchObject({
      response: { error: 'OWNER_CANNOT_LEAVE' },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('leaveGuild: MEMBER ayrılır → null + member_left', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: { role: 'MEMBER', userId: MEMBER_ID },
    });
    const r = await service.leaveGuild(MEMBER_ID, GUILD_ID);
    expect(r).toBeNull();
    expect(realtimeMock.emitToUsers).toHaveBeenCalledWith(expect.any(Array), 'guild.member_left', {
      guildId: GUILD_ID,
      userId: MEMBER_ID,
    });
  });

  // transferOwnership — R20: requireOwner (leaveGuild/deleteGuild ile aynı desen) izin sistemine
  // hiç sormaz, yalnız enum role==='OWNER' geçer. ADMINISTRATOR bayraklı bir MEMBER bile
  // sahipliği devredemez — bu OWNER-only aksiyonlardan biri (contract §0 "devredilemez işler").
  it('transferOwnership: ADMINISTRATOR bayraklı MEMBER → FORBIDDEN (OWNER değil)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'MEMBER', userId: ADMIN_ID });
    permissionsMock.hasGuildPermission.mockResolvedValue(true); // izin sistemi "evet" dese bile
    await expect(service.transferOwnership(ADMIN_ID, GUILD_ID, MEMBER_ID)).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });

  it('transferOwnership: hedef üye değil → NOT_GUILD_MEMBER', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER', userId: OWNER_ID })
      .mockResolvedValueOnce(null);
    await expect(service.transferOwnership(OWNER_ID, GUILD_ID, 'ghost')).rejects.toMatchObject({
      response: { error: 'NOT_GUILD_MEMBER' },
    });
  });

  it('transferOwnership: başarı → null', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER', userId: OWNER_ID })
      .mockResolvedValueOnce({ role: 'MEMBER', userId: MEMBER_ID });
    prismaMock.$transaction.mockResolvedValue([
      {},
      { role: 'OWNER', user: { id: MEMBER_ID, username: 'm', avatarUrl: null } },
      { role: 'MEMBER', user: { id: OWNER_ID, username: 'o', avatarUrl: null } },
    ]);
    const r = await service.transferOwnership(OWNER_ID, GUILD_ID, MEMBER_ID);
    expect(r).toBeNull();
  });

  // Kök neden (SPRINT_M5D_DEVICE_ROUND_CONTRACT.md §2, guilds.service.ts:799 civarı): devir eski
  // sahibi ADMIN yapıyordu → A→B devri sonra B→A geri devrinde B (hiç yönetici olmamış sıradan
  // üye) kalıcı olarak ADMIN'e terfi ediyordu (sessiz yetki yükselmesi, kimse yetki vermedi).
  // Doğru davranış: devir kimseye yeni yetki VERMEZ, eski sahip yalnız kendi atanmış
  // rolleriyle MEMBER olarak kalır. Bu test regresyonu somut olarak yakalar.
  it('transferOwnership: eski sahip MEMBER olur (ADMIN olarak terfi ETMEZ)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER', userId: OWNER_ID })
      .mockResolvedValueOnce({ role: 'MEMBER', userId: MEMBER_ID });
    prismaMock.$transaction.mockResolvedValue([
      {},
      { role: 'OWNER', user: { id: MEMBER_ID, username: 'm', avatarUrl: null } },
      { role: 'MEMBER', user: { id: OWNER_ID, username: 'o', avatarUrl: null } },
    ]);
    await service.transferOwnership(OWNER_ID, GUILD_ID, MEMBER_ID);

    expect(prismaMock.guildMember.update).toHaveBeenNthCalledWith(2, {
      where: { guildId_userId: { guildId: GUILD_ID, userId: OWNER_ID } },
      data: { role: 'MEMBER' },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        roleLinks: { include: { role: true } },
      },
    });
  });

  // banMember
  it('banMember: BAN_MEMBERS izni yok → FORBIDDEN', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: { role: 'MEMBER', userId: MEMBER_ID },
    });
    permissionsMock.hasGuildPermission.mockResolvedValueOnce(false);
    await expect(service.banMember(MEMBER_ID, GUILD_ID, 'other-user')).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  // R20: enum-ADMIN kaldırıldı — iki izinli MEMBER arasındaki hiyerarşi eşitliği artık
  // yalnız rol-position üzerinden (requireMemberHierarchy) belirlenir, enum'dan değil.
  it('banMember: izinli MEMBER, hedef de izinli MEMBER → hiyerarşi eşit → MEMBER_HIERARCHY (Faz 3)', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: { role: 'MEMBER', userId: ADMIN_ID },
    });
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      userId: 'other-admin',
      id: 'gm-x',
    });
    permissionsMock.requireMemberHierarchy.mockRejectedValueOnce(
      Object.assign(new ForbiddenException(), {
        response: { error: 'MEMBER_HIERARCHY' },
      }),
    );
    await expect(service.banMember(ADMIN_ID, GUILD_ID, 'other-admin')).rejects.toMatchObject({
      response: { error: 'MEMBER_HIERARCHY' },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('banMember: hedef OWNER → CANNOT_BAN_OWNER', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: { role: 'MEMBER', userId: ADMIN_ID },
    });
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'OWNER',
      userId: OWNER_ID,
      id: 'gm-o',
    });
    await expect(service.banMember(ADMIN_ID, GUILD_ID, OWNER_ID)).rejects.toMatchObject({
      response: { error: 'CANNOT_BAN_OWNER' },
    });
  });

  it('banMember: OWNER → MEMBER yasaklar → null + tx (GuildBan upsert dahil)', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: { role: 'OWNER', userId: OWNER_ID },
    });
    prismaMock.guildMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
      userId: MEMBER_ID,
      id: 'gm-m',
    });
    const r = await service.banMember(OWNER_ID, GUILD_ID, MEMBER_ID, 'spam');
    expect(r).toBeNull();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ── C6: PATCH /guilds — discoverable/tags/bannerColor ─────────────────────────
describe('GuildsService.update — C6 (discoverable/tags/bannerColor)', () => {
  let service: GuildsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guild.findUnique.mockResolvedValue(GUILD_FIXTURE);
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_FIXTURE,
      membership: { role: 'OWNER', userId: OWNER_ID },
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
  });

  it('tags normalize: trim + lowercase + boş-ele + tekilleştir', async () => {
    prismaMock.guild.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...GUILD_FIXTURE, ...data }),
    );
    const result = await service.update(OWNER_ID, GUILD_ID, {
      tags: ['  Oyun ', 'oyun', 'MUZIK', '', '   ', 'Sohbet'],
    });
    // 'Oyun'→'oyun' (tekil), 'muzik', 'sohbet'; boşlar atılır
    expect(result.tags).toEqual(['oyun', 'muzik', 'sohbet']);
    expect(prismaMock.guild.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tags: ['oyun', 'muzik', 'sohbet'] }),
      }),
    );
  });

  it('discoverable + bannerColor güncellenir, yalnız verilen alanlar yazılır', async () => {
    prismaMock.guild.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...GUILD_FIXTURE, ...data }),
    );
    const result = await service.update(OWNER_ID, GUILD_ID, {
      discoverable: true,
      bannerColor: 'blue',
    });
    expect(result.discoverable).toBe(true);
    expect(result.bannerColor).toBe('blue');
    const callData = prismaMock.guild.update.mock.calls[0][0].data;
    // name/adultsOnly/description verilmedi → data'da yok (yalnız verilen alanlar)
    expect(callData).toEqual({ discoverable: true, bannerColor: 'blue' });
  });
});

// ── C6: POST /guilds/:id/join-discovery — Sprint 7A gate reuse ────────────────
describe('GuildsService.joinDiscovery — C6 (discoverable + Sprint 7A gate)', () => {
  let service: GuildsService;
  const DISCOVERABLE_GUILD = { ...GUILD_FIXTURE, discoverable: true };
  const DISCOVERABLE_ADULTS = { ...DISCOVERABLE_GUILD, id: 'guild-adults', adultsOnly: true };

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guildBan.findUnique.mockResolvedValue(null);
  });

  it('discoverable değil → 403 NOT_DISCOVERABLE', async () => {
    prismaMock.guild.findUnique.mockResolvedValue({ ...GUILD_FIXTURE, discoverable: false });
    await expect(service.joinDiscovery('user1', GUILD_ID)).rejects.toMatchObject({
      response: { error: 'NOT_DISCOVERABLE' },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('guild yok → 403 NOT_DISCOVERABLE', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(null);
    await expect(service.joinDiscovery('user1', GUILD_ID)).rejects.toMatchObject({
      response: { error: 'NOT_DISCOVERABLE' },
    });
  });

  it('[R7] adultsOnly + minör → 403 AGE_RESTRICTED (Sprint 7A gate miras)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(DISCOVERABLE_ADULTS);
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });
    await expect(service.joinDiscovery('minor1', 'guild-adults')).rejects.toMatchObject({
      response: { error: 'AGE_RESTRICTED' },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('[ban] yasaklı kullanıcı → 403 GUILD_BANNED (Sprint 7A gate miras)', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(DISCOVERABLE_GUILD);
    prismaMock.guildBan.findUnique.mockResolvedValue({ guildId: GUILD_ID, userId: 'user1' });
    await expect(service.joinDiscovery('user1', GUILD_ID)).rejects.toMatchObject({
      response: { error: 'GUILD_BANNED' },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('zaten üye → 409 ALREADY_MEMBER', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(DISCOVERABLE_GUILD);
    prismaMock.guildMember.findUnique.mockResolvedValue({ id: 'gm1' });
    await expect(service.joinDiscovery('user1', GUILD_ID)).rejects.toMatchObject({
      response: { error: 'ALREADY_MEMBER' },
    });
  });

  it('başarılı join → GuildDto + tx (üye create) + realtime member_joined', async () => {
    prismaMock.guild.findUnique.mockResolvedValue(DISCOVERABLE_GUILD);
    prismaMock.guildMember.findUnique
      .mockResolvedValueOnce(null) // gate: zaten-üye kontrolü → değil
      .mockResolvedValueOnce(null); // notifyMemberJoined: yeni üye okuması (erken çıkış)
    prismaMock.$transaction.mockResolvedValue([{ id: 'gm-new' }]);

    const result = await service.joinDiscovery('newuser', GUILD_ID);
    expect(result.id).toBe(GUILD_ID);
    expect(result.discoverable).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ── GuildsService.findMyGuilds — R14 §2.4b: @everyone bastırma (rail rozeti) ─────────────────

describe('GuildsService.findMyGuilds — @everyone bastırma rail rozeti (R14)', () => {
  let service: GuildsService;

  function membershipWithChannel(isPrivate = false) {
    return {
      guildId: GUILD_ID,
      guild: {
        ...GUILD_FIXTURE,
        channels: [{ id: 'ch-1', guildId: GUILD_ID, isPrivate, channelReads: [] }],
      },
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guildMember.findMany.mockResolvedValue([membershipWithChannel()]);
    prismaMock.message.count.mockResolvedValue(0);
  });

  it('bastırma yok → mention sayımı @everyone dalını İÇERİR', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([]);

    await service.findMyGuilds(OWNER_ID);

    // ikinci message.count çağrısı mention sayımı
    const mentionWhere = prismaMock.message.count.mock.calls[1][0].where;
    expect(mentionWhere.OR).toEqual([{ mentions: { has: OWNER_ID } }, { mentionsEveryone: true }]);
  });

  it('suppressEveryone=true → @everyone dalı DÜŞER, doğrudan bahsetme kalır', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([
      {
        targetType: 'GUILD',
        targetId: GUILD_ID,
        muted: false,
        mutedUntil: null,
        level: 'ALL',
        suppressEveryone: true,
        suppressEvents: false,
      },
    ]);

    await service.findMyGuilds(OWNER_ID);

    const mentionWhere = prismaMock.message.count.mock.calls[1][0].where;
    expect(mentionWhere.OR).toEqual([{ mentions: { has: OWNER_ID } }]);
  });

  it('başka ortamın bastırması bu ortamı etkilemez', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([
      {
        targetType: 'GUILD',
        targetId: 'baska-ortam',
        muted: false,
        mutedUntil: null,
        level: 'ALL',
        suppressEveryone: true,
        suppressEvents: false,
      },
    ]);

    await service.findMyGuilds(OWNER_ID);

    const mentionWhere = prismaMock.message.count.mock.calls[1][0].where;
    expect(mentionWhere.OR).toContainEqual({ mentionsEveryone: true });
  });

  it('tercihler TEK findMany ile çekilir (kanal + ortam birlikte)', async () => {
    prismaMock.notificationPref.findMany.mockResolvedValue([]);

    await service.findMyGuilds(OWNER_ID);

    expect(prismaMock.notificationPref.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.notificationPref.findMany).toHaveBeenCalledWith({
      where: { userId: OWNER_ID },
    });
  });
});
