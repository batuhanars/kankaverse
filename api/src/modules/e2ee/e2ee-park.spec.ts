/* eslint-disable @typescript-eslint/require-await -- bellekte sahte Prisma: async imza gerçek istemciyle aynı kalsın */
import { Prisma } from '@prisma/client';
import { generateKeyPairSync, sign } from 'node:crypto';
import { E2eeDevicesService } from './e2ee-devices.service';
import { E2eeParkedService } from './e2ee-parked.service';
import { E2eeRebindService } from './e2ee-rebind.service';
import { rebindMessage } from './e2ee-rebind.util';
import { E2EE_PARKED_RETENTION_DAYS, E2EE_REBIND_NONCE_TTL_MS } from './e2ee.constants';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';

/** C69 (R7): park cihaz, yeniden bağlama, Oturumlarım kaldırma, 30 gün işi. */

const DAY = 24 * 60 * 60 * 1000;

function newKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12); // SPKI öneki 12 bayt
  return { raw: new Uint8Array(raw), privateKey };
}

interface Dev {
  id: string;
  userId: string;
  tokenFamily: string | null;
  platform: string;
  signatureKey: Uint8Array;
  parkedAt: Date | null;
  revokedAt: Date | null;
  lastSeenAt: Date;
}

/** Bellekte küçük DB: yalnız bu servislerin kullandığı sorgu biçimleri. */
function setup() {
  const devices: Dev[] = [];
  const nonces: {
    id: string;
    userId: string;
    nonce: Uint8Array;
    expiresAt: Date;
    createdAt: Date;
  }[] = [];
  const audit: { action: string; entityId: string }[] = [];
  let seq = 0;

  const prisma: any = {
    e2eeRebindNonce: {
      create: async ({ data }: any) => {
        nonces.push({ id: `n${++seq}`, createdAt: new Date(seq), ...data });
      },
      deleteMany: async ({ where }: any) => {
        const hit = nonces.filter(
          (n) =>
            (!where.userId || n.userId === where.userId) &&
            (!where.id || n.id === where.id) &&
            (!where.expiresAt?.gt || n.expiresAt > where.expiresAt.gt) &&
            (!where.expiresAt?.lt || n.expiresAt < where.expiresAt.lt),
        );
        hit.forEach((n) => nonces.splice(nonces.indexOf(n), 1));
        return { count: hit.length };
      },
      findFirst: async ({ where }: any) =>
        [...nonces]
          .filter((n) => n.userId === where.userId && n.expiresAt > where.expiresAt.gt)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    },
    e2eeDevice: {
      findUnique: async ({ where }: any) =>
        devices.find((d) =>
          where.id
            ? d.id === where.id
            : d.tokenFamily !== null && d.tokenFamily === where.tokenFamily,
        ) ?? null,
      findFirst: async ({ where }: any) =>
        devices.find(
          (d) =>
            d.id === where.id && d.userId === where.userId && !d.revokedAt && d.parkedAt !== null,
        ) ?? null,
      findMany: async ({ where }: any) =>
        devices
          .filter((d) => {
            if (where.userId && d.userId !== where.userId) return false;
            if (where.revokedAt === null && d.revokedAt) return false;
            if (where.parkedAt?.not === null && d.parkedAt === null) return false;
            if (where.parkedAt?.lt && !(d.parkedAt && d.parkedAt < where.parkedAt.lt)) return false;
            return true;
          })
          .map((d) => ({ ...d })),
      updateMany: async ({ where, data }: any) => {
        const hit = devices.filter((d) => {
          if (where.id && typeof where.id === 'string' && d.id !== where.id) return false;
          if (where.id?.in && !where.id.in.includes(d.id)) return false;
          if (where.userId && d.userId !== where.userId) return false;
          if (where.revokedAt === null && d.revokedAt) return false;
          if (where.parkedAt?.not === null && d.parkedAt === null) return false;
          return true;
        });
        // tokenFamily @unique: bağlanacak zincir başka cihazda varsa P2002
        if (data.tokenFamily && devices.some((d) => d.tokenFamily === data.tokenFamily)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'x',
          });
        }
        hit.forEach((d) => Object.assign(d, data));
        return { count: hit.length };
      },
    },
    e2eeKeyPackage: { deleteMany: async () => ({ count: 0 }) },
    auditLog: {
      create: async ({ data }: any) => {
        audit.push(data);
      },
    },
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
  };
  const notify = { devicesChanged: jest.fn().mockResolvedValue(undefined) };

  const key = newKey();
  const addDevice = (over: Partial<Dev> = {}): Dev => {
    const d: Dev = {
      id: `dev${++seq}`,
      userId: 'u1',
      tokenFamily: null,
      platform: 'android',
      signatureKey: key.raw,
      parkedAt: new Date(Date.now() - DAY),
      revokedAt: null,
      lastSeenAt: new Date(Date.now() - DAY),
      ...over,
    };
    devices.push(d);
    return d;
  };

  return {
    prisma,
    devices,
    nonces,
    audit,
    notify,
    key,
    addDevice,
    rebind: new E2eeRebindService(prisma),
    parked: new E2eeParkedService(prisma, notify as never),
  };
}

const USER = (over = {}) =>
  ({ id: 'u1', username: 'a', sessionId: 's2', tokenFamily: 'fam-new', ...over }) as never;

function signFor(
  key: ReturnType<typeof newKey>,
  nonceB64: string,
  userId: string,
  deviceId: string,
): string {
  const msg = rebindMessage(new Uint8Array(Buffer.from(nonceB64, 'base64')), userId, deviceId);
  return sign(null, msg, key.privateKey).toString('base64');
}

describe('E2eeRebindService (C69, R7)', () => {
  it('doğru imza → park cihaz yeni zincire bağlanır, parkedAt temizlenir, audit yazılır', async () => {
    const s = setup();
    const dev = s.addDevice();
    const { nonce } = await s.rebind.challenge('u1');
    const res = await s.rebind.rebind(USER(), {
      deviceId: dev.id,
      signature: signFor(s.key, nonce, 'u1', dev.id),
    });
    expect(res).toEqual({ deviceId: dev.id });
    expect(dev.tokenFamily).toBe('fam-new');
    expect(dev.parkedAt).toBeNull();
    expect(dev.revokedAt).toBeNull();
    expect(s.audit).toEqual([
      expect.objectContaining({ action: 'e2ee.device.rebind', entityId: dev.id }),
    ]);
  });

  it('nonce tek kullanımlık: aynı imza ikinci kez reddedilir', async () => {
    const s = setup();
    const dev = s.addDevice();
    const { nonce } = await s.rebind.challenge('u1');
    const dto = { deviceId: dev.id, signature: signFor(s.key, nonce, 'u1', dev.id) };
    await s.rebind.rebind(USER(), dto);
    dev.tokenFamily = null;
    dev.parkedAt = new Date();
    await expect(s.rebind.rebind(USER({ tokenFamily: 'fam-3' }), dto)).rejects.toMatchObject({
      response: { error: 'E2EE_REBIND_NONCE_INVALID' },
    });
  });

  it('yanlış imza reddedilir VE nonce yanar (tek deneme)', async () => {
    const s = setup();
    const dev = s.addDevice();
    const other = newKey();
    const { nonce } = await s.rebind.challenge('u1');
    await expect(
      s.rebind.rebind(USER(), { deviceId: dev.id, signature: signFor(other, nonce, 'u1', dev.id) }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_REJECTED' } });
    expect(dev.tokenFamily).toBeNull();
    expect(s.nonces).toHaveLength(0);
    // doğru imza bile artık nonce olmadığı için geçmez
    await expect(
      s.rebind.rebind(USER(), { deviceId: dev.id, signature: signFor(s.key, nonce, 'u1', dev.id) }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_NONCE_INVALID' } });
  });

  it('başka kullanıcı için imzalanmış mesaj (userId farklı) geçmez', async () => {
    const s = setup();
    const dev = s.addDevice();
    const { nonce } = await s.rebind.challenge('u1');
    await expect(
      s.rebind.rebind(USER(), { deviceId: dev.id, signature: signFor(s.key, nonce, 'u2', dev.id) }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_REJECTED' } });
  });

  it('başka kullanıcının cihazı reddedilir', async () => {
    const s = setup();
    const dev = s.addDevice({ userId: 'u2' });
    const { nonce } = await s.rebind.challenge('u1');
    await expect(
      s.rebind.rebind(USER(), { deviceId: dev.id, signature: signFor(s.key, nonce, 'u1', dev.id) }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_REJECTED' } });
    expect(dev.tokenFamily).toBeNull();
  });

  it('iptal edilmiş cihaz reddedilir', async () => {
    const s = setup();
    const dev = s.addDevice({ revokedAt: new Date() });
    const { nonce } = await s.rebind.challenge('u1');
    await expect(
      s.rebind.rebind(USER(), { deviceId: dev.id, signature: signFor(s.key, nonce, 'u1', dev.id) }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_REJECTED' } });
  });

  it('park olmayan (zaten bağlı/aktif) cihaz reddedilir', async () => {
    const s = setup();
    const dev = s.addDevice({ parkedAt: null, tokenFamily: 'fam-old' });
    const { nonce } = await s.rebind.challenge('u1');
    await expect(
      s.rebind.rebind(USER(), { deviceId: dev.id, signature: signFor(s.key, nonce, 'u1', dev.id) }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_REJECTED' } });
    expect(dev.tokenFamily).toBe('fam-old');
  });

  it('olmayan cihaz kimliği reddedilir', async () => {
    const s = setup();
    const { nonce } = await s.rebind.challenge('u1');
    await expect(
      s.rebind.rebind(USER(), { deviceId: 'yok', signature: signFor(s.key, nonce, 'u1', 'yok') }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_REJECTED' } });
  });

  it('süresi geçmiş nonce reddedilir', async () => {
    const s = setup();
    const dev = s.addDevice();
    const { nonce } = await s.rebind.challenge('u1');
    s.nonces[0].expiresAt = new Date(Date.now() - 1);
    await expect(
      s.rebind.rebind(USER(), { deviceId: dev.id, signature: signFor(s.key, nonce, 'u1', dev.id) }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_NONCE_INVALID' } });
    expect(E2EE_REBIND_NONCE_TTL_MS).toBe(120_000);
  });

  it("başka kullanıcının nonce'u kullanılamaz; nonce yoksa reddedilir", async () => {
    const s = setup();
    const dev = s.addDevice();
    const { nonce } = await s.rebind.challenge('u2');
    await expect(
      s.rebind.rebind(USER(), { deviceId: dev.id, signature: signFor(s.key, nonce, 'u1', dev.id) }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_NONCE_INVALID' } });
  });

  it('çağıranın zincirinde zaten aktif cihaz varsa reddedilir', async () => {
    const s = setup();
    s.addDevice({ id: 'mevcut', tokenFamily: 'fam-new', parkedAt: null });
    const dev = s.addDevice();
    const { nonce } = await s.rebind.challenge('u1');
    await expect(
      s.rebind.rebind(USER(), { deviceId: dev.id, signature: signFor(s.key, nonce, 'u1', dev.id) }),
    ).rejects.toMatchObject({ response: { error: 'E2EE_REBIND_REJECTED' } });
    expect(dev.tokenFamily).toBeNull();
  });

  it('yeni challenge öncekini düşürür (kullanıcı başına tek bekleyen nonce)', async () => {
    const s = setup();
    await s.rebind.challenge('u1');
    await s.rebind.challenge('u1');
    expect(s.nonces).toHaveLength(1);
  });
});

describe('E2eeParkedService (C69)', () => {
  it('liste: yalnız çağıranın park cihazları (iptal edilmiş ve aktif olanlar yok)', async () => {
    const s = setup();
    const mine = s.addDevice();
    s.addDevice({ userId: 'u2' });
    s.addDevice({ revokedAt: new Date() });
    s.addDevice({ parkedAt: null, tokenFamily: 'aktif' });
    const list = await s.parked.list('u1');
    expect(list.map((d) => d.id)).toEqual([mine.id]);
    expect(Object.keys(list[0]).sort()).toEqual(['id', 'lastSeenAt', 'parkedAt', 'platform']);
  });

  it('kaldır: kendi park cihazını iptal eder + devices-changed + audit', async () => {
    const s = setup();
    const dev = s.addDevice();
    await expect(s.parked.revoke('u1', dev.id)).resolves.toBeNull();
    expect(dev.revokedAt).toBeInstanceOf(Date);
    expect(s.notify.devicesChanged).toHaveBeenCalledWith('u1');
    expect(s.audit[0].action).toBe('e2ee.device.revoke-parked');
  });

  it('kaldır: başkasının / aktif / iptal edilmiş cihaz 404', async () => {
    const s = setup();
    const theirs = s.addDevice({ userId: 'u2' });
    const active = s.addDevice({ parkedAt: null, tokenFamily: 'f' });
    const gone = s.addDevice({ revokedAt: new Date() });
    for (const d of [theirs, active, gone])
      await expect(s.parked.revoke('u1', d.id)).rejects.toMatchObject({
        response: { error: 'E2EE_PARKED_DEVICE_NOT_FOUND' },
      });
    expect(theirs.revokedAt).toBeNull();
    expect(active.revokedAt).toBeNull();
  });

  it(`30 gün işi: ${E2EE_PARKED_RETENTION_DAYS} günü aşan park iptal; taze park, aktif ve iptal dokunulmaz; süresi dolmuş nonce silinir`, async () => {
    const s = setup();
    const now = new Date();
    const stale = s.addDevice({
      parkedAt: new Date(now.getTime() - (E2EE_PARKED_RETENTION_DAYS + 1) * DAY),
    });
    const staleOther = s.addDevice({
      userId: 'u2',
      parkedAt: new Date(now.getTime() - 40 * DAY),
    });
    const fresh = s.addDevice({
      parkedAt: new Date(now.getTime() - (E2EE_PARKED_RETENTION_DAYS - 1) * DAY),
    });
    const active = s.addDevice({ parkedAt: null, tokenFamily: 'f' });
    s.nonces.push({
      id: 'old',
      userId: 'u1',
      nonce: new Uint8Array(32),
      expiresAt: new Date(now.getTime() - 1000),
      createdAt: now,
    });
    await expect(s.parked.sweep(now)).resolves.toEqual({ revoked: 2 });
    expect(stale.revokedAt).toBeInstanceOf(Date);
    expect(staleOther.revokedAt).toBeInstanceOf(Date);
    expect(fresh.revokedAt).toBeNull();
    expect(active.revokedAt).toBeNull();
    expect(s.notify.devicesChanged).toHaveBeenCalledWith('u1');
    expect(s.notify.devicesChanged).toHaveBeenCalledWith('u2');
    expect(s.nonces).toHaveLength(0);
  });
});

describe('Park cihaz /e2ee uçlarını çağıramaz (C69)', () => {
  it('park cihazın zinciri yok: aynı kullanıcının yeni oturumu cihaz bulamaz (E2EE_DEVICE_REQUIRED)', async () => {
    // requireActiveDevice tokenFamily ile arar; park cihazın tokenFamily'si NULL, hiçbir oturum zinciriyle eşleşmez.
    const s = setup();
    s.addDevice(); // park
    const svc = new E2eeDevicesService(s.prisma, s.notify as never);
    await expect(svc.available(USER({ tokenFamily: 'herhangi-zincir' }))).rejects.toMatchObject({
      response: { error: 'E2EE_DEVICE_REQUIRED' },
    });
  });

  it('guard: park cihaz tokenFamily null olduğundan zincir sorgusuna takılmaz (iptal sayılmaz, yetki de vermez)', async () => {
    const s = setup();
    s.addDevice();
    const guard = new E2eeEnabledGuard({ isEligible: () => true } as never, s.prisma);
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: USER({ tokenFamily: 'x' }) }) }),
    };
    await expect(guard.canActivate(ctx)).resolves.toBe(true); // uç yine cihaz ister (requireActiveDevice)
  });
});
