import { BadRequestException } from '@nestjs/common';
import { MessagesService } from './messages.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  message: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  channelMember: {
    findUnique: jest.fn(),
  },
  attachment: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
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

function makeService() {
  return new MessagesService(prismaMock as any, membershipMock as any, automodMock as any, configMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
  // Varsayılan: automod geçirir
  automodMock.check.mockReturnValue({ blocked: false });
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const USER_ID = 'user-abc';
const CHANNEL_ID = 'ch-dm-1';
const GUILD_CHANNEL_ID = 'ch-guild-1';

const DM_CHANNEL = { id: CHANNEL_ID, guildId: null };
const GUILD_CHANNEL = { id: GUILD_CHANNEL_ID, guildId: 'guild-xyz' };

// Mesaj fixture — createdAt Date nesnesi (toISOString çağrısı için)
function makeMsg(id: string, createdAt: Date) {
  return {
    id,
    channelId: CHANNEL_ID,
    content: 'merhaba',
    replyToId: null,
    createdAt,
    author: { id: 'author-1', username: 'kanka', avatarUrl: null },
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
