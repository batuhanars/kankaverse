import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';

/**
 * E2 §2.5: GROUP_DM'de katılım öncesi şifreli mesaj süzgeci (liste, sayfalama, sabitlenenler, yanıt alıntısı).
 * Süzgecin Prisma anlamı gerçek DB'ye karşı common/utils/pre-join.db.spec.ts'te sınanır.
 */
const JOINED = new Date('2026-11-10T12:00:00Z');
const BEFORE = new Date('2026-11-10T11:00:00Z');
const AFTER = new Date('2026-11-10T13:00:00Z');

const prismaMock = {
  message: { findMany: jest.fn(), findUnique: jest.fn() },
  channelMember: { findUnique: jest.fn() },
  groupDmPastPeriod: { findMany: jest.fn() },
  guildMemberRole: { findMany: jest.fn() },
};
const membershipMock = { requireChannelAccess: jest.fn() };

function makeService() {
  return new MessagesService(
    prismaMock as never,
    membershipMock as never,
    {} as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    {} as never,
  );
}

function msg(id: string, createdAt: Date, replyTo: unknown = null) {
  return {
    id,
    channelId: 'g1',
    content: '',
    replyToId: replyTo ? 'r1' : null,
    replyTo,
    createdAt,
    editedAt: null,
    pinnedAt: null,
    mentions: [],
    author: { id: 'a1', username: 'kanka', avatarUrl: null },
    attachments: [],
    reactions: [],
  };
}

function quote(encrypted: boolean, createdAt: Date) {
  return {
    id: 'r1',
    content: encrypted ? '' : 'eski düz mesaj',
    encrypted,
    createdAt,
    deletedAt: null,
    webhookId: null,
    webhookName: null,
    author: { username: 'eskiyazar' },
    attachments: [],
  };
}

function asGroup(type: 'GROUP_DM' | 'DM', clearedAt: Date | null = null) {
  membershipMock.requireChannelAccess.mockResolvedValue({ id: 'g1', type, guildId: null });
  prismaMock.channelMember.findUnique.mockResolvedValue({ createdAt: JOINED, clearedAt });
}

describe('MessagesService: katılım öncesi şifreli mesaj süzgeci (E2 §2.5)', () => {
  let service: MessagesService;

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.guildMemberRole.findMany.mockResolvedValue([]);
    prismaMock.message.findMany.mockResolvedValue([]);
    service = makeService();
  });

  describe('findMessages', () => {
    it('GROUP_DM: where NOT {encrypted:true, createdAt<katılım}; üyelik satırı katılım zamanını verir', async () => {
      asGroup('GROUP_DM');
      await service.findMessages('u-new', 'g1');
      const where = prismaMock.message.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        channelId: 'g1',
        deletedAt: null,
        NOT: { encrypted: true, createdAt: { lt: JOINED } },
      });
    });

    it('sayfalama (before) ve clearedAt süzgeci katılım süzgecini EZMEZ: üçü birlikte gider', async () => {
      const clearedAt = new Date('2026-11-01T00:00:00Z');
      asGroup('GROUP_DM', clearedAt);
      prismaMock.message.findUnique.mockResolvedValue({ createdAt: AFTER });
      await service.findMessages('u-new', 'g1', 'cursor-1');
      const where = prismaMock.message.findMany.mock.calls[0][0].where;
      expect(where.createdAt).toEqual({ gt: clearedAt, lt: AFTER });
      expect(where.NOT).toEqual({ encrypted: true, createdAt: { lt: JOINED } });
    });

    it('1-1 DM: süzgeç YOK (davranış değişmez)', async () => {
      asGroup('DM');
      await service.findMessages('u1', 'g1');
      expect(prismaMock.message.findMany.mock.calls[0][0].where).not.toHaveProperty('NOT');
    });

    it('yanıt alıntısı: katılım öncesi ŞİFRELİ mesaja alıntı null; düz eski mesaja ve katılım sonrasına kalır', async () => {
      asGroup('GROUP_DM');
      prismaMock.message.findMany.mockResolvedValue([
        msg('m1', AFTER, quote(true, BEFORE)), // gizli
        msg('m2', AFTER, quote(false, BEFORE)), // düz eski: görünür
        msg('m3', AFTER, quote(true, AFTER)), // şifreli ama katılım sonrası: görünür
      ]);
      const res = await service.findMessages('u-new', 'g1');
      const byId = Object.fromEntries(res.map((m) => [m.id, m]));
      expect(byId.m1.replyTo).toBeNull();
      expect(byId.m2.replyTo).toMatchObject({ content: 'eski düz mesaj' });
      expect(byId.m3.replyTo).toMatchObject({ authorUsername: 'eskiyazar', content: '' });
    });
  });

  describe('findPins', () => {
    it('GROUP_DM: sabitlenenlerde de aynı süzgeç', async () => {
      asGroup('GROUP_DM');
      await service.findPins('u-new', 'g1');
      expect(prismaMock.message.findMany.mock.calls[0][0].where).toMatchObject({
        pinnedAt: { not: null },
        NOT: { encrypted: true, createdAt: { lt: JOINED } },
      });
    });

    it('1-1 DM: süzgeç yok', async () => {
      asGroup('DM');
      await service.findPins('u1', 'g1');
      expect(prismaMock.message.findMany.mock.calls[0][0].where).not.toHaveProperty('NOT');
    });
  });
});

/**
 * C62 §2.3 🔴 R7: eski grup üyesi yalnız `leftAt`e kadarki pencereyi okur (sayfalama dahil).
 */
describe('MessagesService.findMessages: eski grup üyesi penceresi (C62)', () => {
  const LEFT = new Date('2026-11-12T12:00:00Z');
  const CLEARED = new Date('2026-11-05T00:00:00Z');
  const GROUP = { id: 'g1', type: 'GROUP_DM', guildId: null };
  let service: MessagesService;

  function forbidden(error = 'NOT_CHANNEL_MEMBER') {
    return new ForbiddenException({ message: 'x', error });
  }
  const membershipFull = {
    requireChannelAccess: jest.fn(),
    requireGroupHistoryAccess: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.guildMemberRole.findMany.mockResolvedValue([]);
    prismaMock.message.findMany.mockResolvedValue([]);
    service = new MessagesService(
      prismaMock as never,
      membershipFull as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    membershipFull.requireChannelAccess.mockRejectedValue(forbidden());
    membershipFull.requireGroupHistoryAccess.mockResolvedValue({
      channel: GROUP,
      window: { joinedAt: JOINED, leftAt: LEFT, clearedAt: CLEARED },
    });
  });

  it('pencere: createdAt <= leftAt, clearedAt sonrası, katılım öncesi şifreli süzgeci; üyelik satırı okunmaz', async () => {
    await service.findMessages('u-old', 'g1');
    const where = prismaMock.message.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ lte: LEFT, gt: CLEARED });
    expect(where.NOT).toEqual({ encrypted: true, createdAt: { lt: JOINED } });
    expect(prismaMock.channelMember.findUnique).not.toHaveBeenCalled();
  });

  it('sayfalama: cursor (lt) pencere üst sınırını (lte leftAt) EZMEZ; cursor leftAt SONRASINI gösterse bile sınır kalır', async () => {
    prismaMock.message.findUnique.mockResolvedValue({
      createdAt: new Date('2026-11-13T00:00:00Z'),
    });
    await service.findMessages('u-old', 'g1', 'cursor-after-left');
    const where = prismaMock.message.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({
      lte: LEFT,
      gt: CLEARED,
      lt: new Date('2026-11-13T00:00:00Z'),
    });
  });

  it('clearedAt yoksa alt sınır yok, üst sınır yine var', async () => {
    membershipFull.requireGroupHistoryAccess.mockResolvedValue({
      channel: GROUP,
      window: { joinedAt: JOINED, leftAt: LEFT, clearedAt: null },
    });
    await service.findMessages('u-old', 'g1');
    expect(prismaMock.message.findMany.mock.calls[0][0].where.createdAt).toEqual({ lte: LEFT });
  });

  it('departure satırı yoksa (history kapısı reddeder) bugünkü 403 NOT_CHANNEL_MEMBER aynen fırlar, sorgu yok', async () => {
    membershipFull.requireGroupHistoryAccess.mockRejectedValue(forbidden());
    const err = await service.findMessages('stranger', 'g1').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ error: 'NOT_CHANNEL_MEMBER' });
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  it('üyelik kapısı başka hata verirse (404 / yaş kapısı) departure kapısına HİÇ bakılmaz', async () => {
    membershipFull.requireChannelAccess.mockRejectedValue(forbidden('AGE_RESTRICTED'));
    await expect(service.findMessages('u-old', 'g1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(membershipFull.requireGroupHistoryAccess).not.toHaveBeenCalled();

    membershipFull.requireChannelAccess.mockRejectedValue(new NotFoundException('yok'));
    await expect(service.findMessages('u-old', 'g1')).rejects.toBeInstanceOf(NotFoundException);
    expect(membershipFull.requireGroupHistoryAccess).not.toHaveBeenCalled();
  });

  it('aktif üye: history kapısı çağrılmaz, davranış değişmez', async () => {
    membershipFull.requireChannelAccess.mockResolvedValue(GROUP);
    prismaMock.channelMember.findUnique.mockResolvedValue({ createdAt: JOINED, clearedAt: null });
    await service.findMessages('u1', 'g1');
    expect(membershipFull.requireGroupHistoryAccess).not.toHaveBeenCalled();
    expect(prismaMock.message.findMany.mock.calls[0][0].where.createdAt).toBeUndefined();
  });
});

/**
 * C62 §2.3.b: eski üye mesajın `leftAt` anındaki HALİNİ görür (tepki süzgeci + düzenleme gövdesi gizleme).
 */
describe('MessagesService.findMessages: pencere sıkılaştırma (C62 §2.3.b)', () => {
  const LEFT = new Date('2026-11-12T12:00:00Z');
  const BEFORE_LEFT = new Date('2026-11-12T11:00:00Z');
  const AFTER_LEFT = new Date('2026-11-12T13:00:00Z');
  const GROUP = { id: 'g1', type: 'GROUP_DM', guildId: null };
  const membershipFull = { requireChannelAccess: jest.fn(), requireGroupHistoryAccess: jest.fn() };
  let service: MessagesService;

  function full(id: string, over: Record<string, unknown> = {}) {
    return {
      ...msg(id, BEFORE_LEFT),
      content: 'gövde',
      mentions: ['u9'],
      mentionsEveryone: true,
      mentionRoles: ['r1'],
      ...over,
    };
  }
  const run = async (asDeparted: boolean) => {
    if (asDeparted) {
      membershipFull.requireChannelAccess.mockRejectedValue(
        new ForbiddenException({ message: 'x', error: 'NOT_CHANNEL_MEMBER' }),
      );
      membershipFull.requireGroupHistoryAccess.mockResolvedValue({
        channel: GROUP,
        window: { joinedAt: JOINED, leftAt: LEFT, clearedAt: null },
      });
    } else {
      membershipFull.requireChannelAccess.mockResolvedValue(GROUP);
      prismaMock.channelMember.findUnique.mockResolvedValue({ createdAt: JOINED, clearedAt: null });
    }
    return service.findMessages('u1', 'g1');
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.guildMemberRole.findMany.mockResolvedValue([]);
    service = new MessagesService(
      prismaMock as never,
      membershipFull as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );
  });

  it('tepkiler: eski üye sorgusu createdAt <= leftAt süzgeci taşır; aktif üyede süzgeç YOK', async () => {
    prismaMock.message.findMany.mockResolvedValue([]);
    await run(true);
    expect(prismaMock.message.findMany.mock.calls[0][0].include.reactions).toEqual({
      where: { createdAt: { lte: LEFT } },
      select: { userId: true, emoji: true },
    });
    prismaMock.message.findMany.mockClear();
    await run(false);
    expect(prismaMock.message.findMany.mock.calls[0][0].include.reactions).toEqual({
      select: { userId: true, emoji: true },
    });
  });

  it('düz mesaj leftAt SONRASI düzenlendi: gövde yok + editedAfterLeave; ÖNCE düzenlendi: normal', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      full('late', { editedAt: AFTER_LEFT }),
      full('early', { editedAt: BEFORE_LEFT }),
      full('never'),
    ]);
    const res = await run(true);
    const by = Object.fromEntries(res.map((m) => [m.id, m])) as Record<string, any>;
    expect(by.late).toMatchObject({
      content: '',
      mentions: [],
      mentionsEveryone: false,
      mentionRoles: [],
      embeds: null,
      editedAfterLeave: true,
    });
    expect(by.early.content).toBe('gövde');
    expect(by.early).not.toHaveProperty('editedAfterLeave');
    expect(by.never.content).toBe('gövde');
    expect(by.never).not.toHaveProperty('editedAfterLeave');
  });

  it('şifreli mesaj leftAt SONRASI düzenlendi: ciphertext/frankingTag yok; öncesi düzenlendiyse ikisi de var', async () => {
    const enc = {
      encrypted: true,
      ciphertext: Buffer.from('abc'),
      frankingTag: Buffer.from('tag'),
      senderDeviceId: 'd1',
      content: '',
    };
    prismaMock.message.findMany.mockResolvedValue([
      full('late', { ...enc, editedAt: AFTER_LEFT }),
      full('early', { ...enc, editedAt: BEFORE_LEFT }),
    ]);
    const res = await run(true);
    const by = Object.fromEntries(res.map((m) => [m.id, m])) as Record<string, any>;
    expect(by.late.editedAfterLeave).toBe(true);
    expect(by.late).not.toHaveProperty('ciphertext');
    expect(by.late).not.toHaveProperty('frankingTag');
    expect(by.early.ciphertext).toBeDefined();
    expect(by.early.frankingTag).toBeDefined();
    expect(by.early).not.toHaveProperty('editedAfterLeave');
  });

  it('aktif üyede aynı düzenlenmiş mesaj: bayrak HİÇ yok, gövde tam', async () => {
    prismaMock.message.findMany.mockResolvedValue([full('late', { editedAt: AFTER_LEFT })]);
    const [m] = (await run(false)) as Array<Record<string, any>>;
    expect(m).not.toHaveProperty('editedAfterLeave');
    expect(m.content).toBe('gövde');
    expect(m.mentions).toEqual(['u9']);
    expect(m.mentionsEveryone).toBe(true);
  });

  it('replyTo: alıntılanan mesaj leftAt sonrası düzenlendiyse content "" + editedAfterLeave; aktif üyede alan yok', async () => {
    const q = { ...quote(false, BEFORE_LEFT), editedAt: AFTER_LEFT };
    prismaMock.message.findMany.mockResolvedValue([full('m1', { replyTo: q, replyToId: 'r1' })]);
    const [dep] = (await run(true)) as Array<Record<string, any>>;
    expect(dep.replyTo).toMatchObject({ content: '', editedAfterLeave: true });

    const [act] = (await run(false)) as Array<Record<string, any>>;
    expect(act.replyTo).toMatchObject({ content: 'eski düz mesaj' });
    expect(act.replyTo).not.toHaveProperty('editedAfterLeave');

    const q2 = { ...quote(false, BEFORE_LEFT), editedAt: BEFORE_LEFT };
    prismaMock.message.findMany.mockResolvedValue([full('m1', { replyTo: q2, replyToId: 'r1' })]);
    const [ok] = (await run(true)) as Array<Record<string, any>>;
    expect(ok.replyTo.content).toBe('eski düz mesaj');
    expect(ok.replyTo).not.toHaveProperty('editedAfterLeave');
  });
});

describe('MessagesService: önceki üyelik dönemleri (C65)', () => {
  const P = {
    joinedAt: new Date('2026-11-01T00:00:00Z'),
    leftAt: new Date('2026-11-03T00:00:00Z'),
  };
  let service: MessagesService;
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.guildMemberRole.findMany.mockResolvedValue([]);
    prismaMock.message.findMany.mockResolvedValue([]);
    service = makeService();
    asGroup('GROUP_DM');
    prismaMock.groupDmPastPeriod.findMany.mockResolvedValue([P]);
  });

  it('findMessages ve findPins where: dönem dışlaması açık (sayfalama dahil)', async () => {
    prismaMock.message.findUnique.mockResolvedValue({ createdAt: AFTER });
    await service.findMessages('u', 'g1', 'cursor');
    const expected = {
      encrypted: true,
      createdAt: { lt: JOINED },
      NOT: [{ createdAt: { gte: P.joinedAt, lte: P.leftAt } }],
    };
    expect(prismaMock.message.findMany.mock.calls[0][0].where.NOT).toEqual(expected);
    await service.findPins('u', 'g1');
    expect(prismaMock.message.findMany.mock.calls[1][0].where.NOT).toEqual(expected);
  });

  it('replyTo: dönem içi şifreli mesaja alıntı görünür, dönemler arası gizli', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      msg('a', AFTER, quote(true, new Date('2026-11-02T00:00:00Z'))),
      msg('b', AFTER, quote(true, new Date('2026-11-05T00:00:00Z'))),
    ]);
    const res = await service.findMessages('u', 'g1');
    const by = Object.fromEntries(res.map((m) => [m.id, m]));
    expect(by.a.replyTo).not.toBeNull();
    expect(by.b.replyTo).toBeNull();
  });

  it('GROUP_DM dışı kanalda süzgeç ve dönem sorgusu yok', async () => {
    asGroup('DM');
    prismaMock.groupDmPastPeriod.findMany.mockClear();
    await service.findMessages('u', 'g1');
    expect(prismaMock.groupDmPastPeriod.findMany).not.toHaveBeenCalled();
    expect(prismaMock.message.findMany.mock.calls[0][0].where).not.toHaveProperty('NOT');
  });
});
