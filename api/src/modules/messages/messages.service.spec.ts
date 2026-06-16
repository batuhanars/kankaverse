import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
// ForbiddenException alias for reaction tests
const FE = ForbiddenException;
import { MessagesService } from './messages.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  message: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  channelMember: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  guildMember: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  attachment: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  messageReaction: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  guild: {
    findUnique: jest.fn(),
  },
  channel: {
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const membershipMock = {
  requireChannelAccess: jest.fn(),
  requireNoDmBlock: jest.fn(),
  requireGuildMembership: jest.fn(),
};

const permissionsMock = {
  hasGuildPermission: jest.fn().mockResolvedValue(true),
  requireMemberHierarchy: jest.fn().mockResolvedValue(undefined),
  requireRoleHierarchy: jest.fn().mockResolvedValue(undefined),
};

const automodMock = {
  check: jest.fn(),
};

// scanEnabled=false (dev varsayılan) — bazı testlerde override edilir
const configMock = {
  get: jest.fn((key: string) => {
    const values: Record<string, unknown> = {
      attachmentScanEnabled: false,
    };
    return values[key];
  }),
};

// Sprint 4B: ModerationService mock — varsayılan BAN/MUTE yok (enforcement geçirir)
const moderationMock = {
  hasActiveBan: jest.fn().mockResolvedValue(false),
  hasActiveMute: jest.fn().mockResolvedValue(false),
};

function makeService() {
  return new MessagesService(prismaMock as any, membershipMock as any, permissionsMock as any, automodMock as any, configMock as any, moderationMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
  permissionsMock.hasGuildPermission.mockResolvedValue(true);
  permissionsMock.requireMemberHierarchy.mockResolvedValue(undefined);
  permissionsMock.requireRoleHierarchy.mockResolvedValue(undefined);
  // Varsayılan: automod geçirir
  automodMock.check.mockReturnValue({ blocked: false });
  // Sprint 4B: BAN/MUTE yok (varsayılan — enforcement geçirir)
  moderationMock.hasActiveBan.mockResolvedValue(false);
  moderationMock.hasActiveMute.mockResolvedValue(false);
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const USER_ID = 'user-abc';
const CHANNEL_ID = 'ch-dm-1';
const GUILD_CHANNEL_ID = 'ch-guild-1';

const DM_CHANNEL = { id: CHANNEL_ID, guildId: null, slowModeSeconds: 0, ageGated: false, guild: null };
const GUILD_CHANNEL = { id: GUILD_CHANNEL_ID, guildId: 'guild-xyz', slowModeSeconds: 0, ageGated: false, guild: { adultsOnly: false } };
const SLOW_GUILD_CHANNEL = { id: GUILD_CHANNEL_ID, guildId: 'guild-xyz', slowModeSeconds: 10, ageGated: false, guild: { adultsOnly: false } };

// Mesaj fixture — createdAt Date nesnesi (toISOString çağrısı için)
function makeMsg(id: string, createdAt: Date) {
  return {
    id,
    channelId: CHANNEL_ID,
    content: 'merhaba',
    replyToId: null,
    replyTo: null,
    createdAt,
    author: { id: 'author-1', username: 'kanka', avatarUrl: null },
    attachments: [],
    reactions: [],
  };
}

// ── MessagesService.findMessages ──────────────────────────────────────────────

describe('MessagesService.findMessages', () => {
  let service: MessagesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    // Varsayılan: prisma.message.findMany boş dizi döndürür
    prismaMock.message.findMany.mockResolvedValue([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1 — B1 REGRESYON (en kritik)
  // clearedAt SET + before cursor SET → findMany'e giden where.createdAt
  // HEM gt (clearedAt) HEM lt (before mesajının createdAt) içermeli.
  // Eski kod ayrı spread kullandığından `lt` spread'i `gt` spread'ini eziyordu;
  // bu test o regresyonu kilitler.
  // ─────────────────────────────────────────────────────────────────────────
  it('B1 REGRESYON: clearedAt SET + before SET → where.createdAt { gt, lt } birlikte gönderilir', async () => {
    const clearedAt = new Date('2024-01-10T10:00:00Z');
    const beforeMsgCreatedAt = new Date('2024-01-15T12:00:00Z');
    const beforeMsgId = 'msg-before-cursor';

    // DM kanalı — clearedAt yolu aktif
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);

    // before cursor mesajı bulunuyor
    prismaMock.message.findUnique.mockResolvedValue(
      makeMsg(beforeMsgId, beforeMsgCreatedAt),
    );

    // clearedAt SET olan üye
    prismaMock.channelMember.findUnique.mockResolvedValue({ clearedAt });

    await service.findMessages(USER_ID, CHANNEL_ID, beforeMsgId);

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    const createdAtArg = findManyCall.where.createdAt;

    // B1 regresyon assert — ikisi AYNI objede olmalı
    expect(createdAtArg).toBeDefined();
    expect(createdAtArg.gt).toEqual(clearedAt);
    expect(createdAtArg.lt).toEqual(beforeMsgCreatedAt);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2 — clearedAt SET + before YOK → sadece gt
  // ─────────────────────────────────────────────────────────────────────────
  it('clearedAt SET + before YOK → where.createdAt yalnızca { gt: clearedAt }', async () => {
    const clearedAt = new Date('2024-01-10T10:00:00Z');

    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.channelMember.findUnique.mockResolvedValue({ clearedAt });

    await service.findMessages(USER_ID, CHANNEL_ID);

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    const createdAtArg = findManyCall.where.createdAt;

    expect(createdAtArg).toBeDefined();
    expect(createdAtArg.gt).toEqual(clearedAt);
    expect(createdAtArg.lt).toBeUndefined();

    // before mesajı sorgulanmamalı
    expect(prismaMock.message.findUnique).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3 — clearedAt YOK + before SET → sadece lt
  // ─────────────────────────────────────────────────────────────────────────
  it('clearedAt YOK + before SET → where.createdAt yalnızca { lt: beforeCreatedAt }', async () => {
    const beforeMsgCreatedAt = new Date('2024-01-15T12:00:00Z');
    const beforeMsgId = 'msg-cursor';

    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(
      makeMsg(beforeMsgId, beforeMsgCreatedAt),
    );
    // clearedAt null → gt uygulanmaz
    prismaMock.channelMember.findUnique.mockResolvedValue({ clearedAt: null });

    await service.findMessages(USER_ID, CHANNEL_ID, beforeMsgId);

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    const createdAtArg = findManyCall.where.createdAt;

    expect(createdAtArg).toBeDefined();
    expect(createdAtArg.lt).toEqual(beforeMsgCreatedAt);
    expect(createdAtArg.gt).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4 — clearedAt YOK + before YOK → where'de createdAt hiç yok
  // ─────────────────────────────────────────────────────────────────────────
  it('clearedAt YOK + before YOK → where.createdAt yok, yalnız channelId + deletedAt:null', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.channelMember.findUnique.mockResolvedValue({ clearedAt: null });

    await service.findMessages(USER_ID, CHANNEL_ID);

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    const where = findManyCall.where;

    expect(where.channelId).toBe(CHANNEL_ID);
    expect(where.deletedAt).toBeNull();
    expect(where.createdAt).toBeUndefined();

    // Ne findUnique'e gidildi ne de clearedAt için fazladan çağrı
    expect(prismaMock.message.findUnique).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5 — Guild kanalı → clearedAt sorgusu HİÇ YAPILMAZ
  // ─────────────────────────────────────────────────────────────────────────
  it('guild kanalı (guildId != null) → channelMember.findUnique çağrılmaz, clearedAt uygulanmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    await service.findMessages(USER_ID, GUILD_CHANNEL_ID);

    // clearedAt için channelMember sorgusu olmamalı
    expect(prismaMock.channelMember.findUnique).not.toHaveBeenCalled();

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    const where = findManyCall.where;

    // createdAt filtresi uygulanmamış olmalı (guild'de clearedAt yok)
    expect(where.createdAt).toBeUndefined();
    expect(where.channelId).toBe(GUILD_CHANNEL_ID);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6 — limit > 50 → take 50'ye kırpılır
  // ─────────────────────────────────────────────────────────────────────────
  it('limit > 50 → findMany take=50 ile çağrılır', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.channelMember.findUnique.mockResolvedValue({ clearedAt: null });

    await service.findMessages(USER_ID, CHANNEL_ID, undefined, 999);

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.take).toBe(50);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EK — before mesajı DB'de yoksa lt uygulanmaz (defensive)
  // ─────────────────────────────────────────────────────────────────────────
  it('before ID verildi ama mesaj DB\'de yok → lt uygulanmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(null); // mesaj bulunamadı
    prismaMock.channelMember.findUnique.mockResolvedValue({ clearedAt: null });

    await service.findMessages(USER_ID, CHANNEL_ID, 'ghost-msg-id');

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.where.createdAt).toBeUndefined();
  });
});

// ── MessagesService.create — automod ────────────────────────────────────────

describe('MessagesService.create — automod', () => {
  let service: MessagesService;

  const DTO = { content: 'merhaba', replyToId: undefined };

  const CREATED_MSG = {
    id: 'msg-1',
    channelId: GUILD_CHANNEL_ID,
    content: 'merhaba',
    replyToId: null,
    replyTo: null,
    createdAt: new Date('2026-06-12T12:00:00Z'),
    author: { id: 'author-1', username: 'kanka', avatarUrl: null },
    attachments: [],
    reactions: [],
  };

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Automod — guild kanalı: yasak kelime → MESSAGE_BLOCKED
  // ─────────────────────────────────────────────────────────────────────────
  it('guild kanalı + automod blocked → BadRequestException MESSAGE_BLOCKED', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    automodMock.check.mockReturnValue({ blocked: true });

    await expect(service.create(USER_ID, GUILD_CHANNEL_ID, DTO)).rejects.toThrow(BadRequestException);

    // Mesaj DB'ye yazılmamalı
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it('guild kanalı + automod blocked → hata error kodu MESSAGE_BLOCKED', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    automodMock.check.mockReturnValue({ blocked: true });

    let thrown: BadRequestException | undefined;
    try {
      await service.create(USER_ID, GUILD_CHANNEL_ID, DTO);
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string; message: string };
    expect(response.error).toBe('MESSAGE_BLOCKED');
  });

  it('guild kanalı + automod temiz → mesaj oluşturulur', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    automodMock.check.mockReturnValue({ blocked: false });
    prismaMock.message.create.mockResolvedValue(CREATED_MSG);

    const result = await service.create(USER_ID, GUILD_CHANNEL_ID, DTO);

    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('msg-1');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Automod — DM kanalı: automod çağrılmaz (DM hariç)
  // ─────────────────────────────────────────────────────────────────────────
  it('DM kanalı → automod.check çağrılmaz; mesaj oluşturulur', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.message.create.mockResolvedValue({
      ...CREATED_MSG,
      channelId: CHANNEL_ID,
    });

    await service.create(USER_ID, CHANNEL_ID, DTO);

    expect(automodMock.check).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });

  it('DM kanalı + automod blocked mock olsa bile → automod çağrılmaz → mesaj oluşturulur', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    automodMock.check.mockReturnValue({ blocked: true }); // DM için geçersiz — çağrılmamalı
    prismaMock.message.create.mockResolvedValue({
      ...CREATED_MSG,
      channelId: CHANNEL_ID,
    });

    await service.create(USER_ID, CHANNEL_ID, DTO);

    expect(automodMock.check).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });
});

// ── MessagesService.create — attachment linking + scan-gate ──────────────────

describe('MessagesService.create — attachment linking + scan-gate', () => {
  let service: MessagesService;

  const ATTACHMENT_IDS = ['att-1', 'att-2'];

  const CREATED_MSG_WITH_ATT = {
    id: 'msg-att-1',
    channelId: GUILD_CHANNEL_ID,
    content: 'dosya var',
    replyToId: null,
    replyTo: null,
    createdAt: new Date('2026-06-13T10:00:00Z'),
    author: { id: 'author-1', username: 'kanka', avatarUrl: null },
    attachments: [],
    reactions: [],
  };

  const VALID_ATTACHMENTS = [
    { id: 'att-1', uploaderId: USER_ID, messageId: null },
    { id: 'att-2', uploaderId: USER_ID, messageId: null },
  ];

  const LINKED_ATTACHMENTS = [
    { id: 'att-1', filename: 'a.png', contentType: 'image/png', size: 1000, scanStatus: 'CLEAN' },
    { id: 'att-2', filename: 'b.pdf', contentType: 'application/pdf', size: 2000, scanStatus: 'CLEAN' },
  ];

  beforeEach(() => {
    resetMocks();
    service = makeService();
    automodMock.check.mockReturnValue({ blocked: false });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // İçerik boş + ek yok → EMPTY_MESSAGE
  // ─────────────────────────────────────────────────────────────────────────
  it('content boş + attachmentIds yok → BadRequestException EMPTY_MESSAGE', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    let thrown: BadRequestException | undefined;
    try {
      await service.create(USER_ID, GUILD_CHANNEL_ID, { content: undefined });
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('EMPTY_MESSAGE');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Ek var, content boş → geçerli (ek yeterli)
  // ─────────────────────────────────────────────────────────────────────────
  it('content boş + attachmentIds set → geçerli (mesaj oluşturulur)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.attachment.findMany.mockResolvedValue(VALID_ATTACHMENTS);
    prismaMock.message.create.mockResolvedValue(CREATED_MSG_WITH_ATT);
    prismaMock.attachment.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.attachment.findMany
      .mockResolvedValueOnce(VALID_ATTACHMENTS) // doğrulama
      .mockResolvedValueOnce(LINKED_ATTACHMENTS); // bağlama sonrası

    const result = await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: undefined,
      attachmentIds: ATTACHMENT_IDS,
    });

    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.attachment.updateMany).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('msg-att-1');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scan-gate: disabled → CLEAN olarak bağlanır
  // ─────────────────────────────────────────────────────────────────────────
  it('scan disabled (default) → attachment updateMany scanStatus=CLEAN ile çağrılır', async () => {
    // configMock.get('attachmentScanEnabled') = false (default)
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.attachment.findMany.mockResolvedValueOnce(VALID_ATTACHMENTS);
    prismaMock.message.create.mockResolvedValue(CREATED_MSG_WITH_ATT);
    prismaMock.attachment.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.attachment.findMany.mockResolvedValueOnce(LINKED_ATTACHMENTS);

    await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: 'dosya',
      attachmentIds: ATTACHMENT_IDS,
    });

    const updateCall = prismaMock.attachment.updateMany.mock.calls[0][0];
    expect(updateCall.data.scanStatus).toBe('CLEAN');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scan-gate: enabled → PENDING olarak bırakılır
  // ─────────────────────────────────────────────────────────────────────────
  it('scan enabled → attachment updateMany scanStatus=PENDING ile çağrılır', async () => {
    // Config override: scanEnabled=true
    configMock.get.mockImplementation((key: string) => {
      if (key === 'attachmentScanEnabled') return true;
      return undefined;
    });
    service = makeService(); // yeni config ile service oluştur

    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.attachment.findMany.mockResolvedValueOnce(VALID_ATTACHMENTS);
    prismaMock.message.create.mockResolvedValue(CREATED_MSG_WITH_ATT);
    prismaMock.attachment.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.attachment.findMany.mockResolvedValueOnce(LINKED_ATTACHMENTS);

    await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: 'dosya',
      attachmentIds: ATTACHMENT_IDS,
    });

    const updateCall = prismaMock.attachment.updateMany.mock.calls[0][0];
    expect(updateCall.data.scanStatus).toBe('PENDING');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sahiplik kontrolü: başkasının attachment → ATTACHMENT_FORBIDDEN
  // ─────────────────────────────────────────────────────────────────────────
  it('attachment başkasına ait → BadRequestException ATTACHMENT_FORBIDDEN', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.attachment.findMany.mockResolvedValue([
      { id: 'att-1', uploaderId: 'other-user', messageId: null },
    ]);

    let thrown: BadRequestException | undefined;
    try {
      await service.create(USER_ID, GUILD_CHANNEL_ID, {
        content: 'dosya',
        attachmentIds: ['att-1'],
      });
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('ATTACHMENT_FORBIDDEN');
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Zaten bağlanmış attachment → ATTACHMENT_ALREADY_LINKED
  // ─────────────────────────────────────────────────────────────────────────
  it('attachment zaten başka mesaja bağlı → BadRequestException ATTACHMENT_ALREADY_LINKED', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.attachment.findMany.mockResolvedValue([
      { id: 'att-1', uploaderId: USER_ID, messageId: 'already-linked-msg' },
    ]);

    let thrown: BadRequestException | undefined;
    try {
      await service.create(USER_ID, GUILD_CHANNEL_ID, {
        content: 'dosya',
        attachmentIds: ['att-1'],
      });
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('ATTACHMENT_ALREADY_LINKED');
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });
});

// ── MessagesService.create — yavaş mod (slow mode) ──────────────────────────

describe('MessagesService.create — yavaş mod', () => {
  let service: MessagesService;

  const DTO = { content: 'merhaba' };

  const CREATED_MSG = {
    id: 'msg-slow-1',
    channelId: GUILD_CHANNEL_ID,
    content: 'merhaba',
    replyToId: null,
    replyTo: null,
    createdAt: new Date('2026-06-13T12:00:00Z'),
    author: { id: USER_ID, username: 'kanka', avatarUrl: null },
    attachments: [],
    reactions: [],
  };

  const MEMBER_ROLE = { role: 'MEMBER' };
  const OWNER_ROLE = { role: 'OWNER' };
  const ADMIN_ROLE = { role: 'ADMIN' };

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // slowModeSeconds=0 → yavaş mod kapalı, her zaman geçer
  // ─────────────────────────────────────────────────────────────────────────
  it('slowModeSeconds=0 → yavaş mod kontrolü yapılmaz, mesaj oluşturulur', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL); // slowModeSeconds: 0
    prismaMock.message.create.mockResolvedValue(CREATED_MSG);

    await service.create(USER_ID, GUILD_CHANNEL_ID, DTO);

    expect(prismaMock.guildMember.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.message.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // slowMode açık + son mesaj YENİ → SLOW_MODE (429)
  // ─────────────────────────────────────────────────────────────────────────
  it('slowMode açık + son mesaj yeni (5 sn önce, limit 10 sn) → 429 SLOW_MODE + retryAfter', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(SLOW_GUILD_CHANNEL); // slowModeSeconds: 10
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_ROLE);
    // Son mesaj 5 saniye önce gönderilmiş → 5 saniye daha beklenmeli
    const recentDate = new Date(Date.now() - 5000);
    prismaMock.message.findFirst.mockResolvedValue({ createdAt: recentDate });

    let thrown: any;
    try {
      await service.create(USER_ID, GUILD_CHANNEL_ID, DTO);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeDefined();
    const response = thrown.getResponse();
    expect(response.error).toBe('SLOW_MODE');
    expect(response.retryAfter).toBeGreaterThan(0);
    expect(response.retryAfter).toBeLessThanOrEqual(10);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // slowMode açık + son mesaj ESKİ → geçer
  // ─────────────────────────────────────────────────────────────────────────
  it('slowMode açık + son mesaj eski (20 sn önce, limit 10 sn) → geçer, mesaj oluşturulur', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(SLOW_GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_ROLE);
    // Son mesaj 20 saniye önce → limit 10 sn → geçer
    const oldDate = new Date(Date.now() - 20000);
    prismaMock.message.findFirst.mockResolvedValue({ createdAt: oldDate });
    prismaMock.message.create.mockResolvedValue(CREATED_MSG);

    await service.create(USER_ID, GUILD_CHANNEL_ID, DTO);

    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // slowMode açık + son mesaj YOK (ilk mesaj) → geçer
  // ─────────────────────────────────────────────────────────────────────────
  it('slowMode açık + kullanıcının bu kanalda hiç mesajı yok → geçer', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(SLOW_GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(MEMBER_ROLE);
    prismaMock.message.findFirst.mockResolvedValue(null); // hiç mesaj yok
    prismaMock.message.create.mockResolvedValue(CREATED_MSG);

    await service.create(USER_ID, GUILD_CHANNEL_ID, DTO);

    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // slowMode açık + OWNER → muaf
  // ─────────────────────────────────────────────────────────────────────────
  it('slowMode açık + OWNER → yavaş mod bypass edilir, mesaj oluşturulur', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(SLOW_GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_ROLE);
    prismaMock.message.create.mockResolvedValue(CREATED_MSG);

    await service.create(USER_ID, GUILD_CHANNEL_ID, DTO);

    expect(prismaMock.message.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // slowMode açık + ADMIN → muaf
  // ─────────────────────────────────────────────────────────────────────────
  it('slowMode açık + ADMIN → yavaş mod bypass edilir, mesaj oluşturulur', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(SLOW_GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_ROLE);
    prismaMock.message.create.mockResolvedValue(CREATED_MSG);

    await service.create(USER_ID, GUILD_CHANNEL_ID, DTO);

    expect(prismaMock.message.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DM kanalı + slowMode > 0 (teorik) → yavaş mod uygulanmaz
  // ─────────────────────────────────────────────────────────────────────────
  it('DM kanalı (guildId=null) → slowMode kontrolü hiç yapılmaz', async () => {
    const dmChannelWithSlowMode = { id: CHANNEL_ID, guildId: null, slowModeSeconds: 10 };
    membershipMock.requireChannelAccess.mockResolvedValue(dmChannelWithSlowMode);
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.message.create.mockResolvedValue({
      ...CREATED_MSG,
      channelId: CHANNEL_ID,
    });

    await service.create(USER_ID, CHANNEL_ID, DTO);

    expect(prismaMock.guildMember.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.message.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });
});

// ── GROUP_DM mesajında requireNoDmBlock atlanır ───────────────────────────────

describe('MessagesService.create — GROUP_DM requireNoDmBlock skip', () => {
  let service: MessagesService;

  const GROUP_CHANNEL_ID = 'ch-group-1';
  const GROUP_DM_CHANNEL = { id: GROUP_CHANNEL_ID, guildId: null, type: 'GROUP_DM', slowModeSeconds: 0 };
  const DTO = { content: 'grup mesajı' };

  const CREATED_GROUP_MSG = {
    id: 'msg-group-1',
    channelId: GROUP_CHANNEL_ID,
    content: 'grup mesajı',
    replyToId: null,
    replyTo: null,
    createdAt: new Date('2026-06-13T12:00:00Z'),
    author: { id: 'author-1', username: 'kanka', avatarUrl: null },
    attachments: [],
    reactions: [],
  };

  beforeEach(() => {
    resetMocks();
    service = makeService();
    moderationMock.hasActiveBan.mockResolvedValue(false);
    moderationMock.hasActiveMute.mockResolvedValue(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP_DM kanalında requireNoDmBlock ÇAĞRILMAZ
  // ─────────────────────────────────────────────────────────────────────────
  it('GROUP_DM kanalı → requireNoDmBlock çağrılmaz; mesaj oluşturulur', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GROUP_DM_CHANNEL);
    prismaMock.message.create.mockResolvedValue(CREATED_GROUP_MSG);

    await service.create(USER_ID, GROUP_CHANNEL_ID, DTO);

    expect(membershipMock.requireNoDmBlock).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1-1 DM kanalında requireNoDmBlock ÇAĞRILIR (regresyon koruması)
  // ─────────────────────────────────────────────────────────────────────────
  it('1-1 DM kanalı (type=DM) → requireNoDmBlock çağrılır', async () => {
    const dm1Channel = { id: CHANNEL_ID, guildId: null, type: 'DM', slowModeSeconds: 0 };
    membershipMock.requireChannelAccess.mockResolvedValue(dm1Channel);
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    prismaMock.message.create.mockResolvedValue({
      ...CREATED_GROUP_MSG,
      channelId: CHANNEL_ID,
      id: 'msg-dm-1',
    });

    await service.create(USER_ID, CHANNEL_ID, DTO);

    expect(membershipMock.requireNoDmBlock).toHaveBeenCalledWith(USER_ID, CHANNEL_ID);
  });
});

// ── MessagesService.editMessage ───────────────────────────────────────────────

describe('MessagesService.editMessage', () => {
  let service: MessagesService;

  const MSG_ID = 'msg-edit-1';
  const AUTHOR_ID = USER_ID;
  const OTHER_USER_ID = 'user-other';

  function makeExistingMsg(overrides: Partial<{ authorId: string; deletedAt: Date | null }> = {}) {
    return {
      id: MSG_ID,
      channelId: GUILD_CHANNEL_ID,
      authorId: overrides.authorId ?? AUTHOR_ID,
      content: 'eski içerik',
      replyToId: null,
      editedAt: null,
      deletedAt: overrides.deletedAt ?? null,
      createdAt: new Date('2026-06-13T10:00:00Z'),
    };
  }

  function makeUpdatedMsg(content: string) {
    return {
      id: MSG_ID,
      channelId: GUILD_CHANNEL_ID,
      content,
      replyToId: null,
      replyTo: null,
      editedAt: new Date(),
      deletedAt: null,
      createdAt: new Date('2026-06-13T10:00:00Z'),
      author: { id: AUTHOR_ID, username: 'kanka', avatarUrl: null },
      attachments: [],
      reactions: [],
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Başarılı düzenleme: content + editedAt güncellenir
  // ─────────────────────────────────────────────────────────────────────────
  it('yazar düzenler → content ve editedAt güncellenir, DTO döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg());
    automodMock.check.mockReturnValue({ blocked: false });
    const updatedMsg = makeUpdatedMsg('yeni içerik');
    prismaMock.message.update.mockResolvedValue(updatedMsg);

    const result = await service.editMessage(AUTHOR_ID, GUILD_CHANNEL_ID, MSG_ID, { content: 'yeni içerik' });

    expect(prismaMock.message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: MSG_ID },
      data: expect.objectContaining({ content: 'yeni içerik', editedAt: expect.any(Date) }),
    }));
    expect(result.editedAt).not.toBeNull();
    expect(result.content).toBe('yeni içerik');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Yazar değilse → 403 NOT_MESSAGE_AUTHOR
  // ─────────────────────────────────────────────────────────────────────────
  it('yazar değil → ForbiddenException NOT_MESSAGE_AUTHOR', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg({ authorId: OTHER_USER_ID }));

    let thrown: ForbiddenException | undefined;
    try {
      await service.editMessage(AUTHOR_ID, GUILD_CHANNEL_ID, MSG_ID, { content: 'deneme' });
    } catch (e) {
      thrown = e as ForbiddenException;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('NOT_MESSAGE_AUTHOR');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Boş içerik → 400 EMPTY_MESSAGE
  // ─────────────────────────────────────────────────────────────────────────
  it('boş içerik → BadRequestException EMPTY_MESSAGE', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg());

    let thrown: BadRequestException | undefined;
    try {
      await service.editMessage(AUTHOR_ID, GUILD_CHANNEL_ID, MSG_ID, { content: '   ' });
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('EMPTY_MESSAGE');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Automod eşleşme (guild kanalı) → 400 MESSAGE_BLOCKED
  // ─────────────────────────────────────────────────────────────────────────
  it('guild kanalı + automod blocked → BadRequestException MESSAGE_BLOCKED', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg());
    automodMock.check.mockReturnValue({ blocked: true });

    let thrown: BadRequestException | undefined;
    try {
      await service.editMessage(AUTHOR_ID, GUILD_CHANNEL_ID, MSG_ID, { content: 'yasaklı kelime' });
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('MESSAGE_BLOCKED');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Silinmiş mesaj → 404 MESSAGE_NOT_FOUND
  // ─────────────────────────────────────────────────────────────────────────
  it('silinmiş mesaj → NotFoundException MESSAGE_NOT_FOUND', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg({ deletedAt: new Date() }));

    let thrown: NotFoundException | undefined;
    try {
      await service.editMessage(AUTHOR_ID, GUILD_CHANNEL_ID, MSG_ID, { content: 'deneme' });
    } catch (e) {
      thrown = e as NotFoundException;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('MESSAGE_NOT_FOUND');
  });
});

// ── MessagesService.deleteMessage ────────────────────────────────────────────

describe('MessagesService.deleteMessage', () => {
  let service: MessagesService;

  const MSG_ID = 'msg-del-1';
  const AUTHOR_ID = USER_ID;
  const OTHER_USER_ID = 'user-other';

  function makeExistingMsg(overrides: Partial<{ authorId: string; deletedAt: Date | null }> = {}) {
    return {
      id: MSG_ID,
      channelId: GUILD_CHANNEL_ID,
      authorId: overrides.authorId ?? AUTHOR_ID,
      content: 'silinecek mesaj',
      replyToId: null,
      editedAt: null,
      deletedAt: overrides.deletedAt ?? null,
      createdAt: new Date('2026-06-13T10:00:00Z'),
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Başarılı soft-delete: deletedAt set edilir
  // ─────────────────────────────────────────────────────────────────────────
  it('yazar siler → deletedAt set edilir, null döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg());
    prismaMock.message.update.mockResolvedValue({ ...makeExistingMsg(), deletedAt: new Date() });

    const result = await service.deleteMessage(AUTHOR_ID, GUILD_CHANNEL_ID, MSG_ID);

    expect(prismaMock.message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: MSG_ID },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    }));
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Yazar değilse ve MANAGE_MESSAGES izni yoksa → 403 NOT_MESSAGE_AUTHOR
  // ─────────────────────────────────────────────────────────────────────────
  it('yazar değil ve MANAGE_MESSAGES yok → ForbiddenException NOT_MESSAGE_AUTHOR', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg({ authorId: OTHER_USER_ID }));
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    let thrown: ForbiddenException | undefined;
    try {
      await service.deleteMessage(AUTHOR_ID, GUILD_CHANNEL_ID, MSG_ID);
    } catch (e) {
      thrown = e as ForbiddenException;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('NOT_MESSAGE_AUTHOR');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Zaten silinmiş mesaj → 404 MESSAGE_NOT_FOUND
  // ─────────────────────────────────────────────────────────────────────────
  it('zaten silinmiş mesaj → NotFoundException MESSAGE_NOT_FOUND', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg({ deletedAt: new Date() }));

    let thrown: NotFoundException | undefined;
    try {
      await service.deleteMessage(AUTHOR_ID, GUILD_CHANNEL_ID, MSG_ID);
    } catch (e) {
      thrown = e as NotFoundException;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('MESSAGE_NOT_FOUND');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Mesaj hiç yoksa → 404 MESSAGE_NOT_FOUND
  // ─────────────────────────────────────────────────────────────────────────
  it('mesaj DB\'de yok → NotFoundException MESSAGE_NOT_FOUND', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(null);

    let thrown: NotFoundException | undefined;
    try {
      await service.deleteMessage(AUTHOR_ID, GUILD_CHANNEL_ID, MSG_ID);
    } catch (e) {
      thrown = e as NotFoundException;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('MESSAGE_NOT_FOUND');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });
});

// ── MessagesService.addReaction / removeReaction ─────────────────────────────

describe('MessagesService.addReaction', () => {
  let service: MessagesService;

  const MSG_ID = 'msg-react-1';
  const EMOJI = '👍';

  function makeExistingMsg(deletedAt: Date | null = null) {
    return {
      id: MSG_ID,
      channelId: GUILD_CHANNEL_ID,
      authorId: USER_ID,
      deletedAt,
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Başarılı ekleme: upsert çağrılır, null döner
  // ─────────────────────────────────────────────────────────────────────────
  it('geçerli mesaj + emoji → upsert çağrılır, null döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg());
    prismaMock.messageReaction.upsert.mockResolvedValue({});

    const result = await service.addReaction(USER_ID, GUILD_CHANNEL_ID, MSG_ID, EMOJI);

    expect(prismaMock.messageReaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { messageId_userId_emoji: { messageId: MSG_ID, userId: USER_ID, emoji: EMOJI } },
        create: { messageId: MSG_ID, userId: USER_ID, emoji: EMOJI },
        update: {},
      }),
    );
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // İdempotent: ikinci çağrı da upsert eder, hata fırlatmaz
  // ─────────────────────────────────────────────────────────────────────────
  it('aynı emoji iki kez eklense bile hata fırlatmaz (idempotent)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg());
    prismaMock.messageReaction.upsert.mockResolvedValue({});

    await service.addReaction(USER_ID, GUILD_CHANNEL_ID, MSG_ID, EMOJI);
    await service.addReaction(USER_ID, GUILD_CHANNEL_ID, MSG_ID, EMOJI);

    expect(prismaMock.messageReaction.upsert).toHaveBeenCalledTimes(2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Silinmiş mesaj → 404 MESSAGE_NOT_FOUND
  // ─────────────────────────────────────────────────────────────────────────
  it('silinmiş mesaj → NotFoundException MESSAGE_NOT_FOUND', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg(new Date()));

    let thrown: NotFoundException | undefined;
    try {
      await service.addReaction(USER_ID, GUILD_CHANNEL_ID, MSG_ID, EMOJI);
    } catch (e) {
      thrown = e as NotFoundException;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('MESSAGE_NOT_FOUND');
    expect(prismaMock.messageReaction.upsert).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // requireChannelAccess: yetkisiz erişim → servis zaten hata fırlatır (kontrolü delege eder)
  // ─────────────────────────────────────────────────────────────────────────
  it('requireChannelAccess hata fırlatırsa → propgate edilir', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(
      new FE({ message: 'Erişim yok.', error: 'CHANNEL_FORBIDDEN' }),
    );

    await expect(service.addReaction(USER_ID, GUILD_CHANNEL_ID, MSG_ID, EMOJI)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.messageReaction.upsert).not.toHaveBeenCalled();
  });
});

describe('MessagesService.removeReaction', () => {
  let service: MessagesService;

  const MSG_ID = 'msg-react-2';
  const EMOJI = '❤️';

  function makeExistingMsg(deletedAt: Date | null = null) {
    return {
      id: MSG_ID,
      channelId: GUILD_CHANNEL_ID,
      authorId: USER_ID,
      deletedAt,
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Başarılı kaldırma: deleteMany çağrılır, null döner
  // ─────────────────────────────────────────────────────────────────────────
  it('geçerli mesaj + emoji → deleteMany çağrılır, null döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg());
    prismaMock.messageReaction.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.removeReaction(USER_ID, GUILD_CHANNEL_ID, MSG_ID, EMOJI);

    expect(prismaMock.messageReaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: MSG_ID, userId: USER_ID, emoji: EMOJI },
    });
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // No-op: reaksiyon yoksa deleteMany count=0, hata fırlatmaz
  // ─────────────────────────────────────────────────────────────────────────
  it('reaksiyon yoksa deleteMany 0 döner, hata fırlatmaz (no-op)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg());
    prismaMock.messageReaction.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.removeReaction(USER_ID, GUILD_CHANNEL_ID, MSG_ID, EMOJI);

    expect(prismaMock.messageReaction.deleteMany).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Silinmiş mesaj → 404 MESSAGE_NOT_FOUND
  // ─────────────────────────────────────────────────────────────────────────
  it('silinmiş mesaj → NotFoundException MESSAGE_NOT_FOUND', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg(new Date()));

    let thrown: NotFoundException | undefined;
    try {
      await service.removeReaction(USER_ID, GUILD_CHANNEL_ID, MSG_ID, EMOJI);
    } catch (e) {
      thrown = e as NotFoundException;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('MESSAGE_NOT_FOUND');
    expect(prismaMock.messageReaction.deleteMany).not.toHaveBeenCalled();
  });
});

// ── MessageDto — reactions aggregation ───────────────────────────────────────

describe('MessagesService.findMessages — reactions aggregation', () => {
  let service: MessagesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('reaksiyon yoksa reactions dizisi boş döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findMany.mockResolvedValue([
      {
        id: 'msg-1',
        channelId: GUILD_CHANNEL_ID,
        content: 'test',
        replyToId: null,
        replyTo: null,
        editedAt: null,
        createdAt: new Date(),
        author: { id: 'author-1', username: 'kanka', avatarUrl: null },
        attachments: [],
        reactions: [],
      },
    ]);

    const results = await service.findMessages(USER_ID, GUILD_CHANNEL_ID);
    expect(results[0].reactions).toEqual([]);
  });

  it('reaksiyonlar emoji bazında gruplanır, count doğru hesaplanır', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findMany.mockResolvedValue([
      {
        id: 'msg-2',
        channelId: GUILD_CHANNEL_ID,
        content: 'test',
        replyToId: null,
        replyTo: null,
        editedAt: null,
        createdAt: new Date(),
        author: { id: 'author-1', username: 'kanka', avatarUrl: null },
        attachments: [],
        reactions: [
          { userId: 'user-a', emoji: '👍' },
          { userId: 'user-b', emoji: '👍' },
          { userId: 'user-c', emoji: '❤️' },
        ],
      },
    ]);

    const results = await service.findMessages('user-x', GUILD_CHANNEL_ID);
    const reactions = results[0].reactions;

    const thumbs = reactions.find((r) => r.emoji === '👍');
    const heart = reactions.find((r) => r.emoji === '❤️');

    expect(thumbs).toBeDefined();
    expect(thumbs!.count).toBe(2);
    expect(thumbs!.reactedByMe).toBe(false);

    expect(heart).toBeDefined();
    expect(heart!.count).toBe(1);
    expect(heart!.reactedByMe).toBe(false);
  });

  it('çağıranın reaksiyonu varsa reactedByMe=true döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findMany.mockResolvedValue([
      {
        id: 'msg-3',
        channelId: GUILD_CHANNEL_ID,
        content: 'test',
        replyToId: null,
        replyTo: null,
        editedAt: null,
        createdAt: new Date(),
        author: { id: 'author-1', username: 'kanka', avatarUrl: null },
        attachments: [],
        reactions: [
          { userId: USER_ID, emoji: '👍' },
          { userId: 'user-b', emoji: '👍' },
        ],
      },
    ]);

    const results = await service.findMessages(USER_ID, GUILD_CHANNEL_ID);
    const thumbs = results[0].reactions.find((r) => r.emoji === '👍');

    expect(thumbs!.reactedByMe).toBe(true);
    expect(thumbs!.count).toBe(2);
  });
});

// ── MessagesService.create — reply (replyToId) doğrulama + DTO ───────────────

describe('MessagesService.create — reply doğrulama + replyTo DTO', () => {
  let service: MessagesService;

  const REPLY_TARGET_ID = 'msg-reply-target';
  const OTHER_CHANNEL_ID = 'ch-other-1';

  // Geçerli yanıt hedefi: aynı kanal, silinmemiş
  const VALID_REPLY_TARGET = {
    id: REPLY_TARGET_ID,
    channelId: GUILD_CHANNEL_ID,
    deletedAt: null,
  };

  // Geçerli reply ile oluşturulan mesaj
  function makeCreatedMsgWithReply(replyTo: object | null) {
    return {
      id: 'msg-reply-new',
      channelId: GUILD_CHANNEL_ID,
      content: 'cevap mesajı',
      replyToId: replyTo ? REPLY_TARGET_ID : null,
      replyTo,
      createdAt: new Date('2026-06-13T13:00:00Z'),
      author: { id: USER_ID, username: 'kanka', avatarUrl: null },
      attachments: [],
      reactions: [],
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
    automodMock.check.mockReturnValue({ blocked: false });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Geçerli reply → replyTo dolu döner
  // ─────────────────────────────────────────────────────────────────────────
  it('geçerli replyToId → mesaj oluşturulur, replyTo DTO dolu döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    // findUnique: önce replyTo doğrulama, sonra (create'den sonra) yok
    prismaMock.message.findUnique.mockResolvedValueOnce(VALID_REPLY_TARGET);

    const replyToRaw = {
      id: REPLY_TARGET_ID,
      content: 'orijinal mesaj',
      deletedAt: null,
      author: { username: 'eski-kanka' },
    };
    prismaMock.message.create.mockResolvedValue(
      makeCreatedMsgWithReply(replyToRaw),
    );

    const result = await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: 'cevap mesajı',
      replyToId: REPLY_TARGET_ID,
    });

    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
    expect(result.replyToId).toBe(REPLY_TARGET_ID);
    expect(result.replyTo).not.toBeNull();
    expect(result.replyTo!.id).toBe(REPLY_TARGET_ID);
    expect(result.replyTo!.authorUsername).toBe('eski-kanka');
    expect(result.replyTo!.content).toBe('orijinal mesaj');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // replyToId başka kanala ait → 400 INVALID_REPLY
  // ─────────────────────────────────────────────────────────────────────────
  it('replyToId başka kanala ait → BadRequestException INVALID_REPLY', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValueOnce({
      id: REPLY_TARGET_ID,
      channelId: OTHER_CHANNEL_ID, // farklı kanal!
      deletedAt: null,
    });

    let thrown: BadRequestException | undefined;
    try {
      await service.create(USER_ID, GUILD_CHANNEL_ID, {
        content: 'deneme',
        replyToId: REPLY_TARGET_ID,
      });
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('INVALID_REPLY');
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // replyToId DB'de yok → 400 INVALID_REPLY
  // ─────────────────────────────────────────────────────────────────────────
  it('replyToId DB\'de yok → BadRequestException INVALID_REPLY', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValueOnce(null);

    let thrown: BadRequestException | undefined;
    try {
      await service.create(USER_ID, GUILD_CHANNEL_ID, {
        content: 'deneme',
        replyToId: 'ghost-msg-id',
      });
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('INVALID_REPLY');
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // replyToId silinmiş mesaja işaret → 400 INVALID_REPLY
  // ─────────────────────────────────────────────────────────────────────────
  it('replyToId silinmiş mesaja işaret → BadRequestException INVALID_REPLY', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValueOnce({
      id: REPLY_TARGET_ID,
      channelId: GUILD_CHANNEL_ID,
      deletedAt: new Date(), // silinmiş!
    });

    let thrown: BadRequestException | undefined;
    try {
      await service.create(USER_ID, GUILD_CHANNEL_ID, {
        content: 'deneme',
        replyToId: REPLY_TARGET_ID,
      });
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('INVALID_REPLY');
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // replyTo content snippet: 100 karakterde kesilir
  // ─────────────────────────────────────────────────────────────────────────
  it('replyTo content 100 karakteri aşıyorsa snippet 100\'de kesilir', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValueOnce(VALID_REPLY_TARGET);

    const longContent = 'a'.repeat(200);
    const replyToRaw = {
      id: REPLY_TARGET_ID,
      content: longContent,
      deletedAt: null,
      author: { username: 'uzun-kanka' },
    };
    prismaMock.message.create.mockResolvedValue(
      makeCreatedMsgWithReply(replyToRaw),
    );

    const result = await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: 'cevap',
      replyToId: REPLY_TARGET_ID,
    });

    expect(result.replyTo).not.toBeNull();
    expect(result.replyTo!.content.length).toBe(100);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // replyTo content boş → "[dosya]" snippet
  // ─────────────────────────────────────────────────────────────────────────
  it('replyTo content boş (dosya mesajı) → snippet "[dosya]" döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValueOnce(VALID_REPLY_TARGET);

    const replyToRaw = {
      id: REPLY_TARGET_ID,
      content: '',   // dosya eki olan mesaj, content boş
      deletedAt: null,
      author: { username: 'dosya-kanka' },
    };
    prismaMock.message.create.mockResolvedValue(
      makeCreatedMsgWithReply(replyToRaw),
    );

    const result = await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: 'cevap',
      replyToId: REPLY_TARGET_ID,
    });

    expect(result.replyTo).not.toBeNull();
    expect(result.replyTo!.content).toBe('[dosya]');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Yanıtlanan mesaj silinince → replyTo null döner (DTO)
  // ─────────────────────────────────────────────────────────────────────────
  it('yanıtlanan mesaj silinmişse → replyTo null döner (DTO)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValueOnce(VALID_REPLY_TARGET);

    // replyTo kaydı silindi (deletedAt dolu)
    const deletedReplyTo = {
      id: REPLY_TARGET_ID,
      content: 'eski içerik',
      deletedAt: new Date(),
      author: { username: 'kanka' },
    };
    prismaMock.message.create.mockResolvedValue(
      makeCreatedMsgWithReply(deletedReplyTo),
    );

    const result = await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: 'cevap',
      replyToId: REPLY_TARGET_ID,
    });

    // replyTo DTO: silinmiş mesaj → null
    expect(result.replyTo).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // replyToId verilmemişse → replyTo null, doğrulama sorgusu yok
  // ─────────────────────────────────────────────────────────────────────────
  it('replyToId verilmemiş → replyTo null döner, findUnique doğrulama sorgusu yapılmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.create.mockResolvedValue(
      makeCreatedMsgWithReply(null),
    );

    const result = await service.create(USER_ID, GUILD_CHANNEL_ID, { content: 'normal mesaj' });

    // doğrulama için findUnique çağrılmamalı
    expect(prismaMock.message.findUnique).not.toHaveBeenCalled();
    expect(result.replyTo).toBeNull();
  });
});

// ── MessagesService — resolveMentions (§3 + §4) ──────────────────────────────
//
// resolveMentions private metodu create/editMessage içinden dolaylı test edilir.
// Guild kanalı ve DM kanalı senaryoları ayrı ayrı kapsanır.

describe('MessagesService — resolveMentions (§3 + §4 T&S)', () => {
  let service: MessagesService;

  // Basit bir mesaj fixture — mentions alanı dinamik olarak ayarlanır
  function makeCreatedMsgWithMentions(mentions: string[]) {
    return {
      id: 'msg-m-1',
      channelId: GUILD_CHANNEL_ID,
      content: 'test',
      replyToId: null,
      replyTo: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date('2026-06-13T12:00:00Z'),
      author: { id: USER_ID, username: 'kanka', avatarUrl: null },
      attachments: [],
      reactions: [],
      mentions,
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
    automodMock.check.mockReturnValue({ blocked: false });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Token parse: içerik mention içermiyorsa DB sorgusu yapılmaz
  // ─────────────────────────────────────────────────────────────────────────
  it('content mention içermiyorsa erken [] dön, DB sorgusu yapılmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.create.mockResolvedValue(makeCreatedMsgWithMentions([]));

    const result = await service.create(USER_ID, GUILD_CHANNEL_ID, { content: 'sade mesaj' });

    // resolveMentions erken dönmeli — guildMember.findMany veya channelMember.findMany çağrılmaz
    expect(prismaMock.guildMember.findMany).not.toHaveBeenCalled();
    expect(prismaMock.channelMember.findMany).not.toHaveBeenCalled();
    // create'e mentions:[] iletilmeli
    const createCall = prismaMock.message.create.mock.calls[0][0];
    expect(createCall.data.mentions).toEqual([]);
    expect(result.mentions).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Token parse: çoklu + tekrarlı → tekilleştirilir
  // ─────────────────────────────────────────────────────────────────────────
  it('tekrar eden token → tekilleştirilir, her userId bir kez gönderilir', async () => {
    const MEMBER_A = 'user-aaa';
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    // guildMember: MEMBER_A üye (isMinor: false — reşit)
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: MEMBER_A, user: { isMinor: false } }]);
    prismaMock.message.create.mockResolvedValue(makeCreatedMsgWithMentions([MEMBER_A]));

    await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: `<@${MEMBER_A}> tekrar <@${MEMBER_A}> tekrar <@${MEMBER_A}>`,
    });

    // guildMember.findMany tek userId ile çağrılmalı (tekilleştirilmiş)
    const findManyCall = prismaMock.guildMember.findMany.mock.calls[0][0];
    expect(findManyCall.where.userId.in).toEqual([MEMBER_A]);
    expect(findManyCall.where.userId.in.length).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // §4 T&S: guild kanalı — erişimsiz userId filtrelenir
  // ─────────────────────────────────────────────────────────────────────────
  it('guild kanalı: erişimi olmayan userId mention filtrelenir (sessizce)', async () => {
    const VALID_MEMBER = 'user-valid';
    const OUTSIDER = 'user-outsider';
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    // guildMember: yalnız VALID_MEMBER döner (OUTSIDER guild üyesi değil)
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: VALID_MEMBER, user: { isMinor: false } }]);
    prismaMock.message.create.mockResolvedValue(makeCreatedMsgWithMentions([VALID_MEMBER]));

    await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: `<@${VALID_MEMBER}> ve <@${OUTSIDER}>`,
    });

    const createCall = prismaMock.message.create.mock.calls[0][0];
    // OUTSIDER filtrelenmiş olmalı
    expect(createCall.data.mentions).toContain(VALID_MEMBER);
    expect(createCall.data.mentions).not.toContain(OUTSIDER);
    // Exception fırlatılmaz — exception olmadığından test zaten geçer
  });

  // ─────────────────────────────────────────────────────────────────────────
  // §4 T&S: DM kanalı — ChannelMember kontrolü kullanılır, erişimsiz filtrelenir
  // ─────────────────────────────────────────────────────────────────────────
  it('DM kanalı: channelMember kontrolü yapılır; erişimsiz userId filtrelenir', async () => {
    const VALID_DM_MEMBER = 'user-dm-valid';
    const OUTSIDER_DM = 'user-dm-outsider';
    const DM_CHANNEL_OBJ = { id: CHANNEL_ID, guildId: null, slowModeSeconds: 0, type: 'DM', ageGated: false, guild: null };
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL_OBJ);
    membershipMock.requireNoDmBlock.mockResolvedValue(undefined);
    // channelMember: yalnız VALID_DM_MEMBER döner (isMinor: false)
    prismaMock.channelMember.findMany.mockResolvedValue([{ userId: VALID_DM_MEMBER, user: { isMinor: false } }]);

    const dmCreatedMsg = {
      id: 'msg-dm-m',
      channelId: CHANNEL_ID,
      content: `<@${VALID_DM_MEMBER}> ve <@${OUTSIDER_DM}>`,
      replyToId: null,
      replyTo: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(),
      author: { id: USER_ID, username: 'kanka', avatarUrl: null },
      attachments: [],
      reactions: [],
      mentions: [VALID_DM_MEMBER],
    };
    prismaMock.message.create.mockResolvedValue(dmCreatedMsg);

    await service.create(USER_ID, CHANNEL_ID, {
      content: `<@${VALID_DM_MEMBER}> ve <@${OUTSIDER_DM}>`,
    });

    // channelMember.findMany çağrılmalı (DM yolu)
    expect(prismaMock.channelMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channelId: CHANNEL_ID,
        }),
      }),
    );
    // guildMember.findMany çağrılmamalı
    expect(prismaMock.guildMember.findMany).not.toHaveBeenCalled();

    const createCall = prismaMock.message.create.mock.calls[0][0];
    expect(createCall.data.mentions).toContain(VALID_DM_MEMBER);
    expect(createCall.data.mentions).not.toContain(OUTSIDER_DM);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // §3: ≤10 sınırı — 12 mention varsa ilk 10 alınır, fazlası sessizce düşer
  // ─────────────────────────────────────────────────────────────────────────
  it('≤10 cap: 12 benzersiz mention → yalnız 10 saklanır, hata fırlatılmaz', async () => {
    const memberIds = Array.from({ length: 12 }, (_, i) => `user-${i.toString().padStart(3, '0')}`);
    const content = memberIds.map((id) => `<@${id}>`).join(' ');

    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    // guildMember: hepsi üye (tümü geçerli, hepsi reşit)
    prismaMock.guildMember.findMany.mockResolvedValue(
      memberIds.map((userId) => ({ userId, user: { isMinor: false } })),
    );
    prismaMock.message.create.mockResolvedValue(makeCreatedMsgWithMentions(memberIds.slice(0, 10)));

    await service.create(USER_ID, GUILD_CHANNEL_ID, { content });

    const createCall = prismaMock.message.create.mock.calls[0][0];
    expect(createCall.data.mentions.length).toBe(10);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // §6 DTO: create sonucu mentions döner
  // ─────────────────────────────────────────────────────────────────────────
  it('create DTO sonucunda mentions dizisi döner', async () => {
    const MEMBER_A = 'user-mention-dto';
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: MEMBER_A, user: { isMinor: false } }]);
    prismaMock.message.create.mockResolvedValue(makeCreatedMsgWithMentions([MEMBER_A]));

    const result = await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: `<@${MEMBER_A}> bakabilir misin`,
    });

    expect(result.mentions).toEqual([MEMBER_A]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // §4 T&S R7: ageGated guild kanalı — minör bahsedilen ELENİR, reşit kalır
  // ─────────────────────────────────────────────────────────────────────────
  it('ageGated guild kanalı: minör bahsedilen ELENİR; reşit bahsedilen kalır', async () => {
    const ADULT_MEMBER = 'user-adult';
    const MINOR_MEMBER = 'user-minor';
    const AGE_GATED_GUILD_CHANNEL = {
      id: GUILD_CHANNEL_ID,
      guildId: 'guild-xyz',
      slowModeSeconds: 0,
      ageGated: true,
      guild: { adultsOnly: false },
    };

    membershipMock.requireChannelAccess.mockResolvedValue(AGE_GATED_GUILD_CHANNEL);
    // guildMember: her ikisi de üye ama biri minör
    prismaMock.guildMember.findMany.mockResolvedValue([
      { userId: ADULT_MEMBER, user: { isMinor: false } },
      { userId: MINOR_MEMBER, user: { isMinor: true } },
    ]);
    prismaMock.message.create.mockResolvedValue(makeCreatedMsgWithMentions([ADULT_MEMBER]));

    await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: `<@${ADULT_MEMBER}> ve <@${MINOR_MEMBER}>`,
    });

    const createCall = prismaMock.message.create.mock.calls[0][0];
    // Reşit kalmalı, minör elenmeli
    expect(createCall.data.mentions).toContain(ADULT_MEMBER);
    expect(createCall.data.mentions).not.toContain(MINOR_MEMBER);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // §4 T&S R7: adultsOnly guild — minör bahsedilen ELENİR
  // ─────────────────────────────────────────────────────────────────────────
  it('adultsOnly guild: minör bahsedilen ELENİR', async () => {
    const ADULT_MEMBER = 'user-adult-2';
    const MINOR_MEMBER = 'user-minor-2';
    const ADULTS_ONLY_GUILD_CHANNEL = {
      id: GUILD_CHANNEL_ID,
      guildId: 'guild-xyz',
      slowModeSeconds: 0,
      ageGated: false,
      guild: { adultsOnly: true },  // guild seviyesinde kısıtlı
    };

    membershipMock.requireChannelAccess.mockResolvedValue(ADULTS_ONLY_GUILD_CHANNEL);
    prismaMock.guildMember.findMany.mockResolvedValue([
      { userId: ADULT_MEMBER, user: { isMinor: false } },
      { userId: MINOR_MEMBER, user: { isMinor: true } },
    ]);
    prismaMock.message.create.mockResolvedValue(makeCreatedMsgWithMentions([ADULT_MEMBER]));

    await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: `<@${ADULT_MEMBER}> ve <@${MINOR_MEMBER}>`,
    });

    const createCall = prismaMock.message.create.mock.calls[0][0];
    expect(createCall.data.mentions).toContain(ADULT_MEMBER);
    expect(createCall.data.mentions).not.toContain(MINOR_MEMBER);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // §4 T&S R7: Normal (yaş-kapısız) guild kanalı — minör bahsedilen KALIR
  // Gereksiz eleme yapılmamalı — yalnız yaş-kapılı alanda filtrele.
  // ─────────────────────────────────────────────────────────────────────────
  it('yaş-kapısız normal guild kanalı: minör bahsedilen KALIR (gereksiz eleme yok)', async () => {
    const ADULT_MEMBER = 'user-adult-3';
    const MINOR_MEMBER = 'user-minor-3';
    // ageGated: false, adultsOnly: false → normal kanal
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findMany.mockResolvedValue([
      { userId: ADULT_MEMBER, user: { isMinor: false } },
      { userId: MINOR_MEMBER, user: { isMinor: true } },
    ]);
    prismaMock.message.create.mockResolvedValue(
      makeCreatedMsgWithMentions([ADULT_MEMBER, MINOR_MEMBER]),
    );

    await service.create(USER_ID, GUILD_CHANNEL_ID, {
      content: `<@${ADULT_MEMBER}> ve <@${MINOR_MEMBER}>`,
    });

    const createCall = prismaMock.message.create.mock.calls[0][0];
    // Yaş kapısı yok → minör de dahil edilmeli
    expect(createCall.data.mentions).toContain(ADULT_MEMBER);
    expect(createCall.data.mentions).toContain(MINOR_MEMBER);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // editMessage: mentions yeniden hesaplanır
  // ─────────────────────────────────────────────────────────────────────────
  it('editMessage: mentions yeniden hesaplanır, update\'e iletilir', async () => {
    const MEMBER_A = 'user-edit-mention';
    const MSG_ID = 'msg-edit-m-1';

    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue({
      id: MSG_ID,
      channelId: GUILD_CHANNEL_ID,
      authorId: USER_ID,
      content: 'eski içerik',
      editedAt: null,
      deletedAt: null,
    });
    automodMock.check.mockReturnValue({ blocked: false });
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: MEMBER_A, user: { isMinor: false } }]);

    const updatedMsg = {
      id: MSG_ID,
      channelId: GUILD_CHANNEL_ID,
      content: `<@${MEMBER_A}> yeni içerik`,
      replyToId: null,
      replyTo: null,
      editedAt: new Date(),
      deletedAt: null,
      createdAt: new Date(),
      author: { id: USER_ID, username: 'kanka', avatarUrl: null },
      attachments: [],
      reactions: [],
      mentions: [MEMBER_A],
    };
    prismaMock.message.update.mockResolvedValue(updatedMsg);

    const result = await service.editMessage(USER_ID, GUILD_CHANNEL_ID, MSG_ID, {
      content: `<@${MEMBER_A}> yeni içerik`,
    });

    const updateCall = prismaMock.message.update.mock.calls[0][0];
    expect(updateCall.data.mentions).toContain(MEMBER_A);
    expect(result.mentions).toEqual([MEMBER_A]);
  });
});

// ── MessagesService.pinMessage / unpinMessage / findPins ─────────────────────

const PIN_MSG_ID = 'msg-pin-1';
const GUILD_ID = 'guild-xyz';
const ADMIN_MEMBER = { role: 'ADMIN' };
const OWNER_MEMBER = { role: 'OWNER' };
const REGULAR_MEMBER = { role: 'MEMBER' };

function makePinMsg(overrides: Partial<{ deletedAt: Date | null; pinnedAt: Date | null; channelId: string }> = {}) {
  return {
    id: PIN_MSG_ID,
    channelId: overrides.channelId ?? GUILD_CHANNEL_ID,
    authorId: USER_ID,
    content: 'sabitlenecek mesaj',
    replyToId: null,
    editedAt: null,
    deletedAt: overrides.deletedAt ?? null,
    pinnedAt: overrides.pinnedAt ?? null,
    pinnedById: null,
    createdAt: new Date('2026-06-13T10:00:00Z'),
    updatedAt: new Date('2026-06-13T10:00:00Z'),
  };
}

describe('MessagesService.pinMessage', () => {
  let service: MessagesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    // Varsayılan: 0 sabitlenmiş mesaj (sınır aşılmaz)
    prismaMock.message.count.mockResolvedValue(0);
    prismaMock.message.update.mockResolvedValue({});
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DM kanalı: herhangi bir üye sabitleyebilir (requireChannelAccess yeterli)
  // ─────────────────────────────────────────────────────────────────────────
  it('DM kanalı üyesi → pin başarılı, guildMember sorgusu yapılmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg({ channelId: CHANNEL_ID }));

    const result = await service.pinMessage(USER_ID, CHANNEL_ID, PIN_MSG_ID);

    expect(prismaMock.guildMember.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: PIN_MSG_ID },
      data: expect.objectContaining({ pinnedAt: expect.any(Date), pinnedById: USER_ID }),
    }));
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Guild kanalı MEMBER → 403 FORBIDDEN
  // ─────────────────────────────────────────────────────────────────────────
  it('guild kanalı MEMBER → ForbiddenException FORBIDDEN', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(REGULAR_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg());
    permissionsMock.hasGuildPermission.mockResolvedValue(false); // MANAGE_MESSAGES yok

    let thrown: ForbiddenException | undefined;
    try {
      await service.pinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);
    } catch (e) {
      thrown = e as ForbiddenException;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('FORBIDDEN');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Guild kanalı ADMIN → pin başarılı
  // ─────────────────────────────────────────────────────────────────────────
  it('guild kanalı ADMIN → pin başarılı', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg());

    const result = await service.pinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);

    expect(prismaMock.message.update).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Guild kanalı OWNER → pin başarılı
  // ─────────────────────────────────────────────────────────────────────────
  it('guild kanalı OWNER → pin başarılı', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(OWNER_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg());

    const result = await service.pinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);

    expect(prismaMock.message.update).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // İdempotent: zaten sabitliyse no-op (update çağrılmaz)
  // ─────────────────────────────────────────────────────────────────────────
  it('zaten sabitlenmiş mesaj → no-op (idempotent), update çağrılmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg({ pinnedAt: new Date('2026-06-01T10:00:00Z') }));

    const result = await service.pinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);

    expect(prismaMock.message.count).not.toHaveBeenCalled();
    expect(prismaMock.message.update).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 50 sınırı aşıldığında → 409 PIN_LIMIT
  // ─────────────────────────────────────────────────────────────────────────
  it('50 sınırı aşıldığında → ConflictException PIN_LIMIT', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg());
    prismaMock.message.count.mockResolvedValue(50); // tam 50 → aşıldı

    let thrown: ConflictException | undefined;
    try {
      await service.pinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);
    } catch (e) {
      thrown = e as ConflictException;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('PIN_LIMIT');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Silinmiş mesaj → 404 INVALID_MESSAGE
  // ─────────────────────────────────────────────────────────────────────────
  it('silinmiş mesaj → NotFoundException INVALID_MESSAGE', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg({ deletedAt: new Date() }));

    let thrown: NotFoundException | undefined;
    try {
      await service.pinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);
    } catch (e) {
      thrown = e as NotFoundException;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('INVALID_MESSAGE');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Yanlış kanal mesajı → 404 INVALID_MESSAGE
  // ─────────────────────────────────────────────────────────────────────────
  it('yanlış kanalın mesajı → NotFoundException INVALID_MESSAGE', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBER);
    // Mesaj başka kanalda
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg({ channelId: 'ch-other-999' }));

    let thrown: NotFoundException | undefined;
    try {
      await service.pinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);
    } catch (e) {
      thrown = e as NotFoundException;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('INVALID_MESSAGE');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Mesaj DB'de yok → 404 INVALID_MESSAGE
  // ─────────────────────────────────────────────────────────────────────────
  it('mesaj DB\'de yok → NotFoundException INVALID_MESSAGE', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(null);

    let thrown: NotFoundException | undefined;
    try {
      await service.pinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);
    } catch (e) {
      thrown = e as NotFoundException;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('INVALID_MESSAGE');
  });
});

describe('MessagesService.unpinMessage', () => {
  let service: MessagesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.message.update.mockResolvedValue({});
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DM kanalı: herhangi bir üye kaldırabilir
  // ─────────────────────────────────────────────────────────────────────────
  it('DM kanalı üyesi + sabitlenmiş mesaj → unpin başarılı', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(
      makePinMsg({ channelId: CHANNEL_ID, pinnedAt: new Date('2026-06-01T10:00:00Z') }),
    );

    const result = await service.unpinMessage(USER_ID, CHANNEL_ID, PIN_MSG_ID);

    expect(prismaMock.guildMember.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: PIN_MSG_ID },
      data: { pinnedAt: null, pinnedById: null },
    }));
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Guild kanalı MEMBER → 403 FORBIDDEN
  // ─────────────────────────────────────────────────────────────────────────
  it('guild kanalı MEMBER → ForbiddenException FORBIDDEN', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(REGULAR_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(
      makePinMsg({ pinnedAt: new Date('2026-06-01T10:00:00Z') }),
    );
    permissionsMock.hasGuildPermission.mockResolvedValue(false); // MANAGE_MESSAGES yok

    let thrown: ForbiddenException | undefined;
    try {
      await service.unpinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);
    } catch (e) {
      thrown = e as ForbiddenException;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // İdempotent: zaten sabit değilse no-op
  // ─────────────────────────────────────────────────────────────────────────
  it('zaten sabit olmayan mesaj → no-op (idempotent), update çağrılmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg({ pinnedAt: null }));

    const result = await service.unpinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);

    expect(prismaMock.message.update).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Silinmiş mesaj → 404 INVALID_MESSAGE
  // ─────────────────────────────────────────────────────────────────────────
  it('silinmiş mesaj → NotFoundException INVALID_MESSAGE', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.guildMember.findUnique.mockResolvedValue(ADMIN_MEMBER);
    prismaMock.message.findUnique.mockResolvedValue(makePinMsg({ deletedAt: new Date() }));

    let thrown: NotFoundException | undefined;
    try {
      await service.unpinMessage(USER_ID, GUILD_CHANNEL_ID, PIN_MSG_ID);
    } catch (e) {
      thrown = e as NotFoundException;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('INVALID_MESSAGE');
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });
});

describe('MessagesService.findPins', () => {
  let service: MessagesService;

  const PINNED_AT_1 = new Date('2026-06-13T12:00:00Z');
  const PINNED_AT_2 = new Date('2026-06-12T10:00:00Z');

  function makePinnedMsg(id: string, pinnedAt: Date) {
    return {
      id,
      channelId: GUILD_CHANNEL_ID,
      content: 'sabit mesaj içeriği',
      replyToId: null,
      replyTo: null,
      editedAt: null,
      deletedAt: null,
      pinnedAt,
      pinnedById: USER_ID,
      createdAt: new Date('2026-06-10T10:00:00Z'),
      updatedAt: new Date('2026-06-13T10:00:00Z'),
      mentions: [],
      author: { id: USER_ID, username: 'kanka', avatarUrl: null },
      attachments: [],
      reactions: [],
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // requireChannelAccess çağrılır (yaş kapısı dahil)
  // ─────────────────────────────────────────────────────────────────────────
  it('requireChannelAccess çağrılır; erişim reddi → servis hatayı propagate eder', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(
      new ForbiddenException({ message: 'Yaş kısıtı.', error: 'AGE_RESTRICTED' }),
    );

    await expect(service.findPins(USER_ID, GUILD_CHANNEL_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sabitlenmiş mesajlar pinnedAt desc sırasında döner
  // ─────────────────────────────────────────────────────────────────────────
  it('pinnedAt desc sırasında mesajlar döner; DTO pinnedAt ISO string içerir', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    // DB'den pinnedAt desc sıralı döndüğünü simüle et
    prismaMock.message.findMany.mockResolvedValue([
      makePinnedMsg('msg-pin-a', PINNED_AT_1), // daha yeni
      makePinnedMsg('msg-pin-b', PINNED_AT_2), // daha eski
    ]);

    const results = await service.findPins(USER_ID, GUILD_CHANNEL_ID);

    // findMany orderBy: pinnedAt desc ile çağrılmalı
    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.orderBy).toEqual({ pinnedAt: 'desc' });
    expect(findManyCall.where.pinnedAt).toEqual({ not: null });
    expect(findManyCall.where.deletedAt).toBeNull();

    // Her DTO'da pinnedAt ISO string olmalı
    expect(results[0].pinnedAt).toBe(PINNED_AT_1.toISOString());
    expect(results[1].pinnedAt).toBe(PINNED_AT_2.toISOString());
    expect(results).toHaveLength(2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sabitlenmiş mesaj yoksa boş dizi döner
  // ─────────────────────────────────────────────────────────────────────────
  it('sabitlenmiş mesaj yoksa boş dizi döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findMany.mockResolvedValue([]);

    const results = await service.findPins(USER_ID, GUILD_CHANNEL_ID);

    expect(results).toEqual([]);
  });
});

// ── MessagesService.searchMessages ───────────────────────────────────────────

describe('MessagesService.searchMessages', () => {
  let service: MessagesService;

  // Tek bir arama sonucu döndürmek için kullanılan fixture
  function makeSearchMsg(id: string, content: string, createdAt: Date) {
    return {
      id,
      channelId: GUILD_CHANNEL_ID,
      content,
      replyToId: null,
      replyTo: null,
      editedAt: null,
      pinnedAt: null,
      pinnedById: null,
      deletedAt: null,
      createdAt,
      mentions: [],
      author: { id: 'author-1', username: 'kanka', avatarUrl: null },
      attachments: [],
      reactions: [],
    };
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.message.findMany.mockResolvedValue([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1 — erişim hatası propagate edilir
  // ─────────────────────────────────────────────────────────────────────────
  it('requireChannelAccess hata fırlatırsa → propagate edilir, findMany çağrılmaz', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(
      new ForbiddenException({ message: 'Erişim yok.', error: 'CHANNEL_FORBIDDEN' }),
    );

    await expect(service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'arama')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2 — q < 2 karakter → QUERY_TOO_SHORT
  // ─────────────────────────────────────────────────────────────────────────
  it('q boş string → BadRequestException QUERY_TOO_SHORT', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    let thrown: BadRequestException | undefined;
    try {
      await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, '');
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string; message: string };
    expect(response.error).toBe('QUERY_TOO_SHORT');
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  it('q tek karakter (trim sonrası) → BadRequestException QUERY_TOO_SHORT', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    let thrown: BadRequestException | undefined;
    try {
      await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'a');
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('QUERY_TOO_SHORT');
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  it('q yalnız boşluk (trim sonrası 0 karakter) → QUERY_TOO_SHORT', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    let thrown: BadRequestException | undefined;
    try {
      await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, '   ');
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('QUERY_TOO_SHORT');
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3 — case-insensitive eşleşme: findMany'e mode: 'insensitive' gönderilir
  // ─────────────────────────────────────────────────────────────────────────
  it('geçerli q → findMany content contains + insensitive ile çağrılır', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'Merhaba');

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.where.content).toEqual({ contains: 'Merhaba', mode: 'insensitive' });
  });

  it('case-insensitive: "MERHABA" q → where.content.mode insensitive olarak ayarlanır', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    const msg = makeSearchMsg('msg-s-1', 'merhaba dünya', new Date('2026-06-13T10:00:00Z'));
    prismaMock.message.findMany.mockResolvedValue([msg]);

    const results = await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'MERHABA');

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.where.content.mode).toBe('insensitive');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('msg-s-1');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4 — silinmiş mesajlar hariç: where.deletedAt: null
  // ─────────────────────────────────────────────────────────────────────────
  it('silinmiş mesajlar hariç tutulur: where.deletedAt null olarak ayarlanır', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'arama');

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.where.deletedAt).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5 — DM clearedAt sınırı (B1 dersi)
  // clearedAt SET + before SET → where.createdAt { gt, lt } TEK objede birleşir
  // ─────────────────────────────────────────────────────────────────────────
  it('DM + clearedAt SET + before SET → createdAt { gt: clearedAt, lt: beforeCreatedAt } TEK objede', async () => {
    const clearedAt = new Date('2024-01-10T10:00:00Z');
    const beforeMsgCreatedAt = new Date('2024-01-15T12:00:00Z');
    const beforeMsgId = 'msg-before-search';

    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(
      makeSearchMsg(beforeMsgId, 'before msg', beforeMsgCreatedAt),
    );
    prismaMock.channelMember.findUnique.mockResolvedValue({ clearedAt });

    await service.searchMessages(USER_ID, CHANNEL_ID, 'arama', beforeMsgId);

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    const createdAtArg = findManyCall.where.createdAt;

    expect(createdAtArg).toBeDefined();
    expect(createdAtArg.gt).toEqual(clearedAt);
    expect(createdAtArg.lt).toEqual(beforeMsgCreatedAt);
  });

  it('DM + clearedAt SET + before YOK → createdAt yalnız { gt: clearedAt }', async () => {
    const clearedAt = new Date('2024-01-10T10:00:00Z');

    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.channelMember.findUnique.mockResolvedValue({ clearedAt });

    await service.searchMessages(USER_ID, CHANNEL_ID, 'arama');

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    const createdAtArg = findManyCall.where.createdAt;

    expect(createdAtArg).toBeDefined();
    expect(createdAtArg.gt).toEqual(clearedAt);
    expect(createdAtArg.lt).toBeUndefined();
    expect(prismaMock.message.findUnique).not.toHaveBeenCalled();
  });

  it('DM + clearedAt NULL → createdAt filtresi uygulanmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(DM_CHANNEL);
    prismaMock.channelMember.findUnique.mockResolvedValue({ clearedAt: null });

    await service.searchMessages(USER_ID, CHANNEL_ID, 'arama');

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.where.createdAt).toBeUndefined();
  });

  it('guild kanalı → channelMember.findUnique çağrılmaz (clearedAt kontrolü yapılmaz)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'arama');

    expect(prismaMock.channelMember.findUnique).not.toHaveBeenCalled();
    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.where.createdAt).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6 — before cursor
  // ─────────────────────────────────────────────────────────────────────────
  it('before cursor verildiğinde → createdAt.lt cursor mesajının createdAt\'ine eşit', async () => {
    const beforeMsgCreatedAt = new Date('2026-06-10T10:00:00Z');
    const beforeMsgId = 'msg-cursor-search';

    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(
      makeSearchMsg(beforeMsgId, 'cursor msg', beforeMsgCreatedAt),
    );

    await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'arama', beforeMsgId);

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.where.createdAt).toEqual({ lt: beforeMsgCreatedAt });
  });

  it('before cursor mesajı DB\'de yoksa → createdAt filtresi uygulanmaz', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(null);

    await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'arama', 'ghost-msg');

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.where.createdAt).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7 — take ≤ 30
  // ─────────────────────────────────────────────────────────────────────────
  it('take=30 ile çağrılır (sabit limit)', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'arama');

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.take).toBe(30);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EK — orderBy createdAt desc
  // ─────────────────────────────────────────────────────────────────────────
  it('orderBy createdAt desc ile çağrılır', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);

    await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'arama');

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EK — q 100 karakterden uzunsa kesilir
  // ─────────────────────────────────────────────────────────────────────────
  it('q 100 karakterden uzunsa → 100 karaktere kesilir, DB\'ye 100 karakter gönderilir', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    const longQ = 'a'.repeat(150);

    await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, longQ);

    const findManyCall = prismaMock.message.findMany.mock.calls[0][0];
    expect(findManyCall.where.content.contains.length).toBe(100);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EK — MessageDto[] döner (toMessageDto şekli)
  // ─────────────────────────────────────────────────────────────────────────
  it('eşleşen mesajlar MessageDto[] olarak döner', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    const msg = makeSearchMsg('msg-result-1', 'arama metni burada', new Date('2026-06-13T12:00:00Z'));
    prismaMock.message.findMany.mockResolvedValue([msg]);

    const results = await service.searchMessages(USER_ID, GUILD_CHANNEL_ID, 'arama');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('msg-result-1');
    expect(results[0].content).toBe('arama metni burada');
    expect(results[0].author.username).toBe('kanka');
    expect(typeof results[0].createdAt).toBe('string'); // ISO string
  });
});

// ── MessagesService.searchGuildMessages — from / mentions filtreleri ──────────

describe('MessagesService.searchGuildMessages — from/mentions filtreleri', () => {
  let service: MessagesService;

  const GUILD_ID = 'guild-xyz';
  const ACCESSIBLE_CHANNEL = { id: 'ch-guild-1', name: 'genel', ageGated: false, isPrivate: false };

  function makeGuildMsg(id: string, channelId: string, content: string, createdAt: Date) {
    return {
      id,
      channelId,
      content,
      replyToId: null,
      replyTo: null,
      editedAt: null,
      pinnedAt: null,
      pinnedById: null,
      deletedAt: null,
      createdAt,
      mentions: [],
      author: { id: 'author-1', username: 'kanka', avatarUrl: null },
      attachments: [],
      reactions: [],
    };
  }

  // Varsayılan: ayrıcalıklı olmayan üye, reşit, tek erişilebilir kamu kanalı
  function setupAccess() {
    membershipMock.requireGuildMembership.mockResolvedValue({ membership: { role: 'MEMBER' } });
    prismaMock.guild.findUnique.mockResolvedValue({ adultsOnly: false });
    prismaMock.channel.findMany.mockResolvedValue([ACCESSIBLE_CHANNEL]);
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.message.findMany.mockResolvedValue([]);
  });

  // ── En-az-biri kuralı ───────────────────────────────────────────────────────
  it('q/from/mentions hepsi boş → boş dizi döner, findMany çağrılmaz (hata atmaz)', async () => {
    setupAccess();

    const results = await service.searchGuildMessages(USER_ID, GUILD_ID, '', { from: '', mentions: '' });

    expect(results).toEqual([]);
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  it('opts hiç verilmedi + q boş → boş dizi döner', async () => {
    setupAccess();

    const results = await service.searchGuildMessages(USER_ID, GUILD_ID, '');

    expect(results).toEqual([]);
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  // ── q opsiyonel: q yok ama from var → arama çalışır ──────────────────────────
  it('q boş + from dolu → where.authorId set, content filtresi yok', async () => {
    setupAccess();

    await service.searchGuildMessages(USER_ID, GUILD_ID, '', { from: 'author-1' });

    const call = prismaMock.message.findMany.mock.calls[0][0];
    expect(call.where.authorId).toBe('author-1');
    expect(call.where.content).toBeUndefined();
  });

  // ── q opsiyonel: q yok ama mentions var → arama çalışır ──────────────────────
  it('q boş + mentions dolu → where.mentions.has set, content filtresi yok', async () => {
    setupAccess();

    await service.searchGuildMessages(USER_ID, GUILD_ID, '', { mentions: 'user-mentioned' });

    const call = prismaMock.message.findMany.mock.calls[0][0];
    expect(call.where.mentions).toEqual({ has: 'user-mentioned' });
    expect(call.where.content).toBeUndefined();
  });

  // ── q hâlâ ≥2 karakter şartı (dolu ise) ──────────────────────────────────────
  it('q tek karakter (dolu ama <2) → QUERY_TOO_SHORT', async () => {
    setupAccess();

    let thrown: BadRequestException | undefined;
    try {
      await service.searchGuildMessages(USER_ID, GUILD_ID, 'a');
    } catch (e) {
      thrown = e as BadRequestException;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('QUERY_TOO_SHORT');
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  // ── Kombinasyon: üç filtre AND'lenir ─────────────────────────────────────────
  it('q + from + mentions → üçü de where içinde AND\'lenir', async () => {
    setupAccess();

    await service.searchGuildMessages(USER_ID, GUILD_ID, 'merhaba', {
      from: 'author-1',
      mentions: 'user-mentioned',
    });

    const call = prismaMock.message.findMany.mock.calls[0][0];
    expect(call.where.content).toEqual({ contains: 'merhaba', mode: 'insensitive' });
    expect(call.where.authorId).toBe('author-1');
    expect(call.where.mentions).toEqual({ has: 'user-mentioned' });
  });

  // ── q-only mevcut davranış bozulmaz ──────────────────────────────────────────
  it('yalnız q (eski davranış) → content filtresi var, authorId/mentions yok', async () => {
    setupAccess();

    await service.searchGuildMessages(USER_ID, GUILD_ID, 'merhaba');

    const call = prismaMock.message.findMany.mock.calls[0][0];
    expect(call.where.content).toEqual({ contains: 'merhaba', mode: 'insensitive' });
    expect(call.where.authorId).toBeUndefined();
    expect(call.where.mentions).toBeUndefined();
  });

  // ── Boş-string filtreler yok sayılır ─────────────────────────────────────────
  it('from/mentions boş string → where\'e girmez (yok sayılır)', async () => {
    setupAccess();

    await service.searchGuildMessages(USER_ID, GUILD_ID, 'merhaba', { from: '   ', mentions: '' });

    const call = prismaMock.message.findMany.mock.calls[0][0];
    expect(call.where.authorId).toBeUndefined();
    expect(call.where.mentions).toBeUndefined();
    expect(call.where.content).toEqual({ contains: 'merhaba', mode: 'insensitive' });
  });

  // ── Erişim/sızıntı deseni korunur: erişilebilir kanal yoksa boş döner ─────────
  it('erişilebilir kanal yok → boş döner, findMany çağrılmaz (filtre dolu olsa bile)', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({ membership: { role: 'MEMBER' } });
    prismaMock.guild.findUnique.mockResolvedValue({ adultsOnly: false });
    prismaMock.channel.findMany.mockResolvedValue([]); // hiç kanal yok
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });

    const results = await service.searchGuildMessages(USER_ID, GUILD_ID, '', { from: 'author-1' });

    expect(results).toEqual([]);
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  // ── Dönüş şekli korunur: kanal-gruplu ────────────────────────────────────────
  it('sonuç kanal-gruplu döner (channelId/channelName/messages şekli korunur)', async () => {
    setupAccess();
    const msg = makeGuildMsg('msg-g-1', 'ch-guild-1', 'merhaba dünya', new Date('2026-06-14T10:00:00Z'));
    prismaMock.message.findMany.mockResolvedValue([msg]);

    const results = await service.searchGuildMessages(USER_ID, GUILD_ID, '', { from: 'author-1' });

    expect(results).toHaveLength(1);
    expect(results[0].channelId).toBe('ch-guild-1');
    expect(results[0].channelName).toBe('genel');
    expect(results[0].messages).toHaveLength(1);
    expect(results[0].messages[0].id).toBe('msg-g-1');
    expect(results[0].messages[0].content).toBe('merhaba dünya'); // content korunur
  });
});

// ── toMessageDto.pinnedAt ────────────────────────────────────────────────────

describe('toMessageDto — pinnedAt alanı', () => {
  let service: MessagesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
  });

  it('pinnedAt dolu mesaj → DTO\'da ISO string olarak döner', async () => {
    const pinnedAt = new Date('2026-06-13T10:00:00Z');
    prismaMock.message.findMany.mockResolvedValue([
      {
        id: 'msg-pinned-dto',
        channelId: GUILD_CHANNEL_ID,
        content: 'test',
        replyToId: null,
        replyTo: null,
        editedAt: null,
        pinnedAt,
        pinnedById: USER_ID,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        mentions: [],
        author: { id: USER_ID, username: 'kanka', avatarUrl: null },
        attachments: [],
        reactions: [],
      },
    ]);

    const results = await service.findMessages(USER_ID, GUILD_CHANNEL_ID);
    expect(results[0].pinnedAt).toBe(pinnedAt.toISOString());
  });

  it('pinnedAt null olan mesaj → DTO\'da null döner', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      {
        id: 'msg-notpinned-dto',
        channelId: GUILD_CHANNEL_ID,
        content: 'test',
        replyToId: null,
        replyTo: null,
        editedAt: null,
        pinnedAt: null,
        pinnedById: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        mentions: [],
        author: { id: USER_ID, username: 'kanka', avatarUrl: null },
        attachments: [],
        reactions: [],
      },
    ]);

    const results = await service.findMessages(USER_ID, GUILD_CHANNEL_ID);
    expect(results[0].pinnedAt).toBeNull();
  });
});
