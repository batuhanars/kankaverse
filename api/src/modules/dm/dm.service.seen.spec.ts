import { DmService } from './dm.service';
import { seenReadersDecision } from './dm-seen.util';

// C67 §2 — görüldü avatarları: saf karar, DTO `seenBy`, canlı `dm:seen`.

const prismaMock = {
  channel: { findUnique: jest.fn() },
  channelMember: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  userBlock: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  message: { findFirst: jest.fn() },
  groupDmPastPeriod: { findMany: jest.fn() },
  groupDmDeparture: { findMany: jest.fn() },
};
const realtimeMock = { emitToUser: jest.fn() };

function makeService() {
  return new DmService(prismaMock as any, {} as any, realtimeMock as any);
}

function reset() {
  jest.resetAllMocks();
  prismaMock.channelMember.findMany.mockResolvedValue([]);
  prismaMock.userBlock.findMany.mockResolvedValue([]);
  prismaMock.groupDmPastPeriod.findMany.mockResolvedValue([]);
  prismaMock.groupDmDeparture.findMany.mockResolvedValue([]);
}

const t = (s: string) => new Date(`2026-11-13T${s}.000Z`);
const T1 = t('10:01:00');
const T2 = t('10:02:00');
const T3 = t('10:03:00');

describe('seenReadersDecision (saf)', () => {
  const m = (userId: string, lastReadAt: Date | null, over: Record<string, unknown> = {}) => ({
    userId,
    readReceipts: true,
    blockedEitherWay: false,
    lastReadAt,
    ...over,
  });
  const base = { requestPending: false, viewerReadReceipts: true };

  it('açık okuyucular eskiden yeniye, ISO readAt ile döner', () => {
    expect(seenReadersDecision({ ...base, members: [m('b', T3), m('a', T1)] })).toEqual({
      visible: true,
      readers: [
        { userId: 'a', readAt: T1.toISOString() },
        { userId: 'b', readAt: T3.toISOString() },
      ],
    });
  });

  it('ayarı kapalı üye yok', () => {
    const out = seenReadersDecision({
      ...base,
      members: [m('a', T1, { readReceipts: false }), m('b', T2)],
    });
    expect(out.readers.map((r) => r.userId)).toEqual(['b']);
  });

  it('engelli üye yok', () => {
    const out = seenReadersDecision({
      ...base,
      members: [m('a', T1, { blockedEitherWay: true }), m('b', T2)],
    });
    expect(out.readers.map((r) => r.userId)).toEqual(['b']);
  });

  it('hiç okumamış (lastReadAt null) listeye girmez', () => {
    expect(seenReadersDecision({ ...base, members: [m('a', null)] })).toEqual({
      visible: true,
      readers: [],
    });
  });

  it('izleyicinin kendi ayarı kapalıysa görünmez ve boş (karşılıklılık)', () => {
    expect(
      seenReadersDecision({
        requestPending: false,
        viewerReadReceipts: false,
        members: [m('a', T1)],
      }),
    ).toEqual({ visible: false, readers: [] });
  });

  it('PENDING mesaj isteğinde boş', () => {
    expect(
      seenReadersDecision({
        requestPending: true,
        viewerReadReceipts: true,
        members: [m('a', T1)],
      }),
    ).toEqual({ visible: false, readers: [] });
  });
});

describe('DmService.getDmChannels seenBy', () => {
  const U = 'u-viewer';
  const A = 'u-a';
  const B = 'u-b';
  const mem = (userId: string, lastReadAt: Date | null, readReceipts = true) => ({
    userId,
    lastReadAt,
    user: { id: userId, username: userId, avatarUrl: null, avatarAnimatedUrl: null, readReceipts },
  });
  const row = (type: 'DM' | 'GROUP_DM', members: any[]) => ({
    lastReadAt: null,
    clearedAt: null,
    createdAt: t('09:00:00'),
    channel: {
      id: 'ch-1',
      type,
      name: 'g',
      ownerId: U,
      deletedAt: null,
      dmRequestStatus: null,
      createdAt: t('09:00:00'),
      members,
      messages: [],
    },
  });

  it('1-1: seenBy karşı tarafın okuma anı; eski alanlar aynı', async () => {
    reset();
    prismaMock.channelMember.findMany.mockResolvedValue([row('DM', [mem(U, null), mem(A, T2)])]);
    const res = (await makeService().getDmChannels(U)) as any[];
    expect(res[0].seenBy).toEqual([{ userId: A, readAt: T2.toISOString() }]);
    expect(res[0].receiptsEnabled).toBe(true);
    expect(res[0].otherReadAt).toBe(T2.toISOString());
  });

  it('1-1: karşı taraf kapalı / engelli / izleyici kapalı → boş', async () => {
    reset();
    prismaMock.channelMember.findMany.mockResolvedValue([
      row('DM', [mem(U, null), mem(A, T2, false)]),
    ]);
    expect(((await makeService().getDmChannels(U)) as any[])[0].seenBy).toEqual([]);

    reset();
    prismaMock.channelMember.findMany.mockResolvedValue([row('DM', [mem(U, null), mem(A, T2)])]);
    prismaMock.userBlock.findMany
      .mockResolvedValueOnce([{ blockedId: A }])
      .mockResolvedValueOnce([]);
    expect(((await makeService().getDmChannels(U)) as any[])[0].seenBy).toEqual([]);

    reset();
    prismaMock.channelMember.findMany.mockResolvedValue([
      row('DM', [mem(U, null, false), mem(A, T2)]),
    ]);
    expect(((await makeService().getDmChannels(U)) as any[])[0].seenBy).toEqual([]);
  });

  it('grup: uygun üyeler bireysel okuma anıyla; eski alanlar aynı kalır', async () => {
    reset();
    prismaMock.channelMember.findMany.mockResolvedValue([
      row('GROUP_DM', [mem(U, null), mem(A, T1), mem(B, T3)]),
    ]);
    const res = (await makeService().getDmChannels(U)) as any[];
    expect(res[0].seenBy).toEqual([
      { userId: A, readAt: T1.toISOString() },
      { userId: B, readAt: T3.toISOString() },
    ]);
    expect(res[0].receiptsEnabled).toBe(true);
    expect(res[0].groupAllReadAt).toBe(T1.toISOString());
  });

  it('grup: kapalı ve engelli üye yok; izleyici kapalıysa boş', async () => {
    reset();
    prismaMock.channelMember.findMany.mockResolvedValue([
      row('GROUP_DM', [mem(U, null), mem(A, T1), mem(B, T3, false)]),
    ]);
    prismaMock.userBlock.findMany
      .mockResolvedValueOnce([{ blockedId: A }])
      .mockResolvedValueOnce([]);
    expect(((await makeService().getDmChannels(U)) as any[])[0].seenBy).toEqual([]);

    reset();
    prismaMock.channelMember.findMany.mockResolvedValue([
      row('GROUP_DM', [mem(U, null, false), mem(A, T1)]),
    ]);
    expect(((await makeService().getDmChannels(U)) as any[])[0].seenBy).toEqual([]);
  });
});

describe('DmService toDmChannelDto (tek kanal) seenBy', () => {
  const U = 'u-viewer';
  const A = 'u-a';
  const mem = (userId: string, lastReadAt: Date | null, readReceipts = true) => ({
    userId,
    lastReadAt,
    clearedAt: null,
    user: { readReceipts },
  });
  async function dto(members: any[], pending: string | null, selfBlock = false) {
    reset();
    prismaMock.channelMember.findMany.mockResolvedValue(members);
    prismaMock.message.findFirst.mockResolvedValue(null);
    prismaMock.userBlock.findUnique
      .mockResolvedValueOnce(selfBlock ? { id: 'x' } : null)
      .mockResolvedValueOnce(null);
    prismaMock.channel.findUnique.mockResolvedValue({
      dmRequestStatus: pending,
      dmRequesterId: null,
    });
    return (makeService() as any).toDmChannelDto('ch-1', { id: A, username: 'a' }, U);
  }

  it('açık: seenBy dolu, eski alanlar aynı', async () => {
    const r = await dto([mem(U, null), mem(A, T2)], null);
    expect(r.seenBy).toEqual([{ userId: A, readAt: T2.toISOString() }]);
    expect(r.otherReadAt).toBe(T2.toISOString());
  });

  it('PENDING istekte boş', async () => {
    const r = await dto([mem(U, null), mem(A, T2)], 'PENDING');
    expect(r.seenBy).toEqual([]);
  });

  it('engel / kapalı ayar boş', async () => {
    expect((await dto([mem(U, null), mem(A, T2)], null, true)).seenBy).toEqual([]);
    expect((await dto([mem(U, null), mem(A, T2, false)], null)).seenBy).toEqual([]);
    expect((await dto([mem(U, null, false), mem(A, T2)], null)).seenBy).toEqual([]);
  });
});

describe('DmService.markRead dm:seen yayını', () => {
  const R = 'u-reader';
  const A = 'u-a';
  const B = 'u-b';
  const C = 'u-c';
  const mem = (userId: string, lastReadAt: Date | null, readReceipts = true) => ({
    userId,
    lastReadAt,
    user: { readReceipts },
  });
  const seenCalls = () => realtimeMock.emitToUser.mock.calls.filter((c) => c[1] === 'dm:seen');

  function arrange(
    type: 'DM' | 'GROUP_DM',
    members: any[],
    opts: { pending?: string | null; blocks?: any[] } = {},
  ) {
    reset();
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'm-1' });
    prismaMock.channelMember.update.mockResolvedValue({});
    prismaMock.channel.findUnique.mockResolvedValue({
      type,
      dmRequestStatus: opts.pending ?? null,
      members: members.map((m) => ({ userId: m.userId, user: m.user })),
    });
    prismaMock.channelMember.findMany.mockResolvedValue(members);
    prismaMock.userBlock.findMany.mockResolvedValue(opts.blocks ?? []);
  }

  it('grup: yalnız görebilenlere gider; ayarı kapalı izleyiciye, engelliye ve okuyanın kendisine gitmez', async () => {
    arrange('GROUP_DM', [mem(R, T3), mem(A, T1), mem(B, T1, false), mem(C, T1)], {
      blocks: [{ blockerId: C, blockedId: R }],
    });
    await makeService().markRead(R, 'ch-1');
    const calls = seenCalls();
    expect(calls.map((c) => c[0])).toEqual([A]);
    expect(calls[0][2]).toEqual({ channelId: 'ch-1', userId: R, readAt: T3.toISOString() });
  });

  it('okuyanın ayarı kapalıysa hiç kimseye gitmez', async () => {
    arrange('GROUP_DM', [mem(R, T3, false), mem(A, T1), mem(B, T1)]);
    await makeService().markRead(R, 'ch-1');
    expect(seenCalls()).toHaveLength(0);
  });

  it('1-1: karşı tarafa gider; eski dm:read de aynen yayınlanır', async () => {
    arrange('DM', [mem(R, T3), mem(A, T1)]);
    await makeService().markRead(R, 'ch-1');
    expect(seenCalls().map((c) => c[0])).toEqual([A]);
    expect(realtimeMock.emitToUser.mock.calls.some((c) => c[1] === 'dm:read' && c[0] === A)).toBe(
      true,
    );
  });

  it('PENDING istekte gitmez', async () => {
    arrange('DM', [mem(R, T3), mem(A, T1)], { pending: 'PENDING' });
    await makeService().markRead(R, 'ch-1');
    expect(seenCalls()).toHaveLength(0);
  });

  it('grupta dm:groupRead geriye uyum için kalır', async () => {
    arrange('GROUP_DM', [mem(R, T3), mem(A, T1)]);
    await makeService().markRead(R, 'ch-1');
    expect(realtimeMock.emitToUser.mock.calls.some((c) => c[1] === 'dm:groupRead')).toBe(true);
  });
});
