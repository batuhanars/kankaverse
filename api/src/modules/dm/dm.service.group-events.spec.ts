import { ForbiddenException } from '@nestjs/common';
import { DmService } from './dm.service';
import { DmGroupEventsService } from './dm-group-events.service';

/** C64 §2: grup DM olay satırları (yazım, yayın alıcıları, okuma penceresi). */
const OWNER = 'owner-1';
const TARGET = 'target-1';
const OTHER = 'other-1';
const GROUP = 'group-1';
const JOINED = new Date('2026-11-01T10:00:00Z');

function setup() {
  const prisma = {
    channel: {
      findUnique: jest.fn().mockResolvedValue({
        id: GROUP,
        type: 'GROUP_DM',
        deletedAt: null,
        ownerId: OWNER,
        guildId: null,
      }),
      update: jest.fn(),
    },
    channelMember: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockReturnValue('create-op'),
      delete: jest.fn().mockReturnValue('delete-op'),
      count: jest.fn().mockResolvedValue(2),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: TARGET,
        isMinor: false,
        username: 't',
        avatarUrl: null,
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: OWNER, username: 'batuhan', avatarUrl: null, avatarAnimatedUrl: null },
        { id: TARGET, username: 'Ayla', avatarUrl: 'a.png', avatarAnimatedUrl: null },
      ]),
    },
    friendship: { findFirst: jest.fn().mockResolvedValue({ id: 'f' }) },
    groupDmEvent: { create: jest.fn().mockReturnValue('event-op'), findMany: jest.fn() },
    groupDmDeparture: {
      upsert: jest.fn().mockReturnValue('dep-op'),
      deleteMany: jest.fn().mockReturnValue('dep-del'),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const realtime = { emitToUser: jest.fn(), emitToUsers: jest.fn() };
  const service = new DmService(prisma as never, { canDm: jest.fn() } as never, realtime as never);
  return { prisma, realtime, service };
}

describe('olay yazımı', () => {
  it('ekleme: tek olay MEMBER_ADDED, actor=çağıran, üyelikle AYNI an ve AYNI tx; yayında member dolu, alıcılar değişiklik sonrası üyeler', async () => {
    const { prisma, realtime, service } = setup();
    prisma.channelMember.findUnique.mockImplementation(
      ({ where }: { where: { channelId_userId: { userId: string } } }) =>
        Promise.resolve(where.channelId_userId.userId === OWNER ? { id: 'cm' } : null),
    );
    prisma.channelMember.findMany.mockResolvedValue([{ userId: OWNER }, { userId: TARGET }]);

    await service.addGroupMember(OWNER, GROUP, { userId: TARGET });

    expect(prisma.groupDmEvent.create).toHaveBeenCalledTimes(1);
    const ev = prisma.groupDmEvent.create.mock.calls[0][0].data;
    expect(ev).toMatchObject({
      channelId: GROUP,
      kind: 'MEMBER_ADDED',
      actorId: OWNER,
      targetId: TARGET,
    });
    const created = prisma.channelMember.create.mock.calls[0][0].data.createdAt;
    expect(created).toBe(ev.createdAt); // aynı an
    expect(prisma.$transaction.mock.calls[0][0]).toEqual(['create-op', 'dep-del', 'event-op']);

    const [recipients, name, payload] = realtime.emitToUsers.mock.calls[0];
    expect(name).toBe('dm.group_event');
    expect(recipients.sort()).toEqual([OWNER, TARGET].sort());
    expect(payload).toMatchObject({
      channelId: GROUP,
      event: { kind: 'MEMBER_ADDED', actor: { username: 'batuhan' }, target: { username: 'Ayla' } },
      member: { id: TARGET, username: 'Ayla', avatarUrl: 'a.png' },
    });
  });

  it('ayrılma: MEMBER_LEFT actor null, leftAt ile aynı an, aynı tx; alıcılar kalanlar + ayrılan; member yok; kanal silinse de yayın', async () => {
    const { prisma, realtime, service } = setup();
    prisma.channelMember.findUnique.mockResolvedValue({
      id: 'cm',
      createdAt: JOINED,
      clearedAt: null,
    });
    prisma.channelMember.findMany.mockResolvedValue([{ userId: OWNER }]);
    prisma.channelMember.count.mockResolvedValue(1); // kalan < 2 -> soft-delete

    await service.leaveGroupDm(TARGET, GROUP);

    const ev = prisma.groupDmEvent.create.mock.calls[0][0].data;
    expect(ev).toMatchObject({ kind: 'MEMBER_LEFT', actorId: null, targetId: TARGET });
    expect(ev.createdAt).toBe(prisma.groupDmDeparture.upsert.mock.calls[0][0].create.leftAt);
    expect(prisma.$transaction.mock.calls[0][0]).toEqual(['dep-op', 'delete-op', 'event-op']);
    expect(prisma.channel.update).toHaveBeenCalled();
    const [recipients, name, payload] = realtime.emitToUsers.mock.calls[0];
    expect(name).toBe('dm.group_event');
    expect(recipients.sort()).toEqual([OWNER, TARGET].sort());
    expect(payload).not.toHaveProperty('member');
  });

  it('çıkarma: MEMBER_REMOVED actor=çıkaran', async () => {
    const { prisma, service } = setup();
    prisma.channelMember.findUnique.mockImplementation(
      ({ where }: { where: { channelId_userId: { userId: string } } }) =>
        Promise.resolve({
          id: `cm-${where.channelId_userId.userId}`,
          isAdmin: false,
          createdAt: JOINED,
          clearedAt: null,
        }),
    );
    await service.removeGroupMember(OWNER, GROUP, TARGET);
    expect(prisma.groupDmEvent.create.mock.calls[0][0].data).toMatchObject({
      kind: 'MEMBER_REMOVED',
      actorId: OWNER,
      targetId: TARGET,
    });
  });

  it('yayın hatası işlemi bozmaz; olay mesaj hattına dokunmaz (message/lastRead yazımı yok)', async () => {
    const { prisma, realtime, service } = setup();
    prisma.channelMember.findUnique.mockResolvedValue({
      id: 'cm',
      createdAt: JOINED,
      clearedAt: null,
    });
    realtime.emitToUsers.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(service.leaveGroupDm(TARGET, GROUP)).resolves.toBeNull();
    expect(Object.keys(prisma)).not.toContain('message');
  });
});

describe('GET /dm/groups/:id/events penceresi', () => {
  function make() {
    const ctx = setup();
    const membership = { requireGroupHistoryAccess: jest.fn() };
    const svc = new DmGroupEventsService(ctx.prisma as never, membership as never);
    ctx.prisma.groupDmEvent.findMany.mockResolvedValue([
      {
        id: 'e1',
        channelId: GROUP,
        kind: 'MEMBER_LEFT',
        actorId: null,
        targetId: TARGET,
        createdAt: new Date('2026-11-05T00:00:00Z'),
      },
    ]);
    return { ...ctx, membership, svc };
  }

  it('aktif üye: createdAt >= katılım ve > clearedAt; DTO güncel adlarla', async () => {
    const { prisma, svc } = make();
    const cleared = new Date('2026-11-02T00:00:00Z');
    prisma.channelMember.findUnique.mockResolvedValue({ createdAt: JOINED, clearedAt: cleared });
    const res = await svc.listEvents(OWNER, GROUP);
    expect(prisma.groupDmEvent.findMany.mock.calls[0][0].where.createdAt).toEqual({
      gte: JOINED,
      gt: cleared,
    });
    expect(prisma.groupDmEvent.findMany.mock.calls[0][0].take).toBe(200);
    expect(res[0]).toEqual({
      id: 'e1',
      channelId: GROUP,
      kind: 'MEMBER_LEFT',
      actor: null,
      target: { id: TARGET, username: 'Ayla' },
      createdAt: '2026-11-05T00:00:00.000Z',
    });
  });

  it('eski üye: joinedAt <= olay <= leftAt (leftAt sonrası dönmez)', async () => {
    const { prisma, membership, svc } = make();
    const left = new Date('2026-11-10T00:00:00Z');
    prisma.channelMember.findUnique.mockResolvedValue(null);
    membership.requireGroupHistoryAccess.mockResolvedValue({
      channel: {},
      window: { joinedAt: JOINED, leftAt: left, clearedAt: null },
    });
    await svc.listEvents(TARGET, GROUP);
    expect(prisma.groupDmEvent.findMany.mock.calls[0][0].where.createdAt).toEqual({
      gte: JOINED,
      lte: left,
    });
  });

  it('yabancı: 403 NOT_CHANNEL_MEMBER, sorgu yok', async () => {
    const { prisma, membership, svc } = make();
    prisma.channelMember.findUnique.mockResolvedValue(null);
    membership.requireGroupHistoryAccess.mockRejectedValue(
      new ForbiddenException({ message: 'x', error: 'NOT_CHANNEL_MEMBER' }),
    );
    await expect(svc.listEvents('stranger', GROUP)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.groupDmEvent.findMany).not.toHaveBeenCalled();
  });

  it('GROUP_DM olmayan kanal 403', async () => {
    const { prisma, svc } = make();
    prisma.channel.findUnique.mockResolvedValue({ id: 'x', type: 'DM' });
    await expect(svc.listEvents(OWNER, 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
