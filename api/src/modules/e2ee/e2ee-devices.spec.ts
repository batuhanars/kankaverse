import { Prisma } from '@prisma/client';
import { E2eeDevicesService } from './e2ee-devices.service';
import { toB64 } from './e2ee.util';

const KEY = new Uint8Array(32).fill(7);
const KEY_B64 = toB64(KEY);
const USER = { id: 'u1', username: 'a', sessionId: 's1', tokenFamily: 'fam-1' } as never;

function setup() {
  const prisma = {
    e2eeDevice: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    e2eeKeyPackage: {
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    channelMember: { findFirst: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const notify = { devicesChanged: jest.fn().mockResolvedValue(undefined) };
  return { prisma, notify, svc: new E2eeDevicesService(prisma as never, notify as never) };
}

describe('E2eeDevicesService.register (§2.3)', () => {
  it('yeni zincir → cihaz oluşur, tokenFamily JWT zincirinden gelir, devices-changed yayılır', async () => {
    const { prisma, notify, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.create.mockResolvedValue({ id: 'dev-1' });

    await expect(svc.register(USER, { platform: 'web', signatureKey: KEY_B64 })).resolves.toEqual({
      deviceId: 'dev-1',
    });
    expect(prisma.e2eeDevice.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      tokenFamily: 'fam-1',
      platform: 'web',
    });
    expect(notify.devicesChanged).toHaveBeenCalledWith('u1');
  });

  it('aynı zincir + aynı anahtar → mevcut cihaz (idempotent), yeni satır yok', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue({
      id: 'dev-1',
      revokedAt: null,
      signatureKey: KEY,
    });
    await expect(svc.register(USER, { platform: 'web', signatureKey: KEY_B64 })).resolves.toEqual({
      deviceId: 'dev-1',
    });
    expect(prisma.e2eeDevice.create).not.toHaveBeenCalled();
  });

  it('aynı zincir + farklı anahtar → 409 E2EE_DEVICE_KEY_MISMATCH', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue({
      id: 'dev-1',
      revokedAt: null,
      signatureKey: new Uint8Array(32).fill(9),
    });
    await expect(
      svc.register(USER, { platform: 'web', signatureKey: KEY_B64 }),
    ).rejects.toMatchObject({ status: 409, response: { error: 'E2EE_DEVICE_KEY_MISMATCH' } });
  });

  it('10 etkin cihaz varken → 422 E2EE_DEVICE_LIMIT', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.count.mockResolvedValue(10);
    await expect(
      svc.register(USER, { platform: 'android', signatureKey: KEY_B64 }),
    ).rejects.toMatchObject({ status: 422, response: { error: 'E2EE_DEVICE_LIMIT' } });
  });

  it('32 bayt olmayan imza anahtarı → 400', async () => {
    const { svc } = setup();
    await expect(
      svc.register(USER, { platform: 'web', signatureKey: toB64(new Uint8Array(5)) }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('eşzamanlı kayıt (P2002) → kazananı idempotent döndürür', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'dev-w', revokedAt: null, signatureKey: KEY });
    prisma.e2eeDevice.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(svc.register(USER, { platform: 'web', signatureKey: KEY_B64 })).resolves.toEqual({
      deviceId: 'dev-w',
    });
  });

  it('iptal edilmiş cihazla kayıt denemesi → 403 E2EE_DEVICE_REQUIRED', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue({
      id: 'dev-1',
      revokedAt: new Date(),
      signatureKey: KEY,
    });
    await expect(
      svc.register(USER, { platform: 'web', signatureKey: KEY_B64 }),
    ).rejects.toMatchObject({ status: 403, response: { error: 'E2EE_DEVICE_REQUIRED' } });
  });
});

describe('E2eeDevicesService.uploadKeyPackages', () => {
  const activeDevice = { id: 'dev-1', userId: 'u1', revokedAt: null };

  it('cihaz yoksa / iptalse 403 E2EE_DEVICE_REQUIRED', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue({ ...activeDevice, revokedAt: new Date() });
    await expect(svc.uploadKeyPackages(USER, { keyPackages: [KEY_B64] })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('bekleyen + yeni > 100 → 422 E2EE_KEY_PACKAGE_LIMIT', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue(activeDevice);
    prisma.e2eeKeyPackage.count.mockResolvedValue(95);
    await expect(
      svc.uploadKeyPackages(USER, { keyPackages: Array(6).fill(KEY_B64) }),
    ).rejects.toMatchObject({ status: 422, response: { error: 'E2EE_KEY_PACKAGE_LIMIT' } });
    expect(prisma.e2eeKeyPackage.createMany).not.toHaveBeenCalled();
  });

  it('lastResort eskisinin yerine geçer (önce sil, sonra yaz), tek transaction', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue(activeDevice);
    await svc.uploadKeyPackages(USER, { keyPackages: [KEY_B64], lastResort: KEY_B64 });
    expect(prisma.e2eeKeyPackage.deleteMany).toHaveBeenCalledWith({
      where: { deviceId: 'dev-1', lastResort: true },
    });
    expect(prisma.e2eeKeyPackage.create.mock.calls[0][0].data.lastResort).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('E2eeDevicesService.listUserDevices', () => {
  it('ortak DM yok → 403', async () => {
    const { prisma, svc } = setup();
    prisma.channelMember.findFirst.mockResolvedValue(null);
    await expect(svc.listUserDevices('u1', 'u2')).rejects.toMatchObject({ status: 403 });
    expect(prisma.e2eeDevice.findMany).not.toHaveBeenCalled();
  });

  it('kendi cihazları kapıya takılmaz; yalnız etkinler sorgulanır', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([
      { id: 'd1', platform: 'web', signatureKey: KEY, createdAt: new Date('2026-11-10') },
    ]);
    const res = await svc.listUserDevices('u1', 'u1');
    expect(prisma.channelMember.findFirst).not.toHaveBeenCalled();
    expect(prisma.e2eeDevice.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      revokedAt: null,
    });
    expect(res[0]).toMatchObject({ deviceId: 'd1', signatureKey: KEY_B64 });
  });
});
