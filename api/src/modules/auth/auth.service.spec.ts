/**
 * AuthService.refresh — Sprint M0 bearer refresh teslimi (contract §2, R7).
 *
 * Odak: cookie yokken gövdeden gelen refresh token'ın `clientType` kapısı +
 * mevcut rotasyon/reuse-detection mantığının bozulmadığı. Gerçek `JwtService`
 * + gerçek `argon2` kullanılır (yalnızca Prisma mock'lanır) — imzalama/hash
 * doğrulamasını taklit etmek testin amacını zayıflatır.
 */

// otplib/qrcode ESM-only transitif bağımlılık taşıyor (@scure/base) — jest'in varsayılan
// node_modules transformIgnorePatterns'ı bunu parse edemiyor. auth.service.ts'in `@Injectable()`
// constructor metadata'sı için gerçek modülü import etmesi yeterli (hiç çağrılmasalar bile);
// bu testler TOTP/QR'a dokunmadığı için davranışsal olmayan stub yeterli.
jest.mock('otplib', () => ({
  verifySync: jest.fn(),
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

const configMock = {
  get: jest.fn((key: string) => {
    if (key === 'jwt.accessSecret') return ACCESS_SECRET;
    if (key === 'jwt.refreshSecret') return REFRESH_SECRET;
    if (key === 'registrationMode') return 'open';
    return undefined;
  }),
};

const emailServiceMock = {
  sendNewDeviceEmail: jest.fn().mockResolvedValue(undefined),
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
};

function makePrismaMock() {
  const mock: any = {
    session: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // D108: dizi (revokeWithDevices) ve etkileşimli (refresh rotasyonu) transaction biçimleri
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function' ? arg(mock) : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  return mock;
}

// E1: cihaz iptali bağımlılığı (davranış testleri e2ee-revocation.spec.ts ve aşağıdaki E1 bloğunda)
const e2eeMock = {
  revokeOps: jest.fn().mockResolvedValue([]),
  announce: jest.fn(),
  parkOps: jest.fn().mockReturnValue([]), // C69: çıkış cihazı park eder
};

function makeService(prismaMock: ReturnType<typeof makePrismaMock>) {
  const jwtService = new JwtService();
  return new AuthService(
    prismaMock as any,
    jwtService,
    configMock as any,
    emailServiceMock as any,
    { canCreateAnimated: jest.fn().mockReturnValue(true) } as any,
    e2eeMock as any,
  );
}

function signRefreshToken(
  jwtService: JwtService,
  payload: { sub: string; sessionId: string; family: string },
) {
  return jwtService.sign(payload, { secret: REFRESH_SECRET, expiresIn: '30d' });
}

describe('AuthService.refresh — bearer teslim kapısı', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── (b) Web session'ın token'ı gövdeden → 401 REFRESH_CHANNEL_MISMATCH ─────

  it('cookie yokken (usingCookie=false) clientType=null (web) session → REFRESH_CHANNEL_MISMATCH ile reddedilir', async () => {
    const prismaMock = makePrismaMock();
    const service = makeService(prismaMock);
    const jwtService = new JwtService();

    const rawToken = signRefreshToken(jwtService, {
      sub: 'user-1',
      sessionId: 'session-1',
      family: 'family-1',
    });
    const refreshTokenHash = await argon2.hash(rawToken, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
    });

    prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenFamily: 'family-1',
      refreshTokenHash,
      clientType: null, // web (geriye dönük uyum)
      revokedAt: null,
    });

    await expect(
      service.refresh(rawToken, '1.2.3.4', /* usingCookie */ false),
    ).rejects.toMatchObject({
      response: { error: 'REFRESH_CHANNEL_MISMATCH' },
    });

    // Kapı erken devrede — token'ın hash'i geçerli olsa bile session hiç mutasyona uğramaz.
    expect(prismaMock.session.update).not.toHaveBeenCalled();
    expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('cookie varken (usingCookie=true) aynı web session → kapı ATLANIR, eski davranış (rotasyon başarılı)', async () => {
    const prismaMock = makePrismaMock();
    const service = makeService(prismaMock);
    const jwtService = new JwtService();

    const rawToken = signRefreshToken(jwtService, {
      sub: 'user-1',
      sessionId: 'session-1',
      family: 'family-1',
    });
    const refreshTokenHash = await argon2.hash(rawToken, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
    });

    prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenFamily: 'family-1',
      refreshTokenHash,
      clientType: null,
      revokedAt: null,
    });
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.session.create.mockResolvedValue({});

    const result = await service.refresh(rawToken, '1.2.3.4', true);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  // ── (c) Mobil rotasyon çalışıyor + clientType rotasyonda korunuyor ─────────

  it('cookie yokken mobile session → rotasyon başarılı, yeni session da clientType=mobile ile açılır', async () => {
    const prismaMock = makePrismaMock();
    const service = makeService(prismaMock);
    const jwtService = new JwtService();

    const rawToken = signRefreshToken(jwtService, {
      sub: 'user-1',
      sessionId: 'session-mobile',
      family: 'family-mobile',
    });
    const refreshTokenHash = await argon2.hash(rawToken, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
    });

    prismaMock.session.findUnique.mockResolvedValue({
      id: 'session-mobile',
      userId: 'user-1',
      tokenFamily: 'family-mobile',
      refreshTokenHash,
      clientType: 'mobile',
      revokedAt: null,
    });
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.session.create.mockResolvedValue({});

    const result = await service.refresh(rawToken, '5.6.7.8', /* usingCookie */ false);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientType: 'mobile', tokenFamily: 'family-mobile' }),
      }),
    );
  });

  // ── (d) Aynı token iki kez → aile revoke (reuse-detection) ─────────────────

  it('rotasyon sonrası aynı (kullanılmış) token tekrar kullanılırsa → REFRESH_REUSE_DETECTED, tüm aile revoke edilir', async () => {
    const prismaMock = makePrismaMock();
    const service = makeService(prismaMock);
    const jwtService = new JwtService();

    const rawToken = signRefreshToken(jwtService, {
      sub: 'user-1',
      sessionId: 'session-mobile',
      family: 'family-mobile',
    });
    const refreshTokenHash = await argon2.hash(rawToken, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
    });

    const sessionRow: { revokedAt: Date | null; [k: string]: unknown } = {
      id: 'session-mobile',
      userId: 'user-1',
      tokenFamily: 'family-mobile',
      refreshTokenHash,
      clientType: 'mobile',
      revokedAt: null,
    };

    prismaMock.session.findUnique.mockImplementation(() => Promise.resolve({ ...sessionRow }));
    prismaMock.session.updateMany.mockImplementation(({ data }: { data: { revokedAt: Date } }) => {
      sessionRow.revokedAt = data.revokedAt;
      return Promise.resolve({ count: 1 });
    });
    prismaMock.session.create.mockResolvedValue({});

    // 1. kullanım — rotasyon başarılı, session revoke edilir (normal rotasyon akışı).
    await service.refresh(rawToken, '5.6.7.8', false);
    expect(sessionRow.revokedAt).not.toBeNull();

    // Grace penceresini (10sn) geride bırak — gerçek reuse'u eşzamanlı yarıştan ayırmak için.
    sessionRow.revokedAt = new Date(Date.now() - 20_000);
    prismaMock.session.updateMany.mockClear();

    // 2. kullanım — aynı (artık kullanılmış) token tekrar gönderilir → reuse tespiti.
    await expect(service.refresh(rawToken, '5.6.7.8', false)).rejects.toMatchObject({
      response: { error: 'REFRESH_REUSE_DETECTED' },
    });

    // Tüm aile (tokenFamily) revoke edilir.
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tokenFamily: 'family-mobile' }) }),
    );
  });

  // ── Geriye uyum: cookie yolunda kapı hiç çalışmaz ───────────────────────────

  it('rawToken boşsa (ne cookie ne gövde) → eski INVALID_REFRESH hatası, kapı devreye girmez', async () => {
    const prismaMock = makePrismaMock();
    const service = makeService(prismaMock);

    await expect(service.refresh('', '1.2.3.4', false)).rejects.toMatchObject({
      response: { error: 'INVALID_REFRESH' },
    });
    expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
  });
});

// ── E1 §2.6: oturum iptali <-> E2EE cihaz iptali (R7) ────────────────────────

describe('AuthService — E1 E2EE cihaz iptali', () => {
  const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2 };

  function setup() {
    const prismaMock = {
      ...makePrismaMock(),
      user: { findUnique: jest.fn(), update: jest.fn().mockReturnValue('USER_UPD') },
      recentGame: { deleteMany: jest.fn().mockReturnValue('RG_DEL') },
    };
    return { prismaMock, service: makeService(prismaMock as any), jwt: new JwtService() };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    e2eeMock.revokeOps.mockResolvedValue([]);
  });

  it('refresh ROTASYONU cihazı iptal etmez; yeni oturum AYNI tokenFamily ile açılır (cihaz zincire bağlı)', async () => {
    const { prismaMock, service, jwt } = setup();
    const raw = signRefreshToken(jwt, { sub: 'u1', sessionId: 's1', family: 'fam-1' });
    prismaMock.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      tokenFamily: 'fam-1',
      refreshTokenHash: await argon2.hash(raw, ARGON),
      clientType: null,
      revokedAt: null,
    });
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.session.create.mockResolvedValue({});

    await service.refresh(raw, '1.2.3.4', true);

    expect(e2eeMock.revokeOps).not.toHaveBeenCalled();
    expect(e2eeMock.announce).not.toHaveBeenCalled();
    // D108: rotasyon claim+create için TEK etkileşimli transaction (cihaz iptali yine yok)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.session.create.mock.calls[0][0].data.tokenFamily).toBe('fam-1');
  });

  it('refresh yeniden kullanımı (bilinmeyen oturum) → aile iptali + cihaz iptali AYNI transaction', async () => {
    const { prismaMock, service, jwt } = setup();
    const raw = signRefreshToken(jwt, { sub: 'u1', sessionId: 'yok', family: 'fam-1' });
    prismaMock.session.findUnique.mockResolvedValue(null);

    await expect(service.refresh(raw, '1.2.3.4', true)).rejects.toMatchObject({
      response: { error: 'REFRESH_REUSE_DETECTED' },
    });
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ families: ['fam-1'] });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(e2eeMock.announce).toHaveBeenCalledWith({ families: ['fam-1'] });
  });

  it('geçersiz refresh token (hash uyuşmaz) → oturumun ailesi için cihaz iptali', async () => {
    const { prismaMock, service, jwt } = setup();
    const raw = signRefreshToken(jwt, { sub: 'u1', sessionId: 's1', family: 'fam-1' });
    prismaMock.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      tokenFamily: 'fam-1',
      refreshTokenHash: await argon2.hash('baska-token', ARGON),
      clientType: null,
      revokedAt: null,
    });
    prismaMock.session.update.mockResolvedValue({});
    await expect(service.refresh(raw, '1.2.3.4', true)).rejects.toMatchObject({
      response: { error: 'INVALID_REFRESH' },
    });
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ families: ['fam-1'] });
  });

  it('çıkış (gövde yok / keepE2eeDevice yok) → BUGÜNKÜ davranış: cihaz iptal + yayın, park yok', async () => {
    const { prismaMock, service } = setup();
    prismaMock.session.findUnique.mockResolvedValue({ tokenFamily: 'fam-1' });
    prismaMock.session.updateMany.mockReturnValue('SES_UPD');
    await service.logout('s1');
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ sessionId: 's1' });
    expect(e2eeMock.announce).toHaveBeenCalledWith({ sessionId: 's1' });
    expect(e2eeMock.parkOps).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('çıkış keepE2eeDevice=false → iptal, park yok', async () => {
    const { prismaMock, service } = setup();
    prismaMock.session.findUnique.mockResolvedValue({ tokenFamily: 'fam-1' });
    await service.logout('s1', false);
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ sessionId: 's1' });
    expect(e2eeMock.parkOps).not.toHaveBeenCalled();
  });

  it('C69: çıkış keepE2eeDevice=true → cihaz İPTAL EDİLMEZ, park (oturum + park tek transaction)', async () => {
    const { prismaMock, service } = setup();
    prismaMock.session.findUnique.mockResolvedValue({ tokenFamily: 'fam-1' });
    prismaMock.session.updateMany.mockReturnValue('SES_UPD');
    e2eeMock.parkOps.mockReturnValue(['PARK_OP']);
    await service.logout('s1', true);
    expect(e2eeMock.parkOps).toHaveBeenCalledWith('fam-1');
    expect(e2eeMock.revokeOps).not.toHaveBeenCalled();
    expect(e2eeMock.announce).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction.mock.calls[0][0]).toEqual(['SES_UPD', 'PARK_OP']);
    expect(prismaMock.session.updateMany.mock.calls[0][0].where).toEqual({
      tokenFamily: 'fam-1',
      revokedAt: null,
    });
  });

  it('oturumlarımdan kapatma → o oturumun ailesi', async () => {
    const { prismaMock, service } = setup();
    (prismaMock.session as any).findFirst = jest
      .fn()
      .mockResolvedValue({ id: 's2', tokenFamily: 'fam-2' });
    prismaMock.session.update.mockReturnValue('SES_UPD');
    await service.revokeSession('u1', 's2');
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ families: ['fam-2'] });
  });

  it('diğer oturumları kapat → kullanıcının tüm cihazları, mevcut oturumun zinciri hariç', async () => {
    const { prismaMock, service } = setup();
    prismaMock.session.updateMany.mockReturnValue('SES_UPD');
    await service.revokeOtherSessions('u1', 's-now');
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ userId: 'u1', exceptSessionId: 's-now' });
  });

  it('parola değişimi → mevcut oturum hariç toplu iptal; parola + oturum + cihaz tek transaction', async () => {
    const { prismaMock, service } = setup();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash: await argon2.hash('eski-sifre-123', ARGON),
      twoFactorEnabled: false,
    });
    prismaMock.session.updateMany.mockReturnValue('SES_UPD');
    await service.changePassword('u1', 's-now', {
      currentPassword: 'eski-sifre-123',
      newPassword: 'yeni-sifre-456',
    } as never);
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ userId: 'u1', exceptSessionId: 's-now' });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('hesap silme talebi → kullanıcının tüm cihazları', async () => {
    const { prismaMock, service } = setup();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash: await argon2.hash('sifre-12345', ARGON),
      twoFactorEnabled: false,
    });
    prismaMock.session.updateMany.mockReturnValue('SES_UPD');
    await service.deleteAccount('u1', { currentPassword: 'sifre-12345' } as never);
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ userId: 'u1' });
    expect(e2eeMock.announce).toHaveBeenCalledWith({ userId: 'u1' });
  });

  it('C69: parola sıfırlama → kullanıcı kapsamlı iptal (park cihazları da; istisna yok)', async () => {
    const { prismaMock, service } = setup();
    (prismaMock as any).authToken = {
      findFirst: jest.fn().mockResolvedValue({
        id: 't1',
        userId: 'u1',
        type: 'PASSWORD_RESET',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    prismaMock.session.updateMany.mockReturnValue('SES_UPD');
    await service.resetPassword({ token: 'x'.repeat(40), newPassword: 'yeni-sifre-456' } as never);
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ userId: 'u1' });
  });
});

// ── D108: oturum yenileme yarışı (R7) ────────────────────────────────────────

describe('AuthService.refresh — D108 yarış / grace', () => {
  const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2 };

  /** Bellekte tek tablo: updateMany/create/findFirst gerçek koşullara göre davranır. */
  async function setup() {
    const prismaMock = makePrismaMock();
    const jwt = new JwtService();
    const raw = signRefreshToken(jwt, { sub: 'u1', sessionId: 's1', family: 'fam-1' });
    const rows: any[] = [
      {
        id: 's1',
        userId: 'u1',
        tokenFamily: 'fam-1',
        refreshTokenHash: await argon2.hash(raw, ARGON),
        clientType: null,
        device: 'Opera',
        revokedAt: null,
      },
    ];
    prismaMock.session.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
    );
    prismaMock.session.updateMany.mockImplementation(({ where, data }: any) => {
      const hit = rows.filter(
        (r) =>
          (!where.id || r.id === where.id) &&
          (!where.tokenFamily || r.tokenFamily === where.tokenFamily) &&
          (where.revokedAt !== null || true) &&
          (where.revokedAt === null ? r.revokedAt === null : true),
      );
      hit.forEach((r) => (r.revokedAt = data.revokedAt));
      return Promise.resolve({ count: hit.length });
    });
    prismaMock.session.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        rows.find((r) => r.tokenFamily === where.tokenFamily && r.revokedAt === null) ?? null,
      ),
    );
    prismaMock.session.create.mockImplementation(({ data }: any) => {
      rows.push({ ...data, revokedAt: null });
      return Promise.resolve(data);
    });
    return { prismaMock, service: makeService(prismaMock as any), raw, rows };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    e2eeMock.revokeOps.mockResolvedValue([]);
  });

  it('iki eşzamanlı refresh (aynı token) → ikisi de başarılı, aile canlı, aynı ailede iki canlı oturum', async () => {
    const { service, raw, rows } = await setup();
    const [a, b] = await Promise.all([
      service.refresh(raw, '1.1.1.1', true),
      service.refresh(raw, '1.1.1.1', true),
    ]);
    expect(a.accessToken).toBeDefined();
    expect(b.refreshToken).toBeDefined();
    expect(a.refreshToken).not.toBe(b.refreshToken);
    const alive = rows.filter((r) => r.revokedAt === null);
    expect(alive).toHaveLength(2);
    expect(alive.every((r) => r.tokenFamily === 'fam-1')).toBe(true);
    expect(e2eeMock.revokeOps).not.toHaveBeenCalled();
  });

  it('grace içi ikinci kullanım → 200 + aynı aileye yeni çocuk oturum (cihaz iptali yok)', async () => {
    const { service, raw, rows } = await setup();
    await service.refresh(raw, '1.1.1.1', true);
    const second = await service.refresh(raw, '1.1.1.1', true);
    expect(second.refreshToken).toBeDefined();
    expect(rows.filter((r) => r.revokedAt === null && r.tokenFamily === 'fam-1')).toHaveLength(2);
    expect(rows.find((r) => r.id !== 's1' && r.device === 'Opera')).toBeDefined(); // cihaz adı taşınır
    expect(e2eeMock.revokeOps).not.toHaveBeenCalled();
  });

  it('grace içinde ama aile ölü (çıkış yapılmış) → 401 INVALID_REFRESH, oturum diriltilmez', async () => {
    const { service, raw, rows } = await setup();
    rows[0].revokedAt = new Date(); // çıkış: tüm aile kapalı
    await expect(service.refresh(raw, '1.1.1.1', true)).rejects.toMatchObject({
      response: { error: 'INVALID_REFRESH' },
    });
    expect(rows).toHaveLength(1);
    expect(e2eeMock.revokeOps).not.toHaveBeenCalled();
  });

  it('grace DIŞI reuse → REFRESH_REUSE_DETECTED + aile ve E2EE cihaz iptali', async () => {
    const { service, raw, rows } = await setup();
    rows[0].revokedAt = new Date(Date.now() - 20_000);
    await expect(service.refresh(raw, '1.1.1.1', true)).rejects.toMatchObject({
      response: { error: 'REFRESH_REUSE_DETECTED' },
    });
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ families: ['fam-1'] });
  });

  it('claim sonrası create hatası → transaction geri alınır, eski oturum AÇIK kalır', async () => {
    const { prismaMock, service, raw, rows } = await setup();
    // Gerçek rollback taklidi: tx hata verirse satır durumu geri sarılır.
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      const snapshot = rows.map((r) => ({ ...r }));
      try {
        return await fn(prismaMock);
      } catch (e) {
        rows.splice(0, rows.length, ...snapshot);
        throw e;
      }
    });
    prismaMock.session.create.mockRejectedValueOnce(new Error('db düştü'));
    await expect(service.refresh(raw, '1.1.1.1', true)).rejects.toThrow('db düştü');
    expect(rows[0].revokedAt).toBeNull();
    // Aynı token tekrar denenebilir
    await expect(service.refresh(raw, '1.1.1.1', true)).resolves.toBeDefined();
  });

  it('çıkış aileyi bütünüyle kapatır (grace kardeş oturum açık kalmaz)', async () => {
    const { service, raw, rows } = await setup();
    await service.refresh(raw, '1.1.1.1', true);
    await service.refresh(raw, '1.1.1.1', true); // iki canlı çocuk
    const child = rows.find((r) => r.id !== 's1')!;
    await service.logout(child.id);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(0);
    expect(e2eeMock.revokeOps).toHaveBeenCalledWith({ sessionId: child.id });
    expect(e2eeMock.parkOps).not.toHaveBeenCalled();
  });

  it('çıkış keepE2eeDevice=true: aile yine bütünüyle kapanır (D108), park', async () => {
    const { service, raw, rows } = await setup();
    await service.refresh(raw, '1.1.1.1', true);
    await service.refresh(raw, '1.1.1.1', true);
    const child = rows.find((r) => r.id !== 's1')!;
    await service.logout(child.id, true);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(0);
    expect(e2eeMock.parkOps).toHaveBeenCalledWith('fam-1');
    expect(e2eeMock.revokeOps).not.toHaveBeenCalled();
  });
});
