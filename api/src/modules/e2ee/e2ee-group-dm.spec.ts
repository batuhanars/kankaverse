import { ForbiddenException } from '@nestjs/common';
import { E2eeChannelService } from './e2ee-channel.service';
import { E2eeGroupsService } from './e2ee-groups.service';
import { toB64 } from './e2ee.util';

/** E2 §2.2/§2.3/§2.8: GROUP_DM için uygunluk, kurma ve durum. */
const USER = { id: 'u1', username: 'a', sessionId: 's', tokenFamily: 'fam-1' } as never;
const GID = toB64(new Uint8Array(32).fill(1));
const BLOB = toB64(new Uint8Array([9, 9]));

describe('E2eeChannelService (GROUP_DM kapısı, §2.2)', () => {
  function setup(type: string, eligible: (id: string) => boolean = () => true) {
    const prisma = {
      channelMember: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'u1', createdAt: new Date('2026-11-01') },
          { userId: 'u2', createdAt: new Date('2026-11-02') },
          { userId: 'u3', createdAt: new Date('2026-11-03') },
        ]),
      },
    };
    const membership = { requireChannelAccess: jest.fn().mockResolvedValue({ type }) };
    const flag = { isEligible: jest.fn(eligible) };
    const svc = new E2eeChannelService(prisma as never, membership as never, flag as never);
    return { svc, membership };
  }

  it('GROUP_DM şifrelenebilir tip: üye kimlikleri döner', async () => {
    const { svc } = setup('GROUP_DM');
    await expect(svc.requireDmMembers('u1', 'g1')).resolves.toEqual(['u1', 'u2', 'u3']);
  });

  it('ortam/başka tip kanal 422 E2EE_NOT_ELIGIBLE (1-1 davranışı değişmez)', async () => {
    const { svc } = setup('GUILD_TEXT');
    await expect(svc.requireDmMembers('u1', 'c1')).rejects.toMatchObject({ status: 422 });
  });

  it('access: kanal tipi + üye katılım zamanları (ChannelMember.createdAt)', async () => {
    const { svc } = setup('GROUP_DM');
    const res = await svc.access('u1', 'g1');
    expect(res).toMatchObject({ isOneToOneDm: false, isGroupDm: true });
    expect(res.joinedAt.get('u2')).toEqual(new Date('2026-11-02'));
  });

  it('izin listesi dışı üye varken 422; hepsi uygunken geçer', () => {
    const { svc } = setup('GROUP_DM', (id) => id !== 'u3');
    expect(() => svc.assertAllEligible(['u1', 'u2', 'u3'])).toThrow(
      expect.objectContaining({ status: 422 }),
    );
    expect(() => svc.assertAllEligible(['u1', 'u2'])).not.toThrow();
  });

  it('1-1: iki üyeli kanal bugünkü gibi; tek üyeli kanal reddedilir', () => {
    const { svc } = setup('DM');
    expect(() => svc.assertAllEligible(['u1', 'u2'])).not.toThrow();
    expect(() => svc.assertAllEligible(['u1'])).toThrow(expect.objectContaining({ status: 422 }));
  });

  it('eski üye (kanal üyesi değil): MembershipService 403, /e2ee/channels/:id/* çağıramaz', async () => {
    const { svc, membership } = setup('GROUP_DM');
    membership.requireChannelAccess.mockRejectedValue(new ForbiddenException('NOT_CHANNEL_MEMBER'));
    await expect(svc.requireDmMembers('ex', 'g1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.access('ex', 'g1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function setupGroups(members = ['u1', 'u2', 'u3'], flag = { identity: false }) {
  const tx = {
    e2eeGroup: { create: jest.fn() },
    e2eeHandshake: { create: jest.fn() },
    e2eeWelcome: { createMany: jest.fn() },
  };
  const prisma = {
    e2eeGroup: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    e2eeDevice: { findMany: jest.fn() },
    e2eeHandshake: { findMany: jest.fn() },
    e2eeFormerMember: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const channels = {
    requireDmMembers: jest.fn().mockResolvedValue(members),
    assertAllEligible: jest.fn(),
    access: jest.fn(),
  };
  const devices = { requireActiveDevice: jest.fn().mockResolvedValue({ id: 'dev-1' }) };
  const notify = { welcome: jest.fn(), commit: jest.fn() };
  const svc = new E2eeGroupsService(
    prisma as never,
    channels as never,
    devices as never,
    notify as never,
    flag as never,
  );
  return { prisma, tx, channels, devices, notify, svc };
}

describe('E2eeGroupsService.createGroup (GROUP_DM, E2 §0/§2.2)', () => {
  const dto = { groupId: GID, commit: BLOB, welcomes: [{ deviceId: 'dev-2', welcome: BLOB }] };

  it('3 üye, biri cihazsız: kurulur (cihazsız üyeye Welcome yok)', async () => {
    const { prisma, svc, notify } = setupGroups();
    prisma.e2eeDevice.findMany
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]) // u3 cihazsız
      .mockResolvedValueOnce([{ id: 'dev-2', userId: 'u2' }]);
    await expect(svc.createGroup(USER, 'g1', dto)).resolves.toEqual({ epoch: 1 });
    expect(notify.welcome).toHaveBeenCalledWith(['u2'], 'g1');
  });

  it('yalnız gönderenin etkin cihazı var: 422 E2EE_NOT_ELIGIBLE', async () => {
    const { prisma, svc } = setupGroups();
    prisma.e2eeDevice.findMany.mockResolvedValueOnce([{ userId: 'u1' }]);
    await expect(svc.createGroup(USER, 'g1', dto)).rejects.toMatchObject({
      status: 422,
      response: { error: 'E2EE_NOT_ELIGIBLE' },
    });
  });

  it('izin listesi dışı üye varken 422 (hiçbir şey yazılmaz)', async () => {
    const { prisma, tx, channels, svc } = setupGroups();
    channels.assertAllEligible.mockImplementation(() => {
      throw Object.assign(new Error('x'), { status: 422 });
    });
    await expect(svc.createGroup(USER, 'g1', dto)).rejects.toMatchObject({ status: 422 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.e2eeGroup.create).not.toHaveBeenCalled();
  });

  it('Welcome hedefi kanal üyesi olmayan (eski üye) cihaz: 400 E2EE_INVALID_PAYLOAD', async () => {
    const { prisma, svc } = setupGroups();
    prisma.e2eeDevice.findMany
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }])
      .mockResolvedValueOnce([]); // hedef cihaz memberIds filtresinden düştü
    await expect(svc.createGroup(USER, 'g1', dto)).rejects.toMatchObject({ status: 400 });
  });
});

describe('E2eeGroupsService.getState (GROUP_DM, §2.3)', () => {
  const dev = (id: string, userId: string, revokedAt: Date | null = null) => ({
    id,
    userId,
    signatureKey: new Uint8Array([1]),
    revokedAt,
  });

  it('formerMembers: eski üye + kayıtlı TÜM cihazları (iptal dahil); members[].joinedAt', async () => {
    const { prisma, channels, svc } = setupGroups();
    channels.access.mockResolvedValue({
      isOneToOneDm: false,
      isGroupDm: true,
      memberIds: ['u1', 'u2'],
      joinedAt: new Map([
        ['u1', new Date('2026-11-01')],
        ['u2', new Date('2026-11-05')],
      ]),
    });
    prisma.e2eeGroup.findUnique.mockResolvedValue({
      epoch: 7,
      groupId: new Uint8Array([1, 2]),
      createdAt: new Date('2026-11-02'),
    });
    prisma.e2eeFormerMember.findMany.mockResolvedValue([
      { userId: 'ex', leftAt: new Date('2026-11-04') },
    ]);
    prisma.e2eeDevice.findMany.mockResolvedValue([
      dev('d1', 'u1'),
      dev('x1', 'ex'),
      dev('x2', 'ex', new Date('2026-11-04')),
    ]);

    const state = await svc.getState('u1', 'g1');

    expect(prisma.e2eeDevice.findMany.mock.calls[0][0].where).toEqual({
      userId: { in: ['u1', 'u2', 'ex'] },
    });
    expect(state.members.map((m) => [m.userId, m.joinedAt])).toEqual([
      ['u1', '2026-11-01T00:00:00.000Z'],
      ['u2', '2026-11-05T00:00:00.000Z'],
    ]);
    expect(state.formerMembers).toHaveLength(1);
    expect(state.formerMembers[0]).toMatchObject({
      userId: 'ex',
      leftAt: '2026-11-04T00:00:00.000Z',
    });
    expect(state.formerMembers[0].devices.map((d) => d.deviceId)).toEqual(['x1', 'x2']);
    expect(state.formerMembers[0].devices[1].revokedAt).toBe('2026-11-04T00:00:00.000Z');
    // eski üyenin cihazı members altında görünmez
    expect(state.members.flatMap((m) => m.devices.map((d) => d.deviceId))).toEqual(['d1']);
  });

  it('1-1: formerMembers hep [] ve eski-üye tablosu sorgulanmaz', async () => {
    const { prisma, channels, svc } = setupGroups();
    channels.access.mockResolvedValue({
      isOneToOneDm: true,
      isGroupDm: false,
      memberIds: ['u1', 'u2'],
      joinedAt: new Map(),
    });
    prisma.e2eeGroup.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.findMany.mockResolvedValue([]);
    const state = await svc.getState('u1', 'dm1');
    expect(state.formerMembers).toEqual([]);
    expect(prisma.e2eeFormerMember.findMany).not.toHaveBeenCalled();
    expect(prisma.e2eeDevice.findMany.mock.calls[0][0].where).toEqual({
      userId: { in: ['u1', 'u2'] },
    });
  });
});
