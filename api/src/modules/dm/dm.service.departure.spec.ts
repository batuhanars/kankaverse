import { NotFoundException } from '@nestjs/common';
import { DmService } from './dm.service';

/**
 * C62 §2: gruptan ayrılan/çıkarılan üyenin listede kalması (departure kaydı yazımı, liste ucu, silme ucu, olay).
 * Gerçek Prisma anlamı (tx atomikliği, pencere süzgeci) dm-departure.db.spec.ts'te sınanır.
 */
const OWNER = 'owner-1';
const LEAVER = 'leaver-1';
const OTHER = 'other-1';
const GROUP = 'group-1';
const JOINED = new Date('2026-11-01T10:00:00Z');
const CLEARED = new Date('2026-11-05T10:00:00Z');
const LEFT = new Date('2026-11-10T10:00:00Z');

const GROUP_CHANNEL = {
  id: GROUP,
  type: 'GROUP_DM',
  name: 'Grup',
  ownerId: OWNER,
  guildId: null,
  deletedAt: null,
  createdAt: new Date('2026-10-30T10:00:00Z'),
};

function setup() {
  const prisma = {
    channel: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    channelMember: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockReturnValue('delete-op'),
      count: jest.fn().mockResolvedValue(2),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    message: { findFirst: jest.fn().mockResolvedValue(null) },
    userBlock: { findMany: jest.fn().mockResolvedValue([]) },
    groupDmPastPeriod: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockReturnValue('period-op'),
      deleteMany: jest.fn().mockReturnValue('period-del'),
    },
    groupDmEvent: { create: jest.fn().mockReturnValue('event-op') },
    groupDmDeparture: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockReturnValue('departure-op'),
      deleteMany: jest.fn().mockReturnValue('dep-del-op'),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const realtime = { emitToUser: jest.fn() };
  const voice = { evictFromRooms: jest.fn().mockResolvedValue(undefined) };
  const service = new DmService(
    prisma as never,
    { canDm: jest.fn() } as never,
    realtime as never,
    undefined,
    undefined,
    voice as never,
  );
  prisma.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
  return { prisma, realtime, voice, service };
}

describe('departure yazımı (ayrılma/çıkarma)', () => {
  it('ayrılma: LEFT, joinedAt/clearedAt/memberIds doğru; upsert üyelik silmeyle TEK transaction; sonra olay', async () => {
    const { prisma, realtime, service } = setup();
    prisma.channelMember.findUnique.mockResolvedValue({
      id: 'cm-1',
      createdAt: JOINED,
      clearedAt: CLEARED,
    });
    prisma.channelMember.findMany.mockResolvedValue([{ userId: OWNER }, { userId: OTHER }]);

    await service.leaveGroupDm(LEAVER, GROUP);

    expect(prisma.groupDmDeparture.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.groupDmDeparture.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ channelId_userId: { channelId: GROUP, userId: LEAVER } });
    expect(arg.create).toMatchObject({
      channelId: GROUP,
      userId: LEAVER,
      joinedAt: JOINED,
      clearedAt: CLEARED,
      reason: 'LEFT',
      memberIds: [OWNER, OTHER],
    });
    expect(arg.create.leftAt).toBeInstanceOf(Date);
    // ayrılanın kendisi memberIds'e GİRMEZ: üye sorgusu `userId: { not }` ile
    expect(prisma.channelMember.findMany.mock.calls[0][0].where).toEqual({
      channelId: GROUP,
      userId: { not: LEAVER },
    });
    // tek transaction: departure önce, üyelik silme sonra (aynı dizi)
    expect(prisma.$transaction).toHaveBeenCalledWith(['departure-op', 'delete-op', 'event-op', 'period-op']);

    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
    expect(realtime.emitToUser).toHaveBeenCalledWith(LEAVER, 'dm.group_departed', {
      channelId: GROUP,
      reason: 'LEFT',
      leftAt: arg.create.leftAt.toISOString(),
    });
  });

  it('çıkarma: REMOVED; olay YALNIZ çıkarılana gider (çağırana değil)', async () => {
    const { prisma, realtime, service } = setup();
    prisma.channelMember.findUnique.mockImplementation(
      ({ where }: { where: { channelId_userId: { userId: string } } }) =>
        Promise.resolve({
          id: `cm-${where.channelId_userId.userId}`,
          isAdmin: false,
          createdAt: JOINED,
          clearedAt: null,
        }),
    );

    await service.removeGroupMember(OWNER, GROUP, LEAVER);

    const arg = prisma.groupDmDeparture.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ userId: LEAVER, reason: 'REMOVED', clearedAt: null });
    expect(prisma.$transaction).toHaveBeenCalledWith(['departure-op', 'delete-op', 'event-op', 'period-op']);
    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
    expect(realtime.emitToUser.mock.calls[0][0]).toBe(LEAVER);
    expect(realtime.emitToUser.mock.calls[0][2]).toMatchObject({ reason: 'REMOVED' });
  });

  it('C62 §2.3.d: ayrılmada ve çıkarmada kullanıcı grup LiveKit odasından (oda = groupId) düşürülür; commit SONRASI', async () => {
    const { prisma, voice, service } = setup();
    prisma.channelMember.findUnique.mockImplementation(
      ({ where }: { where: { channelId_userId: { userId: string } } }) =>
        Promise.resolve({
          id: `cm-${where.channelId_userId.userId}`,
          isAdmin: false,
          createdAt: JOINED,
          clearedAt: null,
        }),
    );
    prisma.$transaction.mockImplementation(() => {
      expect(voice.evictFromRooms).not.toHaveBeenCalled();
      return Promise.resolve([]);
    });

    await service.leaveGroupDm(LEAVER, GROUP);
    expect(voice.evictFromRooms).toHaveBeenLastCalledWith(LEAVER, [GROUP]);

    voice.evictFromRooms.mockClear();
    await service.removeGroupMember(OWNER, GROUP, OTHER);
    expect(voice.evictFromRooms).toHaveBeenCalledTimes(1);
    expect(voice.evictFromRooms).toHaveBeenCalledWith(OTHER, [GROUP]);
  });

  it('C62 §2.3.d: üye olmayan ayrılamaz, düşürme çağrılmaz', async () => {
    const { prisma, voice, service } = setup();
    prisma.channelMember.findUnique.mockResolvedValue(null);
    await expect(service.leaveGroupDm('x', GROUP)).rejects.toBeDefined();
    expect(voice.evictFromRooms).not.toHaveBeenCalled();
  });

  it('üye olmayan ayrılamaz: departure yazılmaz, olay yok', async () => {
    const { prisma, realtime, service } = setup();
    prisma.channelMember.findUnique.mockResolvedValue(null);
    await expect(service.leaveGroupDm('x', GROUP)).rejects.toBeDefined();
    expect(prisma.groupDmDeparture.upsert).not.toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
});

describe('getDmChannels: eski grup (departed)', () => {
  const departure = {
    channelId: GROUP,
    userId: LEAVER,
    joinedAt: JOINED,
    leftAt: LEFT,
    reason: 'REMOVED',
    clearedAt: CLEARED,
    memberIds: [OWNER, OTHER],
  };
  const lastMsg = {
    id: 'm1',
    channelId: GROUP,
    content: 'son',
    replyToId: null,
    encrypted: false,
    createdAt: new Date('2026-11-09T10:00:00Z'),
    author: { id: OWNER, username: 'o', avatarUrl: null },
    attachments: [],
  };

  function listSetup() {
    const ctx = setup();
    ctx.prisma.groupDmDeparture.findMany.mockResolvedValue([departure]);
    ctx.prisma.channel.findMany.mockResolvedValue([GROUP_CHANNEL]);
    ctx.prisma.user.findMany.mockResolvedValue([
      { id: OWNER, username: 'o', avatarUrl: 'a.png', avatarAnimatedUrl: null },
      { id: OTHER, username: 'x', avatarUrl: null, avatarAnimatedUrl: null },
    ]);
    ctx.prisma.message.findFirst.mockResolvedValue(lastMsg);
    return ctx;
  }

  it('eski grup GROUP_DM öğesi olarak, departed ile döner; sözleşmedeki sabit alanlar', async () => {
    const { prisma, service } = listSetup();
    const list = await service.getDmChannels(LEAVER);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: GROUP,
      type: 'GROUP_DM',
      name: 'Grup',
      adminIds: [],
      unread: false,
      lastReaction: null,
      receiptsEnabled: false,
      groupAllReadAt: null,
      departed: { leftAt: LEFT.toISOString(), reason: 'REMOVED' },
    });
    expect((list[0].members as Array<{ id: string }>).map((m) => m.id)).toEqual([OWNER, OTHER]);
    expect(prisma.channel.findMany.mock.calls[0][0].where).toMatchObject({
      type: 'GROUP_DM',
      deletedAt: null,
    });
  });

  it('lastMessage sorgusu leftAt ÜSTÜNÜ ve clearedAt ALTINI kapatır + katılım öncesi şifreli süzgeci', async () => {
    const { prisma, service } = listSetup();
    await service.getDmChannels(LEAVER);

    expect(prisma.message.findFirst.mock.calls[0][0].where).toEqual({
      channelId: GROUP,
      deletedAt: null,
      createdAt: { lte: LEFT, gt: CLEARED },
      NOT: { encrypted: true, createdAt: { lt: JOINED } },
    });
  });

  it('lastMessage leftAt SONRASI düzenlendiyse gövdesiz + editedAfterLeave; öncesi düzenlendiyse normal', async () => {
    const { prisma, service } = listSetup();
    prisma.message.findFirst.mockResolvedValue({
      ...lastMsg,
      editedAt: new Date(LEFT.getTime() + 1000),
    });
    const [late] = await service.getDmChannels(LEAVER);
    expect(late.lastMessage).toMatchObject({ content: '', editedAfterLeave: true });

    prisma.message.findFirst.mockResolvedValue({
      ...lastMsg,
      editedAt: new Date(LEFT.getTime() - 1000),
    });
    const [early] = await service.getDmChannels(LEAVER);
    expect(early.lastMessage).toMatchObject({ content: 'son' });
    expect(early.lastMessage).not.toHaveProperty('editedAfterLeave');
  });

  it('silinmiş hesap (deletedAt dolu) members listesinde yok: kullanıcı sorgusu deletedAt:null ile', async () => {
    const { prisma, service } = listSetup();
    prisma.user.findMany.mockResolvedValue([
      { id: OWNER, username: 'o', avatarUrl: null, avatarAnimatedUrl: null },
    ]); // OTHER silinmiş: sorgu süzgeci eler
    const [row] = await service.getDmChannels(LEAVER);
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
    expect((row.members as Array<{ id: string }>).map((m) => m.id)).toEqual([OWNER]);
  });

  it('aktif grup öğesinde departed null; liste son mesaja göre tek sıralanır', async () => {
    const { prisma, service } = listSetup();
    const active = {
      userId: LEAVER,
      channelId: 'g-active',
      lastReadAt: null,
      clearedAt: null,
      lastReaction: null,
      createdAt: JOINED,
      channel: {
        id: 'g-active',
        type: 'GROUP_DM',
        deletedAt: null,
        name: 'Aktif',
        ownerId: OWNER,
        createdAt: new Date('2026-11-02T10:00:00Z'),
        dmRequestStatus: null,
        members: [],
        messages: [{ ...lastMsg, id: 'm2', createdAt: new Date('2026-11-11T10:00:00Z') }],
      },
    };
    prisma.channelMember.findMany.mockResolvedValue([active]);

    const list = await service.getDmChannels(LEAVER);
    expect(list.map((c) => [c.id, c.departed])).toEqual([
      ['g-active', null],
      [GROUP, { leftAt: LEFT.toISOString(), reason: 'REMOVED' }],
    ]);
  });

  it('kanal soft-delete ise eski üye listesinde görünmez', async () => {
    const { prisma, service } = listSetup();
    prisma.channel.findMany.mockResolvedValue([]); // deletedAt: null süzgeci kanalı eler
    expect(await service.getDmChannels(LEAVER)).toEqual([]);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('departure yoksa ek sorgu yok', async () => {
    const { prisma, service } = setup();
    expect(await service.getDmChannels(LEAVER)).toEqual([]);
    expect(prisma.channel.findMany).not.toHaveBeenCalled();
  });
});

describe('deleteDeparture (DELETE /dm/groups/:id/departure)', () => {
  it('yalnız çağıranın kendi satırını siler; olay yok', async () => {
    const { prisma, realtime, service } = setup();
    prisma.$transaction.mockResolvedValue([{ count: 1 }, { count: 2 }]);
    expect(await service.deleteDeparture(LEAVER, GROUP)).toBeNull();
    // C65: önceki dönem satırları departure ile AYNI tx'te silinir
    expect(prisma.$transaction).toHaveBeenCalledWith(['dep-del-op', 'period-del']);
    expect(prisma.groupDmPastPeriod.deleteMany).toHaveBeenCalledWith({
      where: { channelId: GROUP, userId: LEAVER },
    });
    expect(prisma.groupDmDeparture.deleteMany).toHaveBeenCalledWith({
      where: { channelId: GROUP, userId: LEAVER },
    });
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('satır yoksa 404 DEPARTURE_NOT_FOUND', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockResolvedValue([{ count: 0 }, { count: 0 }]);
    const err = await service.deleteDeparture(LEAVER, GROUP).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.getResponse()).toMatchObject({ error: 'DEPARTURE_NOT_FOUND' });
  });
});
