import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GuildsService } from './guilds.service';
import { PresignIconDto } from './dto/presign-icon.dto';
import { SetIconDto } from './dto/set-icon.dto';

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
  },
  channel: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const membershipMock = {
  requireGuildMembership: jest.fn(),
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
    };
    return values[key];
  }),
};

function makeService() {
  return new GuildsService(
    prismaMock as any,
    membershipMock as any,
    storageMock as any,
    configMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  configMock.get.mockImplementation((key: string) => {
    const values: Record<string, unknown> = {
      's3.publicUrl': 'http://localhost:9000/kankaverse',
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
  rules: null,
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

// ── GuildsService.findMyGuilds — hasUnread ────────────────────────────────────

describe('GuildsService.findMyGuilds — hasUnread', () => {
  let service: GuildsService;

  const NOW = new Date('2026-06-13T12:00:00Z');
  const BEFORE = new Date('2026-06-13T11:00:00Z');
  const AFTER = new Date('2026-06-13T13:00:00Z');

  function makeGuildWithChannels(channels: {
    lastMsgAuthorId?: string;
    lastMsgCreatedAt?: Date | null;
    lastReadAt?: Date | null;
  }[]) {
    return {
      guild: {
        ...GUILD_FIXTURE,
        channels: channels.map((ch) => ({
          id: 'ch-1',
          guildId: GUILD_ID,
          messages: ch.lastMsgCreatedAt
            ? [{ authorId: ch.lastMsgAuthorId ?? 'other-user', createdAt: ch.lastMsgCreatedAt }]
            : [],
          channelReads: ch.lastReadAt ? [{ lastReadAt: ch.lastReadAt }] : [],
        })),
      },
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('tüm kanallar mesajsız → guild hasUnread false', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([{ lastMsgCreatedAt: null }]),
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].hasUnread).toBe(false);
  });

  it('bir kanalda okunmamış mesaj → guild hasUnread true', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([{ lastMsgCreatedAt: AFTER, lastReadAt: BEFORE }]),
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].hasUnread).toBe(true);
  });

  it('son mesaj kullanıcının kendi mesajı → guild hasUnread false', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([{ lastMsgAuthorId: OWNER_ID, lastMsgCreatedAt: AFTER, lastReadAt: BEFORE }]),
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].hasUnread).toBe(false);
  });

  it('okuma kaydı yok + başka kullanıcıdan mesaj → guild hasUnread true', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([{ lastMsgCreatedAt: NOW, lastReadAt: null }]),
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].hasUnread).toBe(true);
  });

  it('birden fazla kanal, biri okunmamış → guild hasUnread true', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([
        { lastMsgCreatedAt: BEFORE, lastReadAt: NOW }, // okunmuş
        { lastMsgCreatedAt: AFTER, lastReadAt: BEFORE }, // okunmamış
      ]),
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].hasUnread).toBe(true);
  });

  it('tüm kanallar okunmuş → guild hasUnread false', async () => {
    prismaMock.guildMember.findMany.mockResolvedValue([
      makeGuildWithChannels([
        { lastMsgCreatedAt: BEFORE, lastReadAt: NOW },
        { lastMsgCreatedAt: BEFORE, lastReadAt: NOW },
      ]),
    ]);

    const result = await service.findMyGuilds(OWNER_ID);
    expect(result[0].hasUnread).toBe(false);
  });
});
