/**
 * AuthController — Sprint M0 bearer refresh teslimi (contract §2).
 *
 * Odak: kontrolcü katmanının `X-Client-Type` başlığına göre gövde şeklini nasıl
 * değiştirdiği (ya da DEĞİŞTİRMEDİĞİ). Service mock'lanır — yönlendirme/rotasyon
 * mantığı auth.service.spec.ts'te.
 *
 * (a) Başlıksız istek → gövde eskisiyle bit-birebir aynı (refreshToken YOK).
 */

// AuthController → AuthService import zinciri otplib/qrcode'a değer (ESM-only @scure/base
// transitifi jest node_modules transform'unu patlatır). Bkz. auth.service.spec.ts açıklaması.
jest.mock('otplib', () => ({
  verifySync: jest.fn(),
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

import { AuthController } from './auth.controller';
import { normalizeClientType } from './utils/client-type.util';

function makeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() } as any;
}

function makeReq(cookies: Record<string, string> = {}) {
  return { ip: '127.0.0.1', cookies } as any;
}

describe('AuthController — X-Client-Type gövde davranışı', () => {
  let authServiceMock: {
    register: jest.Mock;
    login: jest.Mock;
    login2fa: jest.Mock;
    refresh: jest.Mock;
  };
  let controller: AuthController;

  beforeEach(() => {
    authServiceMock = {
      register: jest.fn(),
      login: jest.fn(),
      login2fa: jest.fn(),
      refresh: jest.fn(),
    };
    controller = new AuthController(authServiceMock as any, { get: jest.fn() } as any);
  });

  // ── (a) Başlıksız istek — eski davranış bit-birebir ─────────────────────────

  it('login: başlıksız istek → service clientType=null ile çağrılır, gövdede refreshToken YOK', async () => {
    authServiceMock.login.mockResolvedValue({
      type: 'session',
      user: { id: 'u1' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    const res = makeRes();

    const body = await controller.login({ identifier: 'x', password: 'y' } as any, makeReq(), res, undefined);

    expect(authServiceMock.login).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', null);
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-1', expect.anything());
    expect(body).toEqual({ user: { id: 'u1' }, accessToken: 'access-1' });
    expect(Object.keys(body)).toEqual(['user', 'accessToken']); // refreshToken anahtarı bile yok
  });

  it('login: X-Client-Type: mobile → gövdede refreshToken VAR', async () => {
    authServiceMock.login.mockResolvedValue({
      type: 'session',
      user: { id: 'u1' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    const res = makeRes();

    const body = await controller.login({ identifier: 'x', password: 'y' } as any, makeReq(), res, 'mobile');

    expect(authServiceMock.login).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 'mobile');
    expect(body).toEqual({ user: { id: 'u1' }, accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it("login: X-Client-Type: desktop (allowlist dışı) → null gibi işlenir, refreshToken YOK", async () => {
    authServiceMock.login.mockResolvedValue({
      type: 'session',
      user: { id: 'u1' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    const res = makeRes();

    const body = await controller.login({ identifier: 'x', password: 'y' } as any, makeReq(), res, 'desktop');

    expect(authServiceMock.login).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', null);
    expect(body).toEqual({ user: { id: 'u1' }, accessToken: 'access-1' });
  });

  it('login: 2FA challenge dalı clientType\'tan etkilenmez', async () => {
    authServiceMock.login.mockResolvedValue({ type: 'challenge', challengeToken: 'chal-1' });
    const res = makeRes();

    const body = await controller.login({ identifier: 'x', password: 'y' } as any, makeReq(), res, 'mobile');

    expect(body).toEqual({ twoFactorRequired: true, challengeToken: 'chal-1' });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('register: başlıksız istek → gövdede refreshToken YOK (eski davranış)', async () => {
    authServiceMock.register.mockResolvedValue({
      user: { id: 'u1' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    const res = makeRes();

    const body = await controller.register({} as any, makeReq(), res, undefined);

    expect(authServiceMock.register).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', null);
    expect(body).toEqual({ user: { id: 'u1' }, accessToken: 'access-1' });
  });

  it('login2fa: X-Client-Type: mobile → gövdede refreshToken VAR', async () => {
    authServiceMock.login2fa.mockResolvedValue({
      user: { id: 'u1' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    const res = makeRes();

    const body = await controller.login2fa({} as any, makeReq(), res, 'mobile');

    expect(authServiceMock.login2fa).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 'mobile');
    expect(body).toEqual({ user: { id: 'u1' }, accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  // ── refresh: cookie/gövde kanal seçimi ──────────────────────────────────────

  it('refresh: cookie varsa → service usingCookie=true ile çağrılır, gövdede refreshToken YOK (eski davranış)', async () => {
    authServiceMock.refresh.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    const res = makeRes();

    const body = await controller.refresh(makeReq({ refresh_token: 'cookie-token' }), res, {} as any);

    expect(authServiceMock.refresh).toHaveBeenCalledWith('cookie-token', '127.0.0.1', true);
    expect(body).toEqual({ accessToken: 'access-2' });
    expect(Object.keys(body)).toEqual(['accessToken']);
  });

  it('refresh: cookie yoksa + gövdede token → service usingCookie=false, gövdede yeni refreshToken VAR', async () => {
    authServiceMock.refresh.mockResolvedValue({ accessToken: 'access-3', refreshToken: 'refresh-3' });
    const res = makeRes();

    const body = await controller.refresh(makeReq(), res, { refreshToken: 'body-token' } as any);

    expect(authServiceMock.refresh).toHaveBeenCalledWith('body-token', '127.0.0.1', false);
    expect(body).toEqual({ accessToken: 'access-3', refreshToken: 'refresh-3' });
  });

  it('refresh: ne cookie ne gövde → service boş string + usingCookie=false ile çağrılır (eski hata yolu)', async () => {
    authServiceMock.refresh.mockRejectedValue(new Error('INVALID_REFRESH'));
    const res = makeRes();

    await expect(controller.refresh(makeReq(), res, {} as any)).rejects.toThrow();
    expect(authServiceMock.refresh).toHaveBeenCalledWith('', '127.0.0.1', false);
  });

  // ── normalizeClientType: case/whitespace tuzağı (PM düzeltmesi) ────────────
  // Büyük/küçük harf veya baştan/sondan boşluklu 'mobile' sessizce null'a düşüp
  // istemciyi web gibi davranmaya zorlarsa, M1'de ilk /auth/refresh'te kullanıcı
  // sebepsiz atılır ve hata istemci kodundaymış gibi görünür. Bu davranışı kilitler.

  describe('normalizeClientType — case/whitespace toleransı', () => {
    it.each(['mobile', 'Mobile', 'MOBILE', ' mobile ', 'MoBiLe', '\tmobile\n'])(
      "'%s' → 'mobile' olarak kabul edilir",
      (value) => {
        expect(normalizeClientType(value)).toBe('mobile');
      },
    );

    it.each(['desktop', 'web', 'Desktop', '', '   ', undefined])(
      '%s → hâlâ null (allowlist dışı/boş, web gibi davranır)',
      (value) => {
        expect(normalizeClientType(value)).toBeNull();
      },
    );
  });

  it("login: X-Client-Type: 'Mobile' (büyük harf) → gövdede refreshToken VAR", async () => {
    authServiceMock.login.mockResolvedValue({
      type: 'session',
      user: { id: 'u1' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    const res = makeRes();

    const body = await controller.login({ identifier: 'x', password: 'y' } as any, makeReq(), res, 'Mobile');

    expect(authServiceMock.login).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 'mobile');
    expect(body).toEqual({ user: { id: 'u1' }, accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it("login: X-Client-Type: ' mobile ' (baştan/sondan boşluklu) → gövdede refreshToken VAR", async () => {
    authServiceMock.login.mockResolvedValue({
      type: 'session',
      user: { id: 'u1' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    const res = makeRes();

    const body = await controller.login({ identifier: 'x', password: 'y' } as any, makeReq(), res, ' mobile ');

    expect(authServiceMock.login).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 'mobile');
    expect(body).toEqual({ user: { id: 'u1' }, accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it("login: X-Client-Type: 'web' → hâlâ null, refreshToken YOK", async () => {
    authServiceMock.login.mockResolvedValue({
      type: 'session',
      user: { id: 'u1' },
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    const res = makeRes();

    const body = await controller.login({ identifier: 'x', password: 'y' } as any, makeReq(), res, 'web');

    expect(authServiceMock.login).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', null);
    expect(body).toEqual({ user: { id: 'u1' }, accessToken: 'access-1' });
  });
});
