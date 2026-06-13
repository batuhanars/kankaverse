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
  user: { findUnique: jest.fn(), findMany: jest.fn() },
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

// ── MessagesGateway.notifyMentions (§5) ──────────────────────────────────────

describe('MessagesGateway.notifyMentions', () => {
  let gateway: MessagesGateway;

  const MENTIONED_USER_1 = 'user-mentioned-1';
  const MENTIONED_USER_2 = 'user-mentioned-2';

  function makeMentionDto(overrides: Partial<{
    mentions: string[];
    authorId: string;
    content: string;
  }> = {}) {
    const authorId = overrides.authorId ?? AUTHOR_ID;
    const mentions = overrides.mentions ?? [MENTIONED_USER_1];
    const content = overrides.content ?? `<@${MENTIONED_USER_1}> buna bakabilir misin`;
    return {
      id: 'msg-mention-1',
      channelId: CHANNEL_ID,
      content,
      mentions,
      author: { id: authorId, username: 'author', avatarUrl: null },
      createdAt: new Date().toISOString(),
    } as Record<string, unknown>;
  }

  beforeEach(() => {
    resetMocks();
    gateway = makeGateway();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // mentions boşsa erken çık
  // ─────────────────────────────────────────────────────────────────────────
  it('mentions boş dizi → erken çıkar, emit yapılmaz', async () => {
    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({ mentions: [] }));

    expect(emitToUserMock).not.toHaveBeenCalled();
    expect(prismaMock.channel.findUnique).not.toHaveBeenCalled();
  });

  it('mentions undefined → erken çıkar, emit yapılmaz', async () => {
    const dto = makeMentionDto({ mentions: [] });
    delete (dto as Record<string, unknown>)['mentions'];

    await gateway.notifyMentions(CHANNEL_ID, dto);

    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // yazar kendine mention eventi almaz
  // ─────────────────────────────────────────────────────────────────────────
  it('bahsedilen userId === authorId → event gönderilmez', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([{ id: AUTHOR_ID, username: 'author' }]);

    // yazar kendini bahsediyor
    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [AUTHOR_ID],
      authorId: AUTHOR_ID,
      content: `<@${AUTHOR_ID}> bla`,
    }));

    expect(emitToUserMock).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // başarılı mention eventi: §5 payload şekli
  // ─────────────────────────────────────────────────────────────────────────
  it('başarılı mention → bahsedilene §5 payload ile emit yapılır', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kanka1' },
    ]);

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      authorId: AUTHOR_ID,
      content: `<@${MENTIONED_USER_1}> buna bakar mısın`,
    }));

    expect(emitToUserMock).toHaveBeenCalledTimes(1);
    const [targetId, event, payload] = emitToUserMock.mock.calls[0];
    expect(targetId).toBe(MENTIONED_USER_1);
    expect(event).toBe('mention');
    expect(payload.messageId).toBe('msg-mention-1');
    expect(payload.channelId).toBe(CHANNEL_ID);
    expect(payload.guildId).toBe(GUILD_ID);
    expect(payload.author.id).toBe(AUTHOR_ID);
    expect(payload.preview).toContain('@kanka1');
    expect(payload.preview.length).toBeLessThanOrEqual(100);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DM kanalı: guildId null
  // ─────────────────────────────────────────────────────────────────────────
  it('DM kanalı → payload guildId=null', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: null });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kanka1' },
    ]);

    await gateway.notifyMentions(DM_CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      authorId: AUTHOR_ID,
    }));

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.guildId).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // preview: token → @username çözülür; ≤100 karakter
  // ─────────────────────────────────────────────────────────────────────────
  it('preview: token @id → @username çözülür', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kankakullanici' },
    ]);

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      content: `<@${MENTIONED_USER_1}> selam`,
    }));

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.preview).toBe('@kankakullanici selam');
  });

  it('preview: çözülemeyen token → @bilinmeyen', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kanka1' },
    ]);
    const UNKNOWN_ID = 'user-unknown-xyz';

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      content: `<@${MENTIONED_USER_1}> ve <@${UNKNOWN_ID}>`,
    }));

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.preview).toContain('@bilinmeyen');
    expect(payload.preview).toContain('@kanka1');
  });

  it('preview: 100 karakteri aşan içerik kesilir', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'k' },
    ]);
    const longContent = `<@${MENTIONED_USER_1}> ` + 'a'.repeat(200);

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1],
      content: longContent,
    }));

    const [, , payload] = emitToUserMock.mock.calls[0];
    expect(payload.preview.length).toBeLessThanOrEqual(100);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // birden fazla bahsedilen: her biri için ayrı emit
  // ─────────────────────────────────────────────────────────────────────────
  it('iki bahsedilen → iki ayrı emit; yazar hariç', async () => {
    prismaMock.channel.findUnique.mockResolvedValue({ guildId: GUILD_ID });
    prismaMock.user.findMany.mockResolvedValue([
      { id: MENTIONED_USER_1, username: 'kanka1' },
      { id: MENTIONED_USER_2, username: 'kanka2' },
    ]);

    await gateway.notifyMentions(CHANNEL_ID, makeMentionDto({
      mentions: [MENTIONED_USER_1, MENTIONED_USER_2],
      authorId: AUTHOR_ID,
      content: `<@${MENTIONED_USER_1}> ve <@${MENTIONED_USER_2}>`,
    }));

    expect(emitToUserMock).toHaveBeenCalledTimes(2);
    const targets = emitToUserMock.mock.calls.map((c) => c[0]);
    expect(targets).toContain(MENTIONED_USER_1);
    expect(targets).toContain(MENTIONED_USER_2);
    expect(targets).not.toContain(AUTHOR_ID);
  });
});
