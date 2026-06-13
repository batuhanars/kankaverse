/**
 * MessagesGateway — notifyChannelActivity birim testleri
 *
 * Sadece notifyChannelActivity test edilir; diğer gateway metodlarının
 * (broadcastMessage, notifyDmActivity vb.) integration testi E2E kapsamında.
 */

import { MessagesGateway } from './messages.gateway';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  channel: {
    findUnique: jest.fn(),
  },
  guildMember: {
    findMany: jest.fn(),
  },
  session: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  channelMember: { findMany: jest.fn() },
};

const jwtMock = { verify: jest.fn() };
const configMock = { get: jest.fn() };
const membershipMock = {
  requireChannelAccess: jest.fn(),
  requireGuildMembership: jest.fn(),
};

const emitToUserMock = jest.fn();
const realtimeMock = {
  setServer: jest.fn(),
  emitToUser: emitToUserMock,
};

const presenceMock = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  audienceFor: jest.fn().mockResolvedValue([]),
  visibleOnlineFor: jest.fn().mockResolvedValue([]),
  setStatus: jest.fn(),
};

function makeGateway() {
  return new MessagesGateway(
    jwtMock as any,
    configMock as any,
    prismaMock as any,
    membershipMock as any,
    realtimeMock as any,
    presenceMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  presenceMock.audienceFor.mockResolvedValue([]);
  presenceMock.visibleOnlineFor.mockResolvedValue([]);
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const GUILD_ID = 'guild-1';
const CHANNEL_ID = 'ch-guild-1';
const DM_CHANNEL_ID = 'ch-dm-1';
const AUTHOR_ID = 'user-author';
const MEMBER_1_ID = 'user-member-1';
const MEMBER_2_ID = 'user-member-2';

function makeMessageDto(authorId = AUTHOR_ID) {
  return {
    id: 'msg-1',
    content: 'Merhaba!',
    createdAt: new Date().toISOString(),
    author: { id: authorId, username: 'author' },
    channelId: CHANNEL_ID,
  } as Record<string, unknown>;
}

// ── notifyChannelActivity ─────────────────────────────────────────────────────

describe('MessagesGateway.notifyChannelActivity', () => {
  let gateway: MessagesGateway;

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
  });

  it('DM kanalı (guildId=null) → hiçbir şey yapılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: null });

    await gateway.notifyChannelActivity(DM_CHANNEL_ID, makeMessageDto());

    expect(prismaMock.guildMember.findMany).not.toHaveBeenCalled();
    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  it('kanal bulunamazsa (null) → hiçbir şey yapılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue(null);

    await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

    expect(prismaMock.guildMember.findMany).not.toHaveBeenCalled();
    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  it('guild kanalı → guild üyelerine channel.activity yayar', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.guildMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: MEMBER_1_ID },
      { userId: MEMBER_2_ID },
    ]);

    await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

    // MEMBER_1 ve MEMBER_2 alır
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_1_ID, 'channel.activity', {
      channelId: CHANNEL_ID,
      guildId: GUILD_ID,
      authorId: AUTHOR_ID,
    });
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_2_ID, 'channel.activity', {
      channelId: CHANNEL_ID,
      guildId: GUILD_ID,
      authorId: AUTHOR_ID,
    });
  });

  it('yazar kendine channel.activity almaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.guildMember.findMany.mockResolvedValue([
      { userId: AUTHOR_ID },
      { userId: MEMBER_1_ID },
    ]);

    await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

    // AUTHOR_ID'ye emit edilmemeli
    expect(emitToUserMock).not.toHaveBeenCalledWith(AUTHOR_ID, expect.anything(), expect.anything());
    // MEMBER_1'e emit edilmeli
    expect(emitToUserMock).toHaveBeenCalledTimes(1);
    expect(emitToUserMock).toHaveBeenCalledWith(MEMBER_1_ID, 'channel.activity', expect.anything());
  });

  it('guild üyesi yok (sadece yazar) → hiçbir emit yapılmaz', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.guildMember.findMany.mockResolvedValue([{ userId: AUTHOR_ID }]);

    await gateway.notifyChannelActivity(CHANNEL_ID, makeMessageDto());

    expect(emitToUserMock).not.toHaveBeenCalled();
  });
});
