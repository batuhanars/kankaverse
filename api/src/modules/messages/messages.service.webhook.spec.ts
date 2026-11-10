import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MessagesService } from './messages.service';

// C35: MessagesService'in webhook ile paylaştığı çekirdek + DTO + düzenlenmez/silme kuralları

const prismaMock = {
  message: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
  guildMemberRole: { findMany: jest.fn() },
  role: { findMany: jest.fn(), findFirst: jest.fn() },
  guildMember: { findMany: jest.fn() },
};
const membershipMock = { requireChannelAccess: jest.fn() };
const permissionsMock = { hasGuildPermission: jest.fn(), hasFullAccess: jest.fn() };
const automodMock = { check: jest.fn() };
const moderationMock = { hasActiveBan: jest.fn(), hasActiveMute: jest.fn() };

const CREATOR = 'creator-secret-id';
const CHANNEL = {
  id: 'ch-1',
  guildId: 'g-1',
  slowModeSeconds: 0,
  ageGated: false,
  guild: { adultsOnly: false },
};

function service() {
  return new MessagesService(
    prismaMock as never,
    membershipMock as never,
    permissionsMock as never,
    automodMock as never,
    { get: jest.fn() } as never,
    moderationMock as never,
    { planSend: jest.fn(), planEdit: jest.fn() } as never,
  );
}

function webhookRow(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    channelId: 'ch-1',
    authorId: CREATOR,
    content: 'selam',
    replyToId: null,
    replyTo: null,
    editedAt: null,
    pinnedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-10-30T10:00:00Z'),
    mentions: [],
    mentionsEveryone: false,
    mentionRoles: [],
    webhookId: 'wh-1',
    webhookName: 'GitHub',
    embeds: [{ title: 'T' }],
    author: {
      id: CREATOR,
      username: 'olusturan',
      avatarUrl: 'https://cdn/a.png',
      avatarAnimatedUrl: null,
    },
    attachments: [],
    reactions: [],
    ...over,
  };
}

const INPUT = {
  creatorId: CREATOR,
  webhookId: 'wh-1',
  webhookName: 'GitHub',
  content: 'selam',
  embeds: null,
  mentionsEveryone: false,
  mentionRoles: [] as string[],
};

beforeEach(() => {
  jest.resetAllMocks();
  prismaMock.guildMemberRole.findMany.mockResolvedValue([]);
  permissionsMock.hasGuildPermission.mockResolvedValue(false);
  automodMock.check.mockReturnValue({ blocked: false });
  moderationMock.hasActiveBan.mockResolvedValue(false);
  moderationMock.hasActiveMute.mockResolvedValue(false);
});

describe('createWebhookMessage (§5.1)', () => {
  it('author webhook kimliği; oluşturanın id, adı ve avatarı DTO içinde HİÇ yok', async () => {
    prismaMock.message.create.mockResolvedValue(webhookRow());
    const dto = await service().createWebhookMessage(CHANNEL, {
      ...INPUT,
      embeds: [{ title: 'T' }],
    });

    expect(dto.author).toEqual({
      id: 'wh-1',
      username: 'GitHub',
      avatarUrl: null,
      avatarAnimatedUrl: null,
      roleEmoji: null,
    });
    expect(dto.webhook).toEqual({ id: 'wh-1' });
    expect(dto.embeds).toEqual([{ title: 'T' }]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain(CREATOR);
    expect(json).not.toContain('olusturan');
    expect(json).not.toContain('cdn/a.png');
  });

  it('yazım: authorId = oluşturan, kullanıcı bahsetmesi boş, webhook alanları dolu', async () => {
    prismaMock.message.create.mockResolvedValue(webhookRow({ embeds: null }));
    await service().createWebhookMessage(CHANNEL, INPUT);
    const data = prismaMock.message.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      authorId: CREATOR,
      mentions: [],
      webhookId: 'wh-1',
      webhookName: 'GitHub',
    });
  });

  it('webhookId olmayan satırda DTO webhook ve embeds null döner, yazar normal', async () => {
    prismaMock.message.create.mockResolvedValue(
      webhookRow({ webhookId: null, webhookName: null, embeds: null }),
    );
    const dto = await service().createWebhookMessage(CHANNEL, INPUT);
    expect(dto.webhook).toBeNull();
    expect(dto.embeds).toBeNull();
    expect(dto.author.id).toBe(CREATOR);
  });
});

describe('ortak çekirdek (§3)', () => {
  it('assertSenderUnrestricted: ban USER_BANNED, mute USER_MUTED', async () => {
    moderationMock.hasActiveBan.mockResolvedValue(true);
    await expect(service().assertSenderUnrestricted('u', 'g')).rejects.toMatchObject({
      response: { error: 'USER_BANNED' },
    });
    moderationMock.hasActiveBan.mockResolvedValue(false);
    moderationMock.hasActiveMute.mockResolvedValue(true);
    await expect(service().assertSenderUnrestricted('u', 'g')).rejects.toMatchObject({
      response: { error: 'USER_MUTED' },
    });
    expect(moderationMock.hasActiveMute).toHaveBeenCalledWith('u', 'g');
  });

  it('assertTextsAllowed her metni ayrı denetler, boşları atlar, takılan MESSAGE_BLOCKED', () => {
    automodMock.check.mockImplementation((t: string) => ({ blocked: t === 'kufur' }));
    expect(() => service().assertTextsAllowed(['temiz', '', '  ', 'baska'])).not.toThrow();
    expect(automodMock.check).toHaveBeenCalledTimes(2);
    expect(() => service().assertTextsAllowed(['temiz', 'kufur'])).toThrow(BadRequestException);
  });

  it('resolveMentions resolveUsers:false kullanıcı sorgusu açmaz, mentions boş', async () => {
    const res = await service().resolveMentions(CHANNEL, '<@u1> <@u2>', CREATOR, {
      resolveUsers: false,
    });
    expect(res.mentions).toEqual([]);
    expect(prismaMock.guildMember.findMany).not.toHaveBeenCalled();
  });

  it('@everyone oluşturanın MENTION_EVERYONE izni yoksa çözülmez (izin oluşturanın kimliğiyle sorulur)', async () => {
    prismaMock.role.findMany.mockResolvedValue([
      { id: 'r-ev', mentionable: true, isEveryone: true },
    ]);
    const opts = { resolveUsers: false };
    const denied = await service().resolveMentions(CHANNEL, '<@&r-ev>', CREATOR, opts);
    expect(denied.mentionsEveryone).toBe(false);
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(
      CREATOR,
      'g-1',
      'MENTION_EVERYONE',
    );
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    const allowed = await service().resolveMentions(CHANNEL, '<@&r-ev>', CREATOR, opts);
    expect(allowed.mentionsEveryone).toBe(true);
  });
});

describe('düz metin @everyone (yalnız webhook yolu)', () => {
  const EVERYONE = { id: 'r-ev', mentionable: true, isEveryone: true };
  beforeEach(() => {
    prismaMock.role.findFirst.mockResolvedValue({ id: 'r-ev' });
    prismaMock.role.findMany.mockResolvedValue([EVERYONE]);
  });
  const resolve = (content: string, plainEveryone: boolean) =>
    service().resolveMentions(CHANNEL, content, CREATOR, { resolveUsers: false, plainEveryone });

  it('izin + mentionable varsa düz @everyone toplu bahsetme üretir', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    expect((await resolve('deploy bitti @everyone', true)).mentionsEveryone).toBe(true);
  });

  it('oluşturanın MENTION_EVERYONE izni yoksa düz metin kalır', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    expect((await resolve('@everyone', true)).mentionsEveryone).toBe(false);
  });

  it('everyone rolü mentionable değilse düz metin kalır', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    prismaMock.role.findMany.mockResolvedValue([{ ...EVERYONE, mentionable: false }]);
    expect((await resolve('@everyone', true)).mentionsEveryone).toBe(false);
  });

  it('@here düz metin kalır, eşleşmeyen biçimler (mail@everyone, @everyones) çözülmez', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    for (const text of ['@here', 'mail@everyone.com x', 'a@everyone', '@everyones']) {
      const res = await resolve(text, true);
      expect(res.mentionsEveryone).toBe(false);
    }
    expect(prismaMock.role.findFirst).not.toHaveBeenCalled();
  });

  it('normal kullanıcı yolu DEĞİŞMEZ: plainEveryone kapalıyken düz @everyone bahsetme üretmez', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(true);
    prismaMock.role.findMany.mockResolvedValue([]);
    const res = await resolve('@everyone', false);
    expect(res.mentionsEveryone).toBe(false);
    expect(prismaMock.role.findFirst).not.toHaveBeenCalled();
  });
});

describe('düzenleme ve silme (§4.6)', () => {
  beforeEach(() => {
    membershipMock.requireChannelAccess.mockResolvedValue(CHANNEL);
    prismaMock.message.findUnique.mockResolvedValue(webhookRow());
  });

  it('webhook mesajı düzenlenemez: oluşturan dahil 403 WEBHOOK_MESSAGE_READONLY', async () => {
    await expect(
      service().editMessage(CREATOR, 'ch-1', 'm1', { content: 'yeni' }),
    ).rejects.toMatchObject({ response: { error: 'WEBHOOK_MESSAGE_READONLY' } });
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });

  it('silme: MANAGE_WEBHOOKS sahibi webhook mesajını siler', async () => {
    permissionsMock.hasGuildPermission.mockImplementation((_u: string, _g: string, flag: string) =>
      Promise.resolve(flag === 'MANAGE_WEBHOOKS'),
    );
    await service().deleteMessage('yonetici', 'ch-1', 'm1');
    expect(prismaMock.message.update).toHaveBeenCalled();
  });

  it('silme: normal mesajı MANAGE_WEBHOOKS tek başına silemez', async () => {
    prismaMock.message.findUnique.mockResolvedValue(webhookRow({ webhookId: null }));
    permissionsMock.hasGuildPermission.mockImplementation((_u: string, _g: string, flag: string) =>
      Promise.resolve(flag === 'MANAGE_WEBHOOKS'),
    );
    await expect(service().deleteMessage('yonetici', 'ch-1', 'm1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('silme: hiçbir izni olmayan 403', async () => {
    await expect(service().deleteMessage('rastgele', 'ch-1', 'm1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
