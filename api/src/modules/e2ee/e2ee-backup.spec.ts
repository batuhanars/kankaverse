/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- bellek içi sahte Prisma */
import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutBackupKeyDto, SnapshotRefDto } from './dto/e2ee-backup.dto';
import { E2eeBackupEnabledGuard } from './e2ee-backup-enabled.guard';
import { E2eeBackupService } from './e2ee-backup.service';

// AuthService yalnız DI belirteci; otplib (ESM) yüklemesini atlamak için modül sahteleştirilir.
jest.mock('../auth/auth.service', () => ({ AuthService: class {} }));

// ── Bellek içi sahte Prisma (yalnız bu servisin kullandığı yüzey) ───────────
interface Backup {
  userId: string;
  keyVersion: number;
  salt: Uint8Array;
  params: unknown;
  wrappedKey: Uint8Array;
}
interface Snap {
  id: string;
  userId: string;
  deviceId: string;
  keyVersion: number;
  objectKey: string;
  size: number;
  sha256: string;
  updatedAt: Date;
}

let clock = 0;
function makeFake() {
  const st = {
    backups: new Map<string, Backup>(),
    snaps: [] as Snap[],
    devices: [] as { id: string; userId: string; revokedAt: Date | null }[],
    audit: [] as { action: string; metadata: unknown; actorId: string }[],
    users: new Map<string, unknown>([['u1', { id: 'u1' }]]),
  };
  const snapKey = (w: { userId_deviceId: { userId: string; deviceId: string } }) =>
    w.userId_deviceId;
  const fake: any = {
    e2eeBackup: {
      findUnique: async ({ where }: any) => st.backups.get(where.userId) ?? null,
      create: async ({ data }: any) => {
        if (st.backups.has(data.userId)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        st.backups.set(data.userId, data);
      },
      updateMany: async ({ where, data }: any) => {
        const b = st.backups.get(where.userId);
        if (!b || b.keyVersion !== where.keyVersion) return { count: 0 };
        Object.assign(b, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }: any) => ({ count: st.backups.delete(where.userId) ? 1 : 0 }),
    },
    e2eeBackupSnapshot: {
      findMany: async ({ where, orderBy, select }: any) => {
        let r = st.snaps.filter((s) => s.userId === where.userId).map((s) => ({ ...s }));
        if (orderBy) r = [...r].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        if (orderBy?.updatedAt === 'desc') r.reverse();
        // Gerçek Prisma `select` yalnız istenen alanları döner (ör. get() sızdırmamalı).
        return select
          ? r.map((x) => Object.fromEntries(Object.keys(select).map((k) => [k, (x as any)[k]])))
          : r;
      },
      findUnique: async ({ where }: any) => {
        const k = snapKey(where);
        const f = st.snaps.find((s) => s.userId === k.userId && s.deviceId === k.deviceId);
        return f ? { ...f } : null; // kopya: gerçek DB satırı sonraki yazmadan etkilenmez
      },
      upsert: async ({ where, create, update }: any) => {
        const k = snapKey(where);
        const cur = st.snaps.find((s) => s.userId === k.userId && s.deviceId === k.deviceId);
        if (cur) return Object.assign(cur, update, { updatedAt: new Date(++clock) });
        const row = { id: `s${++clock}`, updatedAt: new Date(++clock), ...create };
        st.snaps.push(row);
        return row;
      },
      deleteMany: async ({ where }: any) => {
        const before = st.snaps.length;
        st.snaps = st.snaps.filter((s) =>
          where.id ? !where.id.in.includes(s.id) : s.userId !== where.userId,
        );
        return { count: before - st.snaps.length };
      },
    },
    e2eeDevice: {
      findFirst: async ({ where }: any) =>
        st.devices.find((d) => d.id === where.id && d.userId === where.userId && !d.revokedAt) ??
        null,
    },
    user: { findUnique: async ({ where }: any) => st.users.get(where.id) ?? null },
    auditLog: { create: async ({ data }: any) => void st.audit.push(data) },
    $transaction: async (fn: any) => {
      // Gerçek transaction geri almayı taklit et: hata olursa durum eski haline döner.
      const snapB = new Map([...st.backups].map(([k, v]) => [k, { ...v }]));
      const snapS = st.snaps.map((s) => ({ ...s }));
      const snapA = [...st.audit];
      try {
        return await fn(fake);
      } catch (e) {
        st.backups = snapB;
        st.snaps = snapS;
        st.audit = snapA;
        throw e;
      }
    },
  };
  return { st, fake };
}

const SALT = Buffer.alloc(16, 1).toString('base64');
const WRAPPED = Buffer.alloc(60, 2).toString('base64');
const OK_PARAMS = { m: 65536, t: 4, p: 1 };
const SHA = (n: number) => String(n).padStart(64, '0');

function setup() {
  const { st, fake } = makeFake();
  const objects = new Map<string, number>();
  const storage = {
    presignPut: jest.fn(async (key: string) => `https://s3.example/put/${key}?sig=x`),
    presignGet: jest.fn(async (key: string) => `https://s3.example/get/${key}?sig=x`),
    headSize: jest.fn(async (key: string) => {
      const n = objects.get(key);
      if (n === undefined) throw new Error('NotFound');
      return n;
    }),
    delete: jest.fn(async (key: string) => void objects.delete(key)),
  };
  const auth = { verifyReauth: jest.fn(async () => undefined) };
  const svc = new E2eeBackupService(fake as never, storage as never, auth as never);
  st.devices.push(
    { id: 'd1', userId: 'u1', revokedAt: null },
    { id: 'd2', userId: 'u1', revokedAt: null },
    { id: 'dRev', userId: 'u1', revokedAt: new Date() },
    { id: 'dOther', userId: 'u2', revokedAt: null },
  );
  const material = { salt: SALT, params: OK_PARAMS, wrappedKey: WRAPPED };
  const reauth = { currentPassword: 'pw' };
  const ref = (deviceId: string, n = 1, size = 100, keyVersion = 1) => ({
    deviceId,
    size,
    sha256: SHA(n),
    keyVersion,
  });
  /** İstemci akışı: presign + (nesneyi yükle) + commit. */
  const upload = async (deviceId: string, n: number, keyVersion = 1, userId = 'u1') => {
    const dto = ref(deviceId, n, 100, keyVersion);
    await svc.presign(userId, dto);
    objects.set(`e2ee-backup/${userId}/${deviceId}/${dto.sha256}`, 100);
    return svc.commit(userId, dto);
  };
  return { st, svc, storage, auth, objects, material, reauth, ref, upload };
}

describe('E2eeBackupService: kurulum / değişim (§3.2 PUT key)', () => {
  it('kayıt yokken keyVersion=1 ile kurulur; configure audit (içerik yok)', async () => {
    const t = setup();
    await expect(t.svc.putKey('u1', { ...t.material, keyVersion: 1 })).resolves.toEqual({
      keyVersion: 1,
    });
    expect(t.st.backups.get('u1')?.keyVersion).toBe(1);
    expect(t.st.audit).toEqual([
      {
        actorId: 'u1',
        action: 'e2ee.backup.configure',
        entityType: 'E2eeBackup',
        entityId: 'u1',
        metadata: { keyVersion: 1 },
      },
    ]);
  });

  it('kayıt yokken keyVersion≠1 → 409 E2EE_BACKUP_KEY_VERSION', async () => {
    const t = setup();
    await expect(t.svc.putKey('u1', { ...t.material, keyVersion: 2 })).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_BACKUP_KEY_VERSION' },
    });
  });

  it('şifre değişimi: aynı keyVersion yeniden sarar, rekey audit; farklı sürüm 409', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    const newWrapped = Buffer.alloc(60, 9).toString('base64');
    await t.svc.putKey('u1', { ...t.material, wrappedKey: newWrapped, keyVersion: 1 });
    expect(Buffer.from(t.st.backups.get('u1')!.wrappedKey).toString('base64')).toBe(newWrapped);
    expect(t.st.audit.map((a) => a.action)).toEqual(['e2ee.backup.configure', 'e2ee.backup.rekey']);
    await expect(t.svc.putKey('u1', { ...t.material, keyVersion: 2 })).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_BACKUP_KEY_VERSION' },
    });
    expect(t.st.backups.get('u1')?.keyVersion).toBe(1);
  });

  it('parametre tabanı altı → 400 E2EE_BACKUP_WEAK_PARAMS (m, t, p ayrı ayrı)', async () => {
    const t = setup();
    for (const params of [
      { m: 19455, t: 4, p: 1 },
      { m: 65536, t: 1, p: 1 },
      { m: 65536, t: 4, p: 0 },
    ]) {
      await expect(
        t.svc.putKey('u1', { ...t.material, params, keyVersion: 1 }),
      ).rejects.toMatchObject({
        status: 400,
        response: { error: 'E2EE_BACKUP_WEAK_PARAMS' },
      });
    }
    expect(t.st.backups.size).toBe(0);
  });

  it('taban sınırı (19456, 2, 1) kabul; üst sınır aşımı ve p≠1 reddedilir', async () => {
    const t = setup();
    await expect(
      t.svc.putKey('u1', { ...t.material, params: { m: 19456, t: 2, p: 1 }, keyVersion: 1 }),
    ).resolves.toBeDefined();
    for (const params of [
      { m: 1_048_577, t: 4, p: 1 },
      { m: 65536, t: 17, p: 1 },
      { m: 65536, t: 4, p: 2 },
    ]) {
      await expect(
        t.svc.putKey('u1', { ...t.material, params, keyVersion: 1 }),
      ).rejects.toMatchObject({
        status: 400,
      });
    }
  });

  it('GET: kurulu değilse configured=false; kuruluysa tuz/params/wrappedKey/keyVersion + görüntüler', async () => {
    const t = setup();
    await expect(t.svc.get('u1')).resolves.toEqual({ configured: false, snapshots: [] });
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.upload('d1', 1);
    const r: any = await t.svc.get('u1');
    expect(r).toMatchObject({
      configured: true,
      salt: SALT,
      wrappedKey: WRAPPED,
      keyVersion: 1,
      params: OK_PARAMS,
    });
    expect(r.snapshots).toEqual([{ deviceId: 'd1', size: 100, updatedAt: expect.any(Date) }]);
  });
});

describe('E2eeBackupService: görüntü (presign/commit/get)', () => {
  it('kurulu değilse presign → 404 E2EE_BACKUP_NOT_CONFIGURED', async () => {
    const t = setup();
    await expect(t.svc.presign('u1', t.ref('d1'))).rejects.toMatchObject({
      status: 404,
      response: { error: 'E2EE_BACKUP_NOT_CONFIGURED' },
    });
  });

  it('başkasının cihazı → 403; olmayan cihaz → 403', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await expect(t.svc.presign('u1', t.ref('dOther'))).rejects.toMatchObject({ status: 403 });
    await expect(t.svc.presign('u1', t.ref('yok'))).rejects.toMatchObject({ status: 403 });
    await expect(t.svc.commit('u1', t.ref('dOther'))).rejects.toMatchObject({ status: 403 });
  });

  it('iptal edilmiş cihazla presign/commit 403; ama görüntüsü listede kalır ve indirilebilir', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.upload('d1', 1);
    t.st.devices.find((d) => d.id === 'd1')!.revokedAt = new Date();
    await expect(t.svc.presign('u1', t.ref('d1', 2))).rejects.toMatchObject({ status: 403 });
    await expect(t.svc.commit('u1', t.ref('d1', 2))).rejects.toMatchObject({ status: 403 });
    expect(((await t.svc.get('u1')) as any).snapshots.map((s: any) => s.deviceId)).toEqual(['d1']);
    await expect(t.svc.getSnapshot('u1', 'd1')).resolves.toMatchObject({
      deviceId: 'd1',
      size: 100,
    });
  });

  it('keyVersion güncel değilse presign/commit → 409', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await expect(t.svc.presign('u1', t.ref('d1', 1, 100, 2))).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_BACKUP_KEY_VERSION' },
    });
    await expect(t.svc.commit('u1', t.ref('d1', 1, 100, 2))).rejects.toMatchObject({ status: 409 });
  });

  it('25 MB sınırı: 25 MB geçer, +1 bayt → 413 E2EE_BACKUP_TOO_LARGE', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    const max = 25 * 1024 * 1024;
    await expect(t.svc.presign('u1', t.ref('d1', 1, max))).resolves.toBeDefined();
    await expect(t.svc.presign('u1', t.ref('d1', 1, max + 1))).rejects.toMatchObject({
      status: 413,
      response: { error: 'E2EE_BACKUP_TOO_LARGE' },
    });
  });

  it('presign: özel bucket anahtarı e2ee-backup/{userId}/{deviceId}/{sha256}, içerik uzunluğu imzaya bağlı', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    const r = await t.svc.presign('u1', t.ref('d1', 7, 4321));
    expect(t.storage.presignPut).toHaveBeenCalledWith(
      `e2ee-backup/u1/d1/${SHA(7)}`,
      'application/octet-stream',
      { contentLength: 4321, expiresIn: 300 },
    );
    expect(r.expiresIn).toBe(300);
  });

  it('commit: nesne yoksa ya da boyut tutmuyorsa 400 ve satır yazılmaz', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await expect(t.svc.commit('u1', t.ref('d1', 1))).rejects.toMatchObject({
      status: 400,
      response: { error: 'E2EE_BACKUP_OBJECT_MISSING' },
    });
    t.objects.set(`e2ee-backup/u1/d1/${SHA(1)}`, 99);
    await expect(t.svc.commit('u1', t.ref('d1', 1, 100))).rejects.toMatchObject({ status: 400 });
    expect(t.st.snaps).toHaveLength(0);
  });

  it('commit: aynı cihazın yeni görüntüsü eskisini (farklı anahtar) siler; aynı anahtar silinmez', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.upload('d1', 1);
    await t.upload('d1', 2);
    expect(t.st.snaps).toHaveLength(1);
    expect(t.st.snaps[0].objectKey).toBe(`e2ee-backup/u1/d1/${SHA(2)}`);
    expect(t.storage.delete).toHaveBeenCalledWith(`e2ee-backup/u1/d1/${SHA(1)}`);
    t.storage.delete.mockClear();
    await t.upload('d1', 2); // aynı sha256 yeniden
    expect(t.storage.delete).not.toHaveBeenCalled();
    expect(t.objects.has(`e2ee-backup/u1/d1/${SHA(2)}`)).toBe(true);
  });

  it('6. görüntüde en eski updatedAt silinir (satır + nesne); yeni görüntü korunur', async () => {
    const t = setup();
    for (const id of ['d3', 'd4', 'd5', 'd6'])
      t.st.devices.push({ id, userId: 'u1', revokedAt: null });
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    const order = ['d1', 'd2', 'd3', 'd4', 'd5'];
    for (const [i, d] of order.entries()) await t.upload(d, i + 1);
    expect(t.st.snaps).toHaveLength(5);
    await t.upload('d6', 6);
    expect(t.st.snaps.map((s) => s.deviceId).sort()).toEqual(['d2', 'd3', 'd4', 'd5', 'd6']);
    expect(t.objects.has(`e2ee-backup/u1/d1/${SHA(1)}`)).toBe(false);
    expect(t.objects.has(`e2ee-backup/u1/d6/${SHA(6)}`)).toBe(true);
  });

  it('GET snapshot: yalnız kendi görüntüsü (başkasınınki ve olmayan 404); presigned GET kısa ömürlü', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.upload('d1', 1);
    await expect(t.svc.getSnapshot('u1', 'd1')).resolves.toMatchObject({
      expiresIn: 300,
      keyVersion: 1,
    });
    expect(t.storage.presignGet).toHaveBeenCalledWith(`e2ee-backup/u1/d1/${SHA(1)}`, {
      expiresIn: 300,
    });
    await expect(t.svc.getSnapshot('u2', 'd1')).rejects.toMatchObject({ status: 404 });
    await expect(t.svc.getSnapshot('u1', 'd2')).rejects.toMatchObject({ status: 404 });
  });

  it('commit sırasında anahtar sıfırlanmışsa (eski keyVersion) görüntü yazılmaz', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    const dto = t.ref('d1', 1);
    t.objects.set(`e2ee-backup/u1/d1/${SHA(1)}`, 100);
    // checkSnapshotRef geçtikten sonra reset araya girer: HEAD sırasında sürüm artar.
    t.storage.headSize.mockImplementationOnce(async () => {
      t.st.backups.get('u1')!.keyVersion = 2;
      return 100;
    });
    await expect(t.svc.commit('u1', dto)).rejects.toMatchObject({ status: 409 });
    expect(t.st.snaps).toHaveLength(0);
  });
});

describe('E2eeBackupService: sıfırla / sil (reauth zorunlu)', () => {
  it('reset: keyVersion+1, yeni anahtar, TÜM görüntü satırları ve nesneleri silinir, reset audit', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.upload('d1', 1);
    await t.upload('d2', 2);
    const newSalt = Buffer.alloc(16, 7).toString('base64');
    await expect(t.svc.reset('u1', { ...t.reauth, ...t.material, salt: newSalt })).resolves.toEqual(
      { keyVersion: 2 },
    );
    const b = t.st.backups.get('u1')!;
    expect(b.keyVersion).toBe(2);
    expect(Buffer.from(b.salt).toString('base64')).toBe(newSalt);
    expect(t.st.snaps).toHaveLength(0);
    expect(t.objects.size).toBe(0);
    expect(t.st.audit.at(-1)).toMatchObject({
      action: 'e2ee.backup.reset',
      metadata: { keyVersion: 2 },
    });
    // Eski sürümle presign artık 409
    await expect(t.svc.presign('u1', t.ref('d1', 3, 100, 1))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('reset: kurulu değilse 404 E2EE_BACKUP_NOT_CONFIGURED; zayıf parametre 400', async () => {
    const t = setup();
    await expect(t.svc.reset('u1', { ...t.reauth, ...t.material })).rejects.toMatchObject({
      status: 404,
      response: { error: 'E2EE_BACKUP_NOT_CONFIGURED' },
    });
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await expect(
      t.svc.reset('u1', { ...t.reauth, ...t.material, params: { m: 1000, t: 1, p: 1 } }),
    ).rejects.toMatchObject({ status: 400, response: { error: 'E2EE_BACKUP_WEAK_PARAMS' } });
    expect(t.st.backups.get('u1')?.keyVersion).toBe(1);
  });

  it('reset: nesne silme hatası işlemi bozmaz (yalnız loglanır)', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.upload('d1', 1);
    t.storage.delete.mockRejectedValueOnce(new Error('s3 down'));
    await expect(t.svc.reset('u1', { ...t.reauth, ...t.material })).resolves.toEqual({
      keyVersion: 2,
    });
    expect(t.st.snaps).toHaveLength(0);
  });

  it('delete: anahtar kaydı + tüm görüntüler + nesneler silinir, delete audit', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.upload('d1', 1);
    await expect(t.svc.remove('u1', t.reauth)).resolves.toBeNull();
    expect(t.st.backups.size).toBe(0);
    expect(t.st.snaps).toHaveLength(0);
    expect(t.objects.size).toBe(0);
    expect(t.st.audit.at(-1)).toMatchObject({
      action: 'e2ee.backup.delete',
      metadata: { keyVersion: 1 },
    });
  });

  it('delete: başka kullanıcının görüntülerine dokunmaz', async () => {
    const t = setup();
    t.st.users.set('u2', { id: 'u2' });
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.svc.putKey('u2', { ...t.material, keyVersion: 1 });
    await t.upload('dOther', 5, 1, 'u2');
    await t.svc.remove('u1', t.reauth);
    expect(t.st.backups.has('u2')).toBe(true);
    expect(t.st.snaps.map((s) => s.userId)).toEqual(['u2']);
  });

  it('reauth başarısızsa reset ve delete 401 ve HİÇBİR şey silinmez', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.upload('d1', 1);
    t.auth.verifyReauth.mockRejectedValue(
      new UnauthorizedException({ message: 'Şifre hatalı.', error: 'INVALID_CREDENTIALS' }),
    );
    await expect(t.svc.reset('u1', { ...t.reauth, ...t.material })).rejects.toMatchObject({
      status: 401,
    });
    await expect(t.svc.remove('u1', t.reauth)).rejects.toMatchObject({ status: 401 });
    expect(t.st.backups.get('u1')?.keyVersion).toBe(1);
    expect(t.st.snaps).toHaveLength(1);
    expect(t.objects.size).toBe(1);
  });

  it('reauth, AuthService.verifyReauth ile (şifre + totp) çağrılır', async () => {
    const t = setup();
    await t.svc.putKey('u1', { ...t.material, keyVersion: 1 });
    await t.svc.remove('u1', { currentPassword: 'pw', totpCode: '123456' });
    expect(t.auth.verifyReauth).toHaveBeenCalledWith({ id: 'u1' }, 'pw', '123456');
  });
});

describe('DTO doğrulama', () => {
  const body = (over: Record<string, unknown> = {}) =>
    plainToInstance(PutBackupKeyDto, {
      salt: SALT,
      params: OK_PARAMS,
      wrappedKey: WRAPPED,
      keyVersion: 1,
      ...over,
    });

  it('geçerli gövde hatasız', async () => {
    expect(await validate(body())).toHaveLength(0);
  });

  it('tuz 16 bayt değilse, sarılmış anahtar 60 bayt değilse reddedilir', async () => {
    expect(
      (await validate(body({ salt: Buffer.alloc(15).toString('base64') }))).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(body({ salt: Buffer.alloc(32).toString('base64') }))).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(body({ wrappedKey: Buffer.alloc(59).toString('base64') }))).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(body({ wrappedKey: Buffer.alloc(61).toString('base64') }))).length,
    ).toBeGreaterThan(0);
    expect((await validate(body({ salt: 'a'.repeat(24) }))).length).toBeGreaterThan(0);
  });

  it('params tam sayı olmalı', async () => {
    expect((await validate(body({ params: { m: 65536.5, t: 4, p: 1 } }))).length).toBeGreaterThan(
      0,
    );
    expect((await validate(body({ params: { m: '65536', t: 4, p: 1 } }))).length).toBeGreaterThan(
      0,
    );
  });

  it('görüntü gövdesi: sha256 64 küçük harf hex, boyut ≥1 tam sayı', async () => {
    const mk = (o: Record<string, unknown>) =>
      plainToInstance(SnapshotRefDto, {
        deviceId: 'd1',
        size: 10,
        sha256: SHA(1),
        keyVersion: 1,
        ...o,
      });
    expect(await validate(mk({}))).toHaveLength(0);
    expect((await validate(mk({ sha256: 'AB'.repeat(32) }))).length).toBeGreaterThan(0);
    expect((await validate(mk({ sha256: 'ab' }))).length).toBeGreaterThan(0);
    expect((await validate(mk({ size: 0 }))).length).toBeGreaterThan(0);
    expect((await validate(mk({ size: 1.5 }))).length).toBeGreaterThan(0);
  });
});

describe('E2eeBackupEnabledGuard (bayrak kapalıyken uçlar kapalı)', () => {
  const ctx = (user: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;
  const flag = (backup: boolean, eligible: boolean) =>
    ({ backup, isEligible: () => eligible }) as never;

  it('E2EE_BACKUP kapalı → 404 E2EE_DISABLED (E1 kapalı-uç davranışı)', () => {
    expect(() =>
      new E2eeBackupEnabledGuard(flag(false, true)).canActivate(ctx({ id: 'u1' })),
    ).toThrow(
      expect.objectContaining({
        status: 404,
        response: expect.objectContaining({ error: 'E2EE_DISABLED' }),
      }),
    );
  });

  it('kullanıcı izin listesinde değilse → 404', () => {
    expect(() =>
      new E2eeBackupEnabledGuard(flag(true, false)).canActivate(ctx({ id: 'u1' })),
    ).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('bayrak açık + uygun → geçer', () => {
    expect(new E2eeBackupEnabledGuard(flag(true, true)).canActivate(ctx({ id: 'u1' }))).toBe(true);
  });
});
