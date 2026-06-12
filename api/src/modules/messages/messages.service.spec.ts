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
};

const membershipMock = {
  requireChannelAccess: jest.fn(),
  requireNoDmBlock: jest.fn(),
};

function makeService() {
  return new MessagesService(prismaMock as any, membershipMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
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
