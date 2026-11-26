import { Prisma } from '@prisma/client';
import { E2eeDevicesService } from './e2ee-devices.service';
import { toB64 } from './e2ee.util';

const KEY = new Uint8Array(32).fill(7);
const KEY_B64 = toB64(KEY);
const USER = { id: 'u1', username: 'a', sessionId: 's1', tokenFamily: 'fam-1' } as never;

function setup(flag = { identity: false }) {
  const prisma = {
    e2eeIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    e2eeDevice: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    session: {
      findUnique: jest.fn().mockResolvedValue({ device: 'Android - Test Model' }),
      groupBy: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
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
  return {
    prisma,
    notify,
    svc: new E2eeDevicesService(prisma as never, notify as never, flag as never),
  };
}

describe('E2eeDevicesService.register (§2.3)', () => {
  it('yeni zincir → cihaz oluşur, tokenFamily JWT zincirinden gelir, devices-changed YAYILMAZ (§6.5)', async () => {
    const { prisma, notify, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.create.mockResolvedValue({ id: 'dev-1' });

    await expect(svc.register(USER, { platform: 'web', signatureKey: KEY_B64 })).resolves.toEqual({
      deviceId: 'dev-1',
      evicted: null,
    });
    expect(prisma.e2eeDevice.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      tokenFamily: 'fam-1',
      platform: 'web',
    });
    expect(notify.devicesChanged).not.toHaveBeenCalled();
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
      evicted: null,
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
    prisma.e2eeDevice.findMany.mockResolvedValue([]);
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
      evicted: null,
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

describe('C79 §2.1 — sınır dolunca boştaki cihazı çıkarma (R7)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(Date.now() - days * DAY);
  /** 10 etkin cihaz; `over` ile bazılarının etkinliği değiştirilir. */
  function rows(
    over: Record<string, { lastSeenAt?: Date; parkedAt?: Date | null; fam?: string | null }>,
  ) {
    return Array.from({ length: 10 }, (_, i) => {
      const id = `d${i}`;
      const o = over[id] ?? {};
      return {
        id,
        tokenFamily: o.fam === undefined ? `f${i}` : o.fam,
        platform: 'android',
        label: `Model ${i}`,
        lastSeenAt: o.lastSeenAt ?? ago(1),
        parkedAt: o.parkedAt ?? null,
      };
    });
  }

  it('7 günden eski adaylardan EN ESKİSİ çıkarılır: ailesinin oturumları kapanır, paketleri silinir, audit yazılır', async () => {
    const { prisma, notify, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.count.mockResolvedValue(10);
    prisma.e2eeDevice.findMany.mockResolvedValue(
      rows({ d3: { lastSeenAt: ago(8) }, d7: { lastSeenAt: ago(20) } }),
    );
    prisma.session.groupBy.mockResolvedValue([
      { tokenFamily: 'f3', _max: { lastActiveAt: ago(9) } },
      { tokenFamily: 'f7', _max: { lastActiveAt: ago(21) } },
    ]);
    prisma.e2eeDevice.create.mockResolvedValue({ id: 'yeni' });

    const res = await svc.register(USER, { platform: 'android', signatureKey: KEY_B64 });

    expect(res).toMatchObject({
      deviceId: 'yeni',
      evicted: { platform: 'android', label: 'Model 7' },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', tokenFamily: 'f7', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.e2eeKeyPackage.deleteMany).toHaveBeenCalledWith({
      where: { device: { id: 'd7', userId: 'u1' } },
    });
    expect(prisma.e2eeDevice.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'd7',
      userId: 'u1',
    });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'e2ee.device.evict',
      entityId: 'd7',
    });
    expect(prisma.e2eeDevice.create.mock.calls[0][0].data.label).toBe('Android - Test Model');
    expect(notify.devicesChanged).toHaveBeenCalledWith('u1');
  });

  it('cihaz açılmasa da oturumu son 7 günde yenilenmişse aday DEĞİL → 422, hiçbir şey değişmez', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.count.mockResolvedValue(10);
    prisma.e2eeDevice.findMany.mockResolvedValue(rows({ d2: { lastSeenAt: ago(30) } }));
    prisma.session.groupBy.mockResolvedValue([
      { tokenFamily: 'f2', _max: { lastActiveAt: ago(1) } },
    ]);

    await expect(
      svc.register(USER, { platform: 'android', signatureKey: KEY_B64 }),
    ).rejects.toMatchObject({ status: 422, response: { error: 'E2EE_DEVICE_LIMIT' } });
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
    expect(prisma.e2eeDevice.updateMany).not.toHaveBeenCalled();
    expect(prisma.e2eeDevice.create).not.toHaveBeenCalled();
  });

  it('park cihazın etkinliği parkedAt: 10 gün önce park edilen çıkarılır, oturum kapatma işlemi yok', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.count.mockResolvedValue(10);
    prisma.e2eeDevice.findMany.mockResolvedValue(
      rows({ d5: { fam: null, lastSeenAt: ago(12), parkedAt: ago(10) } }),
    );
    prisma.e2eeDevice.create.mockResolvedValue({ id: 'yeni' });

    const res = await svc.register(USER, { platform: 'web', signatureKey: KEY_B64 });
    expect(res.evicted).toMatchObject({ label: 'Model 5' });
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('sınır dolu değilken çıkarma denenmez', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findUnique.mockResolvedValue(null);
    prisma.e2eeDevice.count.mockResolvedValue(9);
    prisma.e2eeDevice.create.mockResolvedValue({ id: 'yeni' });
    await svc.register(USER, { platform: 'web', signatureKey: KEY_B64 });
    expect(prisma.e2eeDevice.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('C79 §2.2 — etiket ve son kullanım yalnız sahibine (gizlilik)', () => {
  const dev = {
    id: 'd1',
    platform: 'android',
    label: 'Android - Test Model',
    signatureKey: KEY,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    parkedAt: null,
    tokenFamily: 'f1',
    identitySig: null,
    identityVersion: null,
  };

  it('kendi listemde label + activityAt var', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([dev]);
    const out = await svc.listUserDevices('u1', 'u1');
    expect(out.devices[0]).toMatchObject({
      label: 'Android - Test Model',
      activityAt: expect.any(String),
    });
  });

  it('başkasının listesinde label ve activityAt HİÇ yok', async () => {
    const { prisma, svc } = setup();
    prisma.channelMember.findFirst.mockResolvedValue({ id: 'm' });
    prisma.e2eeDevice.findMany.mockResolvedValue([dev]);
    const out = await svc.listUserDevices('u2', 'u1');
    expect(out.devices[0]).not.toHaveProperty('label');
    expect(out.devices[0]).not.toHaveProperty('activityAt');
    expect(prisma.session.groupBy).not.toHaveBeenCalled();
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

  // §6.5: count çağrıları: (1) bekleyen sayısı, (2) claim edilebilir paket var mı
  function withCounts(
    prisma: ReturnType<typeof setup>['prisma'],
    pending: number,
    claimable: number,
  ) {
    prisma.e2eeDevice.findUnique.mockResolvedValue(activeDevice);
    prisma.e2eeKeyPackage.count.mockImplementation(({ where }: { where: { OR?: unknown } }) =>
      Promise.resolve(where.OR ? claimable : pending),
    );
  }

  it('ilk yükleme (paket yok) devices-changed yayar, bir kez', async () => {
    const { prisma, notify, svc } = setup();
    withCounts(prisma, 0, 0);
    await svc.uploadKeyPackages(USER, { keyPackages: [KEY_B64] });
    expect(notify.devicesChanged).toHaveBeenCalledTimes(1);
    expect(notify.devicesChanged).toHaveBeenCalledWith('u1');
  });

  it('stoku olan cihazın ek yüklemesi yaymaz', async () => {
    const { prisma, notify, svc } = setup();
    withCounts(prisma, 5, 5);
    await svc.uploadKeyPackages(USER, { keyPackages: [KEY_B64] });
    expect(notify.devicesChanged).not.toHaveBeenCalled();
  });

  it('yalnız son çare paketi olan cihazın yüklemesi yaymaz', async () => {
    const { prisma, notify, svc } = setup();
    withCounts(prisma, 0, 1);
    await svc.uploadKeyPackages(USER, { keyPackages: [KEY_B64] });
    expect(notify.devicesChanged).not.toHaveBeenCalled();
  });

  it('tükenmiş cihazın (tüketilmemiş 0, son çare yok) yeniden yüklemesi yayar', async () => {
    const { prisma, notify, svc } = setup();
    withCounts(prisma, 0, 0);
    await svc.uploadKeyPackages(USER, { keyPackages: [KEY_B64], lastResort: KEY_B64 });
    expect(notify.devicesChanged).toHaveBeenCalledTimes(1);
  });

  it('yükleme hata verirse yayın yapılmaz', async () => {
    const { prisma, notify, svc } = setup();
    withCounts(prisma, 0, 0);
    prisma.$transaction.mockRejectedValueOnce(new Error('db'));
    await expect(svc.uploadKeyPackages(USER, { keyPackages: [KEY_B64] })).rejects.toThrow('db');
    expect(notify.devicesChanged).not.toHaveBeenCalled();
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
    // E7 Rev.1: yanıt nesne; bayrak kapalıyken kimlik okunmaz, imza alanları null.
    expect(res.identity).toBeNull();
    expect(prisma.e2eeIdentity.findUnique).not.toHaveBeenCalled();
    expect(res.devices[0]).toMatchObject({
      deviceId: 'd1',
      signatureKey: KEY_B64,
      identitySig: null,
      identityVersion: null,
    });
  });

  it('E7: bayrak açıkken kimlik ve cihaz imzası döner; imzasız cihazda alanlar null', async () => {
    const { prisma, svc } = setup({ identity: true });
    const SIG = new Uint8Array(64).fill(3);
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ publicKey: KEY, version: 2 });
    prisma.e2eeDevice.findMany.mockResolvedValue([
      {
        id: 'd1',
        platform: 'web',
        signatureKey: KEY,
        createdAt: new Date(),
        identitySig: SIG,
        identityVersion: 2,
      },
      {
        id: 'd2',
        platform: 'android',
        signatureKey: KEY,
        createdAt: new Date(),
        identitySig: null,
        identityVersion: null,
      },
    ]);
    const res = await svc.listUserDevices('u1', 'u1');
    expect(res.identity).toEqual({ publicKey: KEY_B64, version: 2 });
    expect(res.devices[0]).toMatchObject({ identitySig: toB64(SIG), identityVersion: 2 });
    expect(res.devices[1]).toMatchObject({ identitySig: null, identityVersion: null });
  });
});
