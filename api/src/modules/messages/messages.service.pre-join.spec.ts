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
