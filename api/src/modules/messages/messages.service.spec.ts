import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  },
  channelMember: {
    findUnique: jest.fn(),
  },
  guildMember: {
    findUnique: jest.fn(),
  },
  attachment: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  messageReaction: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const membershipMock = {
  requireChannelAccess: jest.fn(),
  requireNoDmBlock: jest.fn(),
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
  return new MessagesService(prismaMock as any, membershipMock as any, automodMock as any, configMock as any, moderationMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
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

const DM_CHANNEL = { id: CHANNEL_ID, guildId: null, slowModeSeconds: 0 };
const GUILD_CHANNEL = { id: GUILD_CHANNEL_ID, guildId: 'guild-xyz', slowModeSeconds: 0 };
const SLOW_GUILD_CHANNEL = { id: GUILD_CHANNEL_ID, guildId: 'guild-xyz', slowModeSeconds: 10 };

// Mesaj fixture — createdAt Date nesnesi (toISOString çağrısı için)
function makeMsg(id: string, createdAt: Date) {
  return {
    id,
    channelId: CHANNEL_ID,
    content: 'merhaba',
    replyToId: null,
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
  // Yazar değilse → 403 NOT_MESSAGE_AUTHOR
  // ─────────────────────────────────────────────────────────────────────────
  it('yazar değil → ForbiddenException NOT_MESSAGE_AUTHOR', async () => {
    membershipMock.requireChannelAccess.mockResolvedValue(GUILD_CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(makeExistingMsg({ authorId: OTHER_USER_ID }));

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
