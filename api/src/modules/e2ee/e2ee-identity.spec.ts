import { generateKeyPairSync, sign } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { deviceSigMessage, verifyDeviceSig } from './e2ee-identity.util';
import { E2eeIdentityService } from './e2ee-identity.service';
import { fromB64, toB64 } from './e2ee.util';

// AuthService'in bağımlılık ağacı (otp kütüphanesi) ESM; yedek testindeki gibi boş sınıfla değiştirilir.
jest.mock('../auth/auth.service', () => ({ AuthService: class {} }));

/** Gerçek Ed25519 anahtarı; ham 32 baytlık açık anahtar SPKI DER'in son 32 baytıdır. */
function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = new Uint8Array(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  return { raw, privateKey };
}

const SIG_KEY = new Uint8Array(32).fill(9);

function signFor(
  kp: ReturnType<typeof keyPair>,
  userId: string,
  version: number,
  deviceId: string,
) {
  return toB64(sign(null, deviceSigMessage(userId, version, deviceId, SIG_KEY), kp.privateKey));
}

function setup() {
  const prisma = {
    e2eeIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    e2eeDevice: {
      findFirst: jest.fn().mockResolvedValue({ id: 'd1', signatureKey: SIG_KEY }),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    e2eeBackup: {
      findUnique: jest.fn().mockResolvedValue({ keyVersion: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
    $transaction: jest.fn(),
  };
  // Transaction istemcisi = aynı sahte; geri alma davranışı servis hatası fırlatınca çağıranın sorumluluğu.
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const auth = { verifyReauth: jest.fn().mockResolvedValue(undefined) };
  const notify = { devicesChanged: jest.fn().mockResolvedValue(undefined) };
  const svc = new E2eeIdentityService(prisma as never, auth as never, notify as never);
  return { prisma, auth, notify, svc };
}

describe('e2ee-identity.util', () => {
  it('e2ee-core ile aynı baytı imzalar (sabit vektör: shared/e2ee-core signDevice)', () => {
    // Vektör e2ee-core `signDevice` ile üretildi: özel anahtar 1..32, sürüm 2, imza anahtarı 200..169.
    const pub = fromB64('ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=');
    const sk = fromB64('yMfGxcTDwsHAv769vLu6ubi3trW0s7KxsK+urayrqqk=');
    const sig = fromB64(
      'zymHWBNyG+3kxUEdV4kMypBtbtP8PoZWKlb3Sk5G/t/Sc3OTXgCh6hMtsT1ajVsO1IOI6IVbQuCdrtDC32uODw==',
    );
    expect(verifyDeviceSig(pub, 'cmuser0001', 2, 'cmdev0001', sk, sig)).toBe(true);
    // Tek alan değişince geçmez: sürüm, kullanıcı, cihaz.
    expect(verifyDeviceSig(pub, 'cmuser0001', 1, 'cmdev0001', sk, sig)).toBe(false);
    expect(verifyDeviceSig(pub, 'cmuser0002', 2, 'cmdev0001', sk, sig)).toBe(false);
    expect(verifyDeviceSig(pub, 'cmuser0001', 2, 'cmdev0002', sk, sig)).toBe(false);
  });

  it('bozuk anahtar ya da imza fırlatmadan false döner', () => {
    expect(verifyDeviceSig(new Uint8Array(5), 'u', 1, 'd', SIG_KEY, new Uint8Array(64))).toBe(
      false,
    );
  });
});

describe('E2eeIdentityService.create', () => {
  it('kimliği sürüm 1 ile yazar, kendi cihazını imzalar, cihazları değişti olayını yayar', async () => {
    const { prisma, notify, svc } = setup();
    const kp = keyPair();
    await expect(
      svc.create('u1', {
        publicKey: toB64(kp.raw),
        signatures: [{ deviceId: 'd1', sig: signFor(kp, 'u1', 1, 'd1') }],
      }),
    ).resolves.toEqual({ version: 1 });
    expect(prisma.e2eeIdentity.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      version: 1,
    });
    // Yalnız çağıranın kendi, iptal edilmemiş cihazı aranır.
    expect(prisma.e2eeDevice.findFirst.mock.calls[0][0].where).toEqual({
      id: 'd1',
      userId: 'u1',
      revokedAt: null,
    });
    expect(prisma.e2eeDevice.update.mock.calls[0][0].data.identityVersion).toBe(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('e2ee.identity.create');
    expect(notify.devicesChanged).toHaveBeenCalledWith('u1');
  });

  it('kimlik varsa 409 E2EE_IDENTITY_EXISTS, hiçbir şey yazılmaz', async () => {
    const { prisma, notify, svc } = setup();
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ userId: 'u1' });
    await expect(
      svc.create('u1', { publicKey: toB64(keyPair().raw), signatures: [] }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_IDENTITY_EXISTS' },
    });
    expect(prisma.e2eeIdentity.create).not.toHaveBeenCalled();
    expect(notify.devicesChanged).not.toHaveBeenCalled();
  });

  it('eşzamanlı iki cihaz: birincil anahtar çakışması (P2002) aynı 409 olur', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeIdentity.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(
      svc.create('u1', { publicKey: toB64(keyPair().raw), signatures: [] }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_IDENTITY_EXISTS' },
    });
  });

  it('başkasının ya da iptal edilmiş cihaz: 403, imza yazılmaz', async () => {
    const { prisma, svc } = setup();
    const kp = keyPair();
    prisma.e2eeDevice.findFirst.mockResolvedValue(null);
    await expect(
      svc.create('u1', {
        publicKey: toB64(kp.raw),
        signatures: [{ deviceId: 'dX', sig: signFor(kp, 'u1', 1, 'dX') }],
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.e2eeDevice.update).not.toHaveBeenCalled();
  });

  it('başka anahtarla atılmış imza: 400 E2EE_IDENTITY_SIG_INVALID', async () => {
    const { prisma, svc } = setup();
    const kp = keyPair();
    const other = keyPair();
    await expect(
      svc.create('u1', {
        publicKey: toB64(kp.raw),
        signatures: [{ deviceId: 'd1', sig: signFor(other, 'u1', 1, 'd1') }],
      }),
    ).rejects.toMatchObject({ status: 400, response: { error: 'E2EE_IDENTITY_SIG_INVALID' } });
    expect(prisma.e2eeDevice.update).not.toHaveBeenCalled();
  });
});

describe('E2eeIdentityService.reset', () => {
  const reauth = { currentPassword: 'x' };

  it('reauth ister; sürüm +1, tüm imzalar ve yedekteki kimlik silinir, yeni imza yeni sürümle', async () => {
    const { prisma, auth, notify, svc } = setup();
    const kp = keyPair();
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ version: 3 });
    await expect(
      svc.reset('u1', {
        ...reauth,
        publicKey: toB64(kp.raw),
        signatures: [{ deviceId: 'd1', sig: signFor(kp, 'u1', 4, 'd1') }],
      }),
    ).resolves.toEqual({ version: 4 });
    expect(auth.verifyReauth).toHaveBeenCalled();
    expect(prisma.e2eeIdentity.updateMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'u1', version: 3 },
      data: { version: 4 },
    });
    expect(prisma.e2eeDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { identitySig: null, identityVersion: null },
    });
    expect(prisma.e2eeBackup.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { wrappedIdentity: null, identityVersion: null },
    });
    // Silme imza yazımından ÖNCE: yeni imza silinmez.
    expect(prisma.e2eeDevice.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.e2eeDevice.update.mock.invocationCallOrder[0],
    );
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('e2ee.identity.reset');
    expect(notify.devicesChanged).toHaveBeenCalledWith('u1');
  });

  it('eski sürümle atılmış imza sıfırlamada geçmez (400)', async () => {
    const { prisma, svc } = setup();
    const kp = keyPair();
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ version: 3 });
    await expect(
      svc.reset('u1', {
        ...reauth,
        publicKey: toB64(kp.raw),
        signatures: [{ deviceId: 'd1', sig: signFor(kp, 'u1', 3, 'd1') }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('reauth başarısızsa hiçbir şey değişmez', async () => {
    const { prisma, auth, svc } = setup();
    auth.verifyReauth.mockRejectedValue(Object.assign(new Error('x'), { status: 401 }));
    await expect(
      svc.reset('u1', { ...reauth, publicKey: toB64(keyPair().raw), signatures: [] }),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('kimlik yoksa 404; eşzamanlı sıfırlamayı kaybeden 409', async () => {
    const { prisma, svc } = setup();
    await expect(
      svc.reset('u1', { ...reauth, publicKey: toB64(keyPair().raw), signatures: [] }),
    ).rejects.toMatchObject({
      status: 404,
    });
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ version: 3 });
    prisma.e2eeIdentity.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      svc.reset('u1', { ...reauth, publicKey: toB64(keyPair().raw), signatures: [] }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_IDENTITY_VERSION' },
    });
  });
});

describe('E2eeIdentityService.signDevice', () => {
  it('güncel sürümle geçerli imza yazılır', async () => {
    const { prisma, notify, svc } = setup();
    const kp = keyPair();
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ publicKey: kp.raw, version: 2 });
    await svc.signDevice('u1', 'd1', { identityVersion: 2, sig: signFor(kp, 'u1', 2, 'd1') });
    expect(prisma.e2eeDevice.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'd1' },
      data: { identityVersion: 2 },
    });
    expect(notify.devicesChanged).toHaveBeenCalledWith('u1');
  });

  it('sürüm eşleşmezse 409; kimlik yoksa 404', async () => {
    const { prisma, svc } = setup();
    const kp = keyPair();
    await expect(
      svc.signDevice('u1', 'd1', { identityVersion: 1, sig: signFor(kp, 'u1', 1, 'd1') }),
    ).rejects.toMatchObject({
      status: 404,
    });
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ publicKey: kp.raw, version: 2 });
    await expect(
      svc.signDevice('u1', 'd1', { identityVersion: 1, sig: signFor(kp, 'u1', 1, 'd1') }),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.e2eeDevice.update).not.toHaveBeenCalled();
  });
});

describe('E2eeIdentityService.putBackupIdentity', () => {
  const dto = { wrappedIdentity: toB64(new Uint8Array(60)), identityVersion: 1, keyVersion: 2 };

  it('sürümler güncelse sarılı kimlik yazılır (yazım sürüm koşullu)', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ version: 1 });
    await expect(svc.putBackupIdentity('u1', dto)).resolves.toBeNull();
    expect(prisma.e2eeBackup.updateMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'u1', keyVersion: 2 },
      data: { identityVersion: 1 },
    });
  });

  it('yedek yok 404; yedek sürümü 409; kimlik yok 404; kimlik sürümü 409; arada sıfırlandı 409', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeBackup.findUnique.mockResolvedValueOnce(null);
    await expect(svc.putBackupIdentity('u1', dto)).rejects.toMatchObject({
      status: 404,
      response: { error: 'E2EE_BACKUP_NOT_CONFIGURED' },
    });
    await expect(svc.putBackupIdentity('u1', { ...dto, keyVersion: 1 })).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_BACKUP_KEY_VERSION' },
    });
    await expect(svc.putBackupIdentity('u1', dto)).rejects.toMatchObject({
      status: 404,
      response: { error: 'E2EE_IDENTITY_NOT_FOUND' },
    });
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ version: 2 });
    await expect(svc.putBackupIdentity('u1', dto)).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_IDENTITY_VERSION' },
    });
    prisma.e2eeIdentity.findUnique.mockResolvedValue({ version: 1 });
    prisma.e2eeBackup.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.putBackupIdentity('u1', dto)).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_BACKUP_KEY_VERSION' },
    });
  });
});
