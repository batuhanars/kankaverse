import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canPreviewAiVideo, canUseAiVideo } from './ai-video-access';
import { AI_VIDEO_PREVIEW_OK, AiVideoAccessGuard } from './ai-video-access.guard';

function cfg(over: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'aiVideo.enabled': true,
    'aiVideo.apiKey': 'k',
    'aiVideo.userIds': ['u1'],
    ...over,
  };
  return { get: (k: string) => values[k] } as any;
}
const ADULT = { id: 'u1', isMinor: false };
const NO_GRANT = { aiVideoGrant: { findUnique: jest.fn().mockResolvedValue(null) } } as any;

describe('canUseAiVideo (R7 kapisi)', () => {
  it('bayrak + anahtar + liste + yetiskin: izin', async () => {
    expect(await canUseAiVideo(cfg(), NO_GRANT, ADULT)).toBe(true);
  });
  it('bayrak kapali: red', async () => {
    expect(await canUseAiVideo(cfg({ 'aiVideo.enabled': false }), NO_GRANT, ADULT)).toBe(false);
  });
  it('anahtar bos: red', async () => {
    expect(await canUseAiVideo(cfg({ 'aiVideo.apiKey': '' }), NO_GRANT, ADULT)).toBe(false);
  });
  it('listede degil: red (bos liste = kimse)', async () => {
    expect(await canUseAiVideo(cfg({ 'aiVideo.userIds': ['x'] }), NO_GRANT, ADULT)).toBe(false);
    expect(await canUseAiVideo(cfg({ 'aiVideo.userIds': [] }), NO_GRANT, ADULT)).toBe(false);
  });
  it('minor: listede olsa bile red', async () => {
    expect(await canUseAiVideo(cfg(), NO_GRANT, { id: 'u1', isMinor: true })).toBe(false);
  });
});

describe('canPreviewAiVideo (C33 pasif tanitim)', () => {
  it('minor: false (listede olsa bile)', () => {
    expect(canPreviewAiVideo(cfg(), { isMinor: true })).toBe(false);
  });
  it('bayrak kapali: false', () => {
    expect(canPreviewAiVideo(cfg({ 'aiVideo.enabled': false }), { isMinor: false })).toBe(false);
  });
  it('yetiskin listede degil: preview true, allowed false', async () => {
    const c = cfg({ 'aiVideo.userIds': ['x'] });
    const adult = { id: 'u9', isMinor: false };
    expect(canPreviewAiVideo(c, adult)).toBe(true);
    expect(await canUseAiVideo(c, NO_GRANT, adult)).toBe(false);
  });
  it('yetiskin listede: ikisi de true', async () => {
    expect(canPreviewAiVideo(cfg(), ADULT)).toBe(true);
    expect(await canUseAiVideo(cfg(), NO_GRANT, ADULT)).toBe(true);
  });
  it('guard davranisi degismedi: listede olmayan yetiskin preview gorse de 403', async () => {
    const g = new AiVideoAccessGuard(
      cfg({ 'aiVideo.userIds': ['x'] }),
      {
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'u9', isMinor: false }) },
        aiVideoGrant: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any,
      new Reflector(),
    );
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u9' } }) }),
      getHandler: () => function plain() {},
    } as any;
    await expect(g.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AiVideoAccessGuard preview-ok ucu (C33 ek)', () => {
  function run(config: any, user: any) {
    const handler = function opts() {};
    Reflect.defineMetadata(AI_VIDEO_PREVIEW_OK, true, handler);
    const req: any = { user: { id: 'u9' } };
    const g = new AiVideoAccessGuard(
      config,
      {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
        aiVideoGrant: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any,
      new Reflector(),
    );
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
    } as any;
    return { p: g.canActivate(ctx), req };
  }
  const c = cfg({ 'aiVideo.userIds': ['x'] });
  it('listede olmayan yetiskin: preview-ok uca girer, aiVideoAllowed false', async () => {
    const { p, req } = run(c, { id: 'u9', isMinor: false });
    await expect(p).resolves.toBe(true);
    expect(req.aiVideoAllowed).toBe(false);
  });
  it('listedeki yetiskin: aiVideoAllowed true', async () => {
    const { p, req } = run(cfg(), { id: 'u1', isMinor: false });
    await expect(p).resolves.toBe(true);
    expect(req.aiVideoAllowed).toBe(true);
  });
  it('minor: preview-ok uc de 403', async () => {
    await expect(run(c, { id: 'u9', isMinor: true }).p).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('bayrak kapali: 403', async () => {
    const off = cfg({ 'aiVideo.enabled': false, 'aiVideo.userIds': ['x'] });
    await expect(run(off, { id: 'u9', isMinor: false }).p).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('AiVideoAccessGuard', () => {
  const ctx = (user: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => function plain() {},
    }) as unknown as ExecutionContext;
  const prisma = (row: unknown) =>
    ({
      user: { findUnique: jest.fn().mockResolvedValue(row) },
      aiVideoGrant: { findUnique: jest.fn().mockResolvedValue(null) },
    }) as any;

  it('izinli kullanici gecer', async () => {
    const g = new AiVideoAccessGuard(cfg(), prisma(ADULT), new Reflector());
    await expect(g.canActivate(ctx({ id: 'u1', isModerator: false }))).resolves.toBe(true);
  });
  it('moderator tek basina yetmez: jenerik 403 FORBIDDEN', async () => {
    const g = new AiVideoAccessGuard(cfg(), prisma({ id: 'm1', isMinor: false }), new Reflector());
    await expect(g.canActivate(ctx({ id: 'm1', isModerator: true }))).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });
  it('minor listede olsa red; kullanici yoksa red', async () => {
    const minor = new AiVideoAccessGuard(
      cfg(),
      prisma({ id: 'u1', isMinor: true }),
      new Reflector(),
    );
    await expect(minor.canActivate(ctx({ id: 'u1' }))).rejects.toBeInstanceOf(ForbiddenException);
    const none = new AiVideoAccessGuard(cfg(), prisma(null), new Reflector());
    await expect(none.canActivate(ctx({ id: 'u1' }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(none.canActivate(ctx(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('C40 admin hakki (canUseAiVideo async)', () => {
  const NOT_LISTED = cfg({ 'aiVideo.userIds': [] });
  const U = { id: 'u7', isMinor: false };
  const prismaWith = (grant: unknown, rows: unknown[] = []) =>
    ({
      aiVideoGrant: { findUnique: jest.fn().mockResolvedValue(grant) },
      aiVideoGeneration: { findMany: jest.fn().mockResolvedValue(rows) },
    }) as any;
  const grant = (over: Record<string, unknown> = {}) => ({
    userId: 'u7',
    budgetMicroUsd: 500_000,
    startsAt: new Date('2026-10-01T00:00:00Z'),
    expiresAt: null,
    revokedAt: null,
    ...over,
  });
  const ctxFor = () =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u7' } }) }),
      getHandler: () => function plain() {},
    }) as any;

  it('async: Promise doner (await unutulursa truthy tuzagi)', async () => {
    const p = canUseAiVideo(NOT_LISTED, prismaWith(null), U);
    expect(p).toBeInstanceOf(Promise);
    await expect(p).resolves.toBe(false);
  });
  it('etkin hak: izin; hak yok: red', async () => {
    expect(await canUseAiVideo(NOT_LISTED, prismaWith(grant()), U)).toBe(true);
    expect(await canUseAiVideo(NOT_LISTED, prismaWith(null), U)).toBe(false);
  });
  it('iptal / suresi dolmus / butcesi bitmis: red', async () => {
    const revoked = prismaWith(grant({ revokedAt: new Date() }));
    expect(await canUseAiVideo(NOT_LISTED, revoked, U)).toBe(false);
    const expired = prismaWith(grant({ expiresAt: new Date(Date.now() - 1) }));
    expect(await canUseAiVideo(NOT_LISTED, expired, U)).toBe(false);
    const spent = [{ status: 'COMPLETED', costMicroUsd: 500_000, quoteMicroUsd: 500_000 }];
    expect(await canUseAiVideo(NOT_LISTED, prismaWith(grant(), spent), U)).toBe(false);
  });
  it('gelecekte bitisli hak: izin', async () => {
    const g = grant({ expiresAt: new Date(Date.now() + 86_400_000) });
    expect(await canUseAiVideo(NOT_LISTED, prismaWith(g), U)).toBe(true);
  });
  it('minore hak kaydi olsa bile red (hak sorgusuna gidilmez)', async () => {
    const prisma = prismaWith(grant());
    expect(await canUseAiVideo(NOT_LISTED, prisma, { id: 'u7', isMinor: true })).toBe(false);
    expect(prisma.aiVideoGrant.findUnique).not.toHaveBeenCalled();
  });
  it('bayrak kapali ya da anahtar bos: hak olsa da red', async () => {
    const off = cfg({ 'aiVideo.userIds': [], 'aiVideo.enabled': false });
    expect(await canUseAiVideo(off, prismaWith(grant()), U)).toBe(false);
    const noKey = cfg({ 'aiVideo.userIds': [], 'aiVideo.apiKey': '' });
    expect(await canUseAiVideo(noKey, prismaWith(grant()), U)).toBe(false);
  });
  it('env listesindeki hak sorgusuna gitmez', async () => {
    const prisma = prismaWith(null);
    expect(await canUseAiVideo(cfg(), prisma, ADULT)).toBe(true);
    expect(prisma.aiVideoGrant.findUnique).not.toHaveBeenCalled();
  });
  it('guard ile fonksiyon ayni sonucu verir (hakli kullanici)', async () => {
    const prisma = { ...prismaWith(grant()), user: { findUnique: jest.fn().mockResolvedValue(U) } };
    const g = new AiVideoAccessGuard(NOT_LISTED, prisma, new Reflector());
    const req: any = { user: { id: 'u7' } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => function p() {},
    };
    await expect(g.canActivate(ctx as any)).resolves.toBe(true);
    expect(req.aiVideoAllowed).toBe(await canUseAiVideo(NOT_LISTED, prismaWith(grant()), U));
  });
  it('guard: iptal edilmis hak 403', async () => {
    const prisma = {
      ...prismaWith(grant({ revokedAt: new Date() })),
      user: { findUnique: jest.fn().mockResolvedValue(U) },
    };
    const g = new AiVideoAccessGuard(NOT_LISTED, prisma, new Reflector());
    await expect(g.canActivate(ctxFor())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
