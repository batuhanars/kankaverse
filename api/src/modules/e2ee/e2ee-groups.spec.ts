import { Prisma } from '@prisma/client';
import { E2eeGroupsService } from './e2ee-groups.service';
import { toB64 } from './e2ee.util';

const USER = { id: 'u1', username: 'a', sessionId: 's', tokenFamily: 'fam-1' } as never;
const GID = toB64(new Uint8Array(32).fill(1));
const BLOB = toB64(new Uint8Array([9, 9]));

function setup(flag = { identity: false }) {
  const tx = {
    e2eeGroup: { create: jest.fn(), updateMany: jest.fn() },
    e2eeHandshake: { create: jest.fn() },
    e2eeWelcome: { createMany: jest.fn() },
  };
  const prisma = {
    e2eeGroup: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    e2eeDevice: { findMany: jest.fn() },
    e2eeIdentity: { findMany: jest.fn().mockResolvedValue([]) },
    e2eeHandshake: { findMany: jest.fn() },
    e2eeWelcome: { findMany: jest.fn(), updateMany: jest.fn() },
    channel: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const channels = {
    requireDmMembers: jest.fn().mockResolvedValue(['u1', 'u2']),
    assertAllEligible: jest.fn(),
    access: jest.fn().mockResolvedValue({ isOneToOneDm: true, memberIds: ['u1', 'u2'] }),
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

describe('E2eeGroupsService.createGroup (§2.4)', () => {
  function ready(prisma: ReturnType<typeof setup>['prisma']) {
    // assertEveryMemberHasDevice (2 kullanıcı) + resolveWelcomeTargets (1 hedef)
    prisma.e2eeDevice.findMany
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }])
      .mockResolvedValueOnce([{ id: 'dev-2', userId: 'u2' }]);
  }
  const dto = { groupId: GID, commit: BLOB, welcomes: [{ deviceId: 'dev-2', welcome: BLOB }] };

  it('grup + epoch 0 handshake + welcome TEK transaction; epoch 1; hedefe e2ee:welcome', async () => {
    const { prisma, tx, notify, svc } = setup();
    ready(prisma);
    await expect(svc.createGroup(USER, 'ch', dto)).resolves.toEqual({ epoch: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.e2eeGroup.create.mock.calls[0][0].data).toMatchObject({
      channelId: 'ch',
      epoch: 1,
      createdById: 'dev-1',
    });
    expect(tx.e2eeHandshake.create.mock.calls[0][0].data).toMatchObject({ epoch: 0 });
    expect(tx.e2eeWelcome.createMany.mock.calls[0][0].data[0]).toMatchObject({
      targetDeviceId: 'dev-2',
      epoch: 1,
    });
    expect(notify.welcome).toHaveBeenCalledWith(['u2'], 'ch');
  });

  it('grup zaten varsa 409 E2EE_GROUP_EXISTS (ön kontrol)', async () => {
    const { prisma, svc } = setup();
    ready(prisma);
    prisma.e2eeGroup.count.mockResolvedValue(1);
    await expect(svc.createGroup(USER, 'ch', dto)).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_GROUP_EXISTS' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('eşzamanlı kurma yarışı: ikincisinin INSERT i P2002 → 409 E2EE_GROUP_EXISTS, Welcome yayını yok', async () => {
    const { prisma, tx, notify, svc } = setup();
    ready(prisma);
    tx.e2eeGroup.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(svc.createGroup(USER, 'ch', dto)).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_GROUP_EXISTS' },
    });
    expect(notify.welcome).not.toHaveBeenCalled();
  });

  it('uygun olmayan kanal 422 (kapı) ve 32 bayt olmayan groupId 400', async () => {
    const { channels, prisma, svc } = setup();
    channels.assertAllEligible.mockImplementation(() => {
      throw new Error('NOT_ELIGIBLE');
    });
    await expect(svc.createGroup(USER, 'ch', dto)).rejects.toThrow('NOT_ELIGIBLE');
    channels.assertAllEligible.mockReset();
    ready(prisma);
    await expect(
      svc.createGroup(USER, 'ch', { ...dto, groupId: toB64(new Uint8Array(3)) }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('karşı üyenin etkin cihazı yoksa 422 E2EE_NOT_ELIGIBLE', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValueOnce([{ userId: 'u1' }]);
    await expect(svc.createGroup(USER, 'ch', dto)).rejects.toMatchObject({
      status: 422,
      response: { error: 'E2EE_NOT_ELIGIBLE' },
    });
  });

  it('Welcome hedefi kanal üyesinin etkin cihazı değilse / tekrarlıysa / gönderenin kendisiyse 400', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findMany
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }])
      .mockResolvedValueOnce([]); // hedef bulunamadı (iptal ya da üye dışı)
    await expect(svc.createGroup(USER, 'ch', dto)).rejects.toMatchObject({ status: 400 });
    prisma.e2eeDevice.findMany
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }])
      .mockResolvedValueOnce([{ id: 'dev-1', userId: 'u1' }]);
    await expect(
      svc.createGroup(USER, 'ch', { ...dto, welcomes: [{ deviceId: 'dev-1', welcome: BLOB }] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('E2eeGroupsService.postCommit — epoch kapısı (R7)', () => {
  const body = { epoch: 3, commit: BLOB };

  it('epoch eşleşir → koşullu UPDATE (where epoch=3, increment) + handshake(3) + welcome(4), commit olayı', async () => {
    const { prisma, tx, notify, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([]);
    tx.e2eeGroup.updateMany.mockResolvedValue({ count: 1 });
    await expect(svc.postCommit(USER, 'ch', body)).resolves.toEqual({ epoch: 4 });
    expect(tx.e2eeGroup.updateMany).toHaveBeenCalledWith({
      where: { channelId: 'ch', epoch: 3 },
      data: { epoch: { increment: 1 } },
    });
    expect(tx.e2eeHandshake.create.mock.calls[0][0].data).toMatchObject({
      epoch: 3,
      senderDeviceId: 'dev-1',
    });
    expect(notify.commit).toHaveBeenCalledWith('ch', 3);
  });

  it('epoch eşleşmez (0 satır) → 409 E2EE_EPOCH_CONFLICT + currentEpoch; handshake/welcome/yayın YOK', async () => {
    const { prisma, tx, notify, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([]);
    tx.e2eeGroup.updateMany.mockResolvedValue({ count: 0 });
    prisma.e2eeGroup.findUnique.mockResolvedValue({ epoch: 5 });
    await expect(svc.postCommit(USER, 'ch', body)).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_EPOCH_CONFLICT', currentEpoch: 5 },
    });
    expect(tx.e2eeHandshake.create).not.toHaveBeenCalled();
    expect(tx.e2eeWelcome.createMany).not.toHaveBeenCalled();
    expect(notify.commit).not.toHaveBeenCalled();
  });

  it('grup yoksa 404 E2EE_GROUP_NOT_FOUND', async () => {
    const { prisma, tx, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([]);
    tx.e2eeGroup.updateMany.mockResolvedValue({ count: 0 });
    prisma.e2eeGroup.findUnique.mockResolvedValue(null);
    await expect(svc.postCommit(USER, 'ch', body)).rejects.toMatchObject({
      status: 404,
      response: { error: 'E2EE_GROUP_NOT_FOUND' },
    });
  });

  it('cihazı olmayan/iptal edilmiş çağıran commit gönderemez (403)', async () => {
    const { devices, svc } = setup();
    devices.requireActiveDevice.mockRejectedValue(new Error('E2EE_DEVICE_REQUIRED'));
    await expect(svc.postCommit(USER, 'ch', body)).rejects.toThrow('E2EE_DEVICE_REQUIRED');
  });
});

describe('E2eeGroupsService okuma uçları', () => {
  it('getState: şifresizse encrypted:false/epoch:null; üyelerin İPTAL EDİLMİŞ cihazları da gelir (Rev.1)', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.findMany.mockResolvedValue([
      { id: 'd1', userId: 'u1', signatureKey: new Uint8Array([1]), revokedAt: null },
      {
        id: 'd2',
        userId: 'u1',
        signatureKey: new Uint8Array([2]),
        revokedAt: new Date('2026-11-01'),
      },
    ]);
    const state = await svc.getState('u1', 'ch');
    expect(state).toMatchObject({ encrypted: false, epoch: null, groupId: null });
    expect(prisma.e2eeDevice.findMany.mock.calls[0][0].where).toEqual({
      userId: { in: ['u1', 'u2'] },
    });
    expect(state.members[0].devices).toHaveLength(2);
    expect(state.members[0].devices[1].revokedAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('getState şifreliyse epoch/groupId/createdAt döner', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue({
      epoch: 4,
      groupId: new Uint8Array([1, 2]),
      createdAt: new Date('2026-11-10'),
    });
    prisma.e2eeDevice.findMany.mockResolvedValue([]);
    await expect(svc.getState('u1', 'ch')).resolves.toMatchObject({
      encrypted: true,
      epoch: 4,
      groupId: toB64(new Uint8Array([1, 2])),
    });
  });

  it('E7: bayrak kapalıyken kimlik okunmaz, üye kimliği ve imza alanları null', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.findMany.mockResolvedValue([
      {
        id: 'd1',
        userId: 'u1',
        signatureKey: new Uint8Array([1]),
        revokedAt: null,
        identitySig: new Uint8Array(64),
        identityVersion: 1,
      },
    ]);
    const state = await svc.getState('u1', 'ch');
    expect(prisma.e2eeIdentity.findMany).not.toHaveBeenCalled();
    expect(state.members[0].identity).toBeNull();
    expect(state.members[0].devices[0]).toMatchObject({ identitySig: null, identityVersion: null });
  });

  it('E7: bayrak açıkken üyelerin kimliği ve cihaz imzaları döner; kimliksiz üye null', async () => {
    const { prisma, svc } = setup({ identity: true });
    const PUB = new Uint8Array(32).fill(5);
    const SIG = new Uint8Array(64).fill(6);
    prisma.e2eeGroup.findUnique.mockResolvedValue(null);
    prisma.e2eeIdentity.findMany.mockResolvedValue([{ userId: 'u2', publicKey: PUB, version: 3 }]);
    prisma.e2eeDevice.findMany.mockResolvedValue([
      {
        id: 'd2',
        userId: 'u2',
        signatureKey: new Uint8Array([2]),
        revokedAt: null,
        identitySig: SIG,
        identityVersion: 3,
      },
    ]);
    const state = await svc.getState('u1', 'ch');
    expect(prisma.e2eeIdentity.findMany.mock.calls[0][0].where).toEqual({
      userId: { in: ['u1', 'u2'] },
    });
    expect(state.members[0].identity).toBeNull();
    expect(state.members[1].identity).toEqual({ publicKey: toB64(PUB), version: 3 });
    expect(state.members[1].devices[0]).toMatchObject({
      identitySig: toB64(SIG),
      identityVersion: 3,
    });
  });

  it('listCommits since dahil, epoch sırasıyla, en çok 100', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeHandshake.findMany.mockResolvedValue([
      {
        epoch: 2,
        commit: new Uint8Array([1]),
        senderDeviceId: 'd1',
        createdAt: new Date('2026-11-13T10:00:00.000Z'),
      },
    ]);
    const res = await svc.listCommits('u1', 'ch', 2);
    expect(prisma.e2eeHandshake.findMany).toHaveBeenCalledWith({
      where: { channelId: 'ch', epoch: { gte: 2 } },
      orderBy: { epoch: 'asc' },
      take: 100,
    });
    expect(res).toEqual([
      {
        epoch: 2,
        commit: toB64(new Uint8Array([1])),
        senderDeviceId: 'd1',
        createdAt: '2026-11-13T10:00:00.000Z',
      },
    ]);
  });

  it('welcome listesi yalnız çağıran cihazın bekleyenleri; ack başkasının welcome unu kabul etmez (404)', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeWelcome.findMany.mockResolvedValue([]);
    await svc.listWelcomes(USER);
    expect(prisma.e2eeWelcome.findMany.mock.calls[0][0].where).toEqual({
      targetDeviceId: 'dev-1',
      deliveredAt: null,
    });
    prisma.e2eeWelcome.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.ackWelcome(USER, 'w9')).rejects.toMatchObject({ status: 404 });
    expect(prisma.e2eeWelcome.updateMany.mock.calls[0][0].where).toEqual({
      id: 'w9',
      targetDeviceId: 'dev-1',
      deliveredAt: null,
    });
  });

  it('C77 §1: silinmiş kanalın Welcome u listede dönmez; silinmemiş kanalınki etkilenmez', async () => {
    const { prisma, svc } = setup();
    const w = (id: string, channelId: string) => ({
      id,
      channelId,
      epoch: 1,
      welcome: new Uint8Array([7]),
    });
    prisma.e2eeWelcome.findMany.mockResolvedValue([
      w('w1', 'ch-deleted'),
      w('w2', 'ch-live'),
      w('w3', 'ch-deleted'),
    ]);
    // DB süzgeci deletedAt: null ile yalnız canlı kanalı döndürür
    prisma.channel.findMany.mockResolvedValue([{ id: 'ch-live' }]);

    const res = await svc.listWelcomes(USER);

    expect(prisma.channel.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['ch-deleted', 'ch-live'] }, deletedAt: null },
      select: { id: true },
    });
    expect(res).toEqual([
      { id: 'w2', channelId: 'ch-live', epoch: 1, welcome: toB64(new Uint8Array([7])) },
    ]);
  });

  it('C77 §1: bekleyen Welcome yoksa kanal sorgusu yapılmaz', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeWelcome.findMany.mockResolvedValue([]);
    await expect(svc.listWelcomes(USER)).resolves.toEqual([]);
    expect(prisma.channel.findMany).not.toHaveBeenCalled();
  });
});
