import { randomBytes } from 'node:crypto';
import { E2eeTransferService, transferCommitOf } from './e2ee-transfer.service';
import { E2EE_TRANSFER_MAX_BYTES, E2EE_TRANSFER_TTL_MS } from './e2ee.constants';
import { toB64 } from './e2ee.util';

// E5b §3.4. Rol oturumdan çözülür: tokenFamily → cihaz. N = yeni (dev-n), O = eski (dev-o).
const USER = 'u1';
const N = { id: USER, tokenFamily: 'fam-n' };
const O = { id: USER, tokenFamily: 'fam-o' };
const OTHER = { id: 'u2', tokenFamily: 'fam-x' };

const devices: Record<string, { id: string; userId: string; revokedAt: Date | null }> = {
  'fam-n': { id: 'dev-n', userId: USER, revokedAt: null },
  'fam-o': { id: 'dev-o', userId: USER, revokedAt: null },
  'fam-x': { id: 'dev-x', userId: 'u2', revokedAt: null },
  'fam-r': { id: 'dev-r', userId: USER, revokedAt: new Date() },
};

const pub = randomBytes(32);
const nonce = randomBytes(32);
const commit = transferCommitOf(pub, nonce);

function row(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    userId: USER,
    newDeviceId: 'dev-n',
    oldDeviceId: null as string | null,
    commit,
    newPub: null as Uint8Array | null,
    newNonce: null as Uint8Array | null,
    oldPub: null as Uint8Array | null,
    objectKey: null as string | null,
    size: null as number | null,
    sha256: null as string | null,
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + E2EE_TRANSFER_TTL_MS),
    ...over,
  };
}

function setup() {
  const prisma = {
    e2eeDevice: {
      findUnique: jest.fn(({ where }: { where: { tokenFamily?: string; id?: string } }) => {
        if (where.tokenFamily) return Promise.resolve(devices[where.tokenFamily] ?? null);
        return Promise.resolve({ platform: 'web', tokenFamily: 'fam-n', createdAt: new Date() });
      }),
    },
    session: { findFirst: jest.fn().mockResolvedValue({ device: 'Chrome, Windows' }) },
    e2eeTransfer: {
      create: jest.fn().mockResolvedValue(row()),
      findFirst: jest.fn().mockResolvedValue(row()),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
  const storage = {
    presignPut: jest.fn().mockResolvedValue('https://put'),
    presignGet: jest.fn().mockResolvedValue('https://get'),
    headSize: jest.fn().mockResolvedValue(100),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = { emitToUser: jest.fn() };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const svc = new E2eeTransferService(
    prisma as never,
    storage as never,
    realtime as never,
    notifications as never,
  );
  return { prisma, storage, realtime, notifications, svc };
}

const status = (p: Promise<unknown>) =>
  p.then(() => 200).catch((e: { getStatus?: () => number }) => e.getStatus?.());

describe('E2eeTransferService (E5b §3)', () => {
  it('create: cihaz oturumdan, açık eski istek iptal edilir ve nesnesi silinir, diğer cihazlara olay gider', async () => {
    const { prisma, storage, realtime, svc } = setup();
    prisma.e2eeTransfer.findMany.mockResolvedValueOnce([
      { id: 'eski', objectKey: 'e2ee-transfer/u1/eski' },
    ]);
    const r = await svc.create(N, { commit: toB64(commit) });
    expect(r.id).toBe('t1');
    expect(prisma.e2eeTransfer.create.mock.calls[0][0].data).toMatchObject({
      userId: USER,
      newDeviceId: 'dev-n',
    });
    expect(prisma.e2eeTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['eski'] } },
      data: { status: 'CANCELLED' },
    });
    expect(storage.delete).toHaveBeenCalledWith('e2ee-transfer/u1/eski');
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      USER,
      'e2ee:transfer-requested',
      expect.objectContaining({
        id: 't1',
        newDevice: expect.objectContaining({ name: 'Chrome, Windows' }),
      }),
    );
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'e2ee.transfer.request',
    });
  });

  it('cihazı olmayan ya da iptal edilmiş oturum 403', async () => {
    const { svc } = setup();
    expect(
      await status(svc.create({ id: USER, tokenFamily: 'yok' }, { commit: toB64(commit) })),
    ).toBe(403);
    expect(
      await status(svc.create({ id: USER, tokenFamily: 'fam-r' }, { commit: toB64(commit) })),
    ).toBe(403);
  });

  it('pending: kendi açtığı istek gösterilmez (sorgu koşulu), süresi geçmiş gösterilmez', async () => {
    const { prisma, svc } = setup();
    await svc.pending(O);
    expect(prisma.e2eeTransfer.findFirst.mock.calls[0][0].where).toMatchObject({
      userId: USER,
      status: 'PENDING',
      newDeviceId: { not: 'dev-o' },
      expiresAt: { gt: expect.any(Date) },
    });
  });

  it('başkasının isteği 404 (varlık sızdırılmaz)', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeTransfer.findFirst.mockResolvedValue(null);
    expect(await status(svc.accept(OTHER, 't1', { pub: toB64(pub) }))).toBe(404);
    expect(prisma.e2eeTransfer.findFirst.mock.calls[0][0].where).toEqual({
      id: 't1',
      userId: 'u2',
    });
  });

  it('accept: N kendi isteğini kabul edemez (403); O kabul eder, koşullu geçiş PENDING → ACCEPTED', async () => {
    const { prisma, realtime, svc } = setup();
    expect(await status(svc.accept(N, 't1', { pub: toB64(pub) }))).toBe(403);
    await svc.accept(O, 't1', { pub: toB64(pub) });
    const call = prisma.e2eeTransfer.updateMany.mock.calls.at(-1)[0];
    expect(call.where).toMatchObject({ id: 't1', userId: USER, status: 'PENDING' });
    expect(call.data).toMatchObject({ status: 'ACCEPTED', oldDeviceId: 'dev-o' });
    expect(realtime.emitToUser).toHaveBeenCalledWith(USER, 'e2ee:transfer-accepted', { id: 't1' });
  });

  it('yasak geçiş 409: durum tutmazsa koşullu güncelleme 0 satır', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeTransfer.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await status(svc.accept(O, 't1', { pub: toB64(pub) }))).toBe(409);
  });

  it('süresi geçmiş istek her adımda 410', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeTransfer.findFirst.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1) }));
    expect(await status(svc.accept(O, 't1', { pub: toB64(pub) }))).toBe(410);
    prisma.e2eeTransfer.findFirst.mockResolvedValue(row({ status: 'EXPIRED' }));
    expect(await status(svc.blob(N, 't1'))).toBe(410);
  });

  it('reveal: yalnız N; taahhüt tutmazsa 400; tutarsa ACCEPTED → REVEALED', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeTransfer.findFirst.mockResolvedValue(
      row({ status: 'ACCEPTED', oldDeviceId: 'dev-o' }),
    );
    expect(await status(svc.reveal(O, 't1', { pub: toB64(pub), nonce: toB64(nonce) }))).toBe(403);
    expect(
      await status(svc.reveal(N, 't1', { pub: toB64(randomBytes(32)), nonce: toB64(nonce) })),
    ).toBe(400);
    await svc.reveal(N, 't1', { pub: toB64(pub), nonce: toB64(nonce) });
    const call = prisma.e2eeTransfer.updateMany.mock.calls.at(-1)[0];
    expect(call.where).toMatchObject({ status: 'ACCEPTED' });
    expect(call.data).toMatchObject({ status: 'REVEALED' });
  });

  it('get: N karşı tarafın anahtarını, O taahhüt + açılışı görür; üçüncü cihaz 403', async () => {
    const { prisma, svc } = setup();
    const opub = randomBytes(32);
    prisma.e2eeTransfer.findFirst.mockResolvedValue(
      row({ status: 'REVEALED', oldDeviceId: 'dev-o', oldPub: opub, newPub: pub, newNonce: nonce }),
    );
    const atN = await svc.get(N, 't1');
    expect(atN).toMatchObject({ oldPub: toB64(opub) });
    expect(atN).not.toHaveProperty('newPub');
    const atO = await svc.get(O, 't1');
    expect(atO).toMatchObject({ commit: toB64(commit), newPub: toB64(pub), nonce: toB64(nonce) });
    devices['fam-3'] = { id: 'dev-3', userId: USER, revokedAt: null };
    expect(await status(svc.get({ id: USER, tokenFamily: 'fam-3' }, 't1'))).toBe(403);
  });

  it('upload/commit: yalnız O ve REVEALED; 25 MB üstü 413; boyut tutmazsa 400; tutarsa UPLOADED', async () => {
    const { prisma, storage, realtime, svc } = setup();
    prisma.e2eeTransfer.findFirst.mockResolvedValue(
      row({ status: 'REVEALED', oldDeviceId: 'dev-o' }),
    );
    const body = { size: 100, sha256: 'a'.repeat(64) };
    expect(await status(svc.upload(N, 't1', body))).toBe(403);
    expect(await status(svc.upload(O, 't1', { ...body, size: E2EE_TRANSFER_MAX_BYTES + 1 }))).toBe(
      413,
    );
    await svc.upload(O, 't1', body);
    expect(storage.presignPut).toHaveBeenCalledWith(
      'e2ee-transfer/u1/t1',
      'application/octet-stream',
      {
        contentLength: 100,
        expiresIn: 300,
      },
    );
    storage.headSize.mockResolvedValueOnce(99);
    expect(await status(svc.commit(O, 't1', body))).toBe(400);
    await svc.commit(O, 't1', body);
    expect(prisma.e2eeTransfer.updateMany.mock.calls.at(-1)[0].data).toMatchObject({
      status: 'UPLOADED',
      objectKey: 'e2ee-transfer/u1/t1',
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(USER, 'e2ee:transfer-ready', { id: 't1' });
  });

  it('blob: yalnız N ve UPLOADED', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeTransfer.findFirst.mockResolvedValue(
      row({ status: 'REVEALED', oldDeviceId: 'dev-o' }),
    );
    expect(await status(svc.blob(N, 't1'))).toBe(409);
    prisma.e2eeTransfer.findFirst.mockResolvedValue(
      row({
        status: 'UPLOADED',
        oldDeviceId: 'dev-o',
        objectKey: 'e2ee-transfer/u1/t1',
        size: 100,
      }),
    );
    expect(await status(svc.blob(O, 't1'))).toBe(403);
    await expect(svc.blob(N, 't1')).resolves.toMatchObject({ url: 'https://get', size: 100 });
  });

  it('done: UPLOADED → DONE, nesne silinir, tüm cihazlara kapanış olayı + güvenlik bildirimi (cihaz adıyla)', async () => {
    const { prisma, storage, realtime, notifications, svc } = setup();
    prisma.e2eeTransfer.findFirst.mockResolvedValue(
      row({ status: 'UPLOADED', oldDeviceId: 'dev-o', objectKey: 'e2ee-transfer/u1/t1' }),
    );
    expect(await status(svc.done(O, 't1'))).toBe(403);
    await svc.done(N, 't1');
    expect(prisma.e2eeTransfer.updateMany.mock.calls.at(-1)[0]).toMatchObject({
      where: { status: 'UPLOADED' },
      data: { status: 'DONE' },
    });
    expect(storage.delete).toHaveBeenCalledWith('e2ee-transfer/u1/t1');
    expect(realtime.emitToUser).toHaveBeenCalledWith(USER, 'e2ee:transfer-closed', {
      id: 't1',
      status: 'DONE',
    });
    expect(notifications.create).toHaveBeenCalledWith(USER, {
      type: 'E2EE_TRANSFER',
      preview: 'Chrome, Windows',
    });
  });

  it('cancel: bekleyen isteği diğer cihaz reddedebilir; kabul edilmişi yalnız taraflar; bitmiş istek 409', async () => {
    const { prisma, svc } = setup();
    await svc.cancel(O, 't1'); // PENDING, O henüz taraf değil: "Ben değilim"
    expect(prisma.auditLog.create.mock.calls.at(-1)[0].data).toMatchObject({
      action: 'e2ee.transfer.cancel',
    });
    prisma.e2eeTransfer.findFirst.mockResolvedValue(
      row({ status: 'ACCEPTED', oldDeviceId: 'dev-o' }),
    );
    devices['fam-4'] = { id: 'dev-4', userId: USER, revokedAt: null };
    expect(await status(svc.cancel({ id: USER, tokenFamily: 'fam-4' }, 't1'))).toBe(403);
    prisma.e2eeTransfer.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await status(svc.cancel(N, 't1'))).toBe(409);
  });

  it('sweep: süresi geçen açık istek EXPIRED + nesne silinir + olay; eski bitmiş satırlar silinir', async () => {
    const { prisma, storage, realtime, svc } = setup();
    prisma.e2eeTransfer.findMany.mockResolvedValueOnce([
      { id: 't9', userId: USER, objectKey: 'e2ee-transfer/u1/t9' },
    ]);
    prisma.e2eeTransfer.deleteMany.mockResolvedValueOnce({ count: 2 });
    const now = new Date();
    await expect(svc.sweep(now)).resolves.toEqual({ expired: 1, deleted: 2 });
    expect(prisma.e2eeTransfer.updateMany.mock.calls[0][0]).toMatchObject({
      data: { status: 'EXPIRED' },
    });
    expect(storage.delete).toHaveBeenCalledWith('e2ee-transfer/u1/t9');
    expect(realtime.emitToUser).toHaveBeenCalledWith(USER, 'e2ee:transfer-closed', {
      id: 't9',
      status: 'EXPIRED',
    });
    expect(prisma.e2eeTransfer.deleteMany.mock.calls[0][0].where.status).toEqual({
      in: ['DONE', 'CANCELLED', 'EXPIRED'],
    });
  });

  it('transferCommitOf: e2ee-core transferCommit ile aynı sabit vektör (çekirdekte hesaplandı)', () => {
    const a = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const b = Uint8Array.from({ length: 32 }, (_, i) => (101 + i) & 0xff);
    expect(Buffer.from(transferCommitOf(a, b)).toString('hex')).toBe(
      '80de65b3946efaa4b2065a9a97711305c2c391ff27b16c86c33bd3ba122e64c2',
    );
  });

  it('transferCommitOf: farklı girdi farklı taahhüt', () => {
    expect(transferCommitOf(pub, nonce)).toHaveLength(32);
    expect(
      Buffer.from(transferCommitOf(pub, nonce)).equals(Buffer.from(transferCommitOf(nonce, pub))),
    ).toBe(false);
  });
});
