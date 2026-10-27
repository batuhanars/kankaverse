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
  return {
    session: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function makeService(prismaMock: ReturnType<typeof makePrismaMock>) {
  const jwtService = new JwtService();
  return new AuthService(
    prismaMock as any,
    jwtService,
    configMock as any,
    emailServiceMock as any,
    { canCreateAnimated: jest.fn().mockReturnValue(true) } as any,
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
