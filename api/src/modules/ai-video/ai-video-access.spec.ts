import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canPreviewAiVideo, canUseAiVideo } from './ai-video-access';
import {
  AI_VIDEO_OWN_DATA,
  AI_VIDEO_PREVIEW_OK,
  AiVideoAccessGuard,
} from './ai-video-access.guard';
import { AiVideoController } from './ai-video.controller';

function cfg(over: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'aiVideo.enabled': true,
    'aiVideo.apiKey': 'k',
    ...over,
  };
  return { get: (k: string) => values[k] } as any;
}
const ADULT = { id: 'u1', isMinor: false };
// C43: erisimin tek kaynagi hak; GRANTED = etkin hakli kullanici
const GRANTED = {
  aiVideoGrant: {
    findUnique: jest.fn().mockResolvedValue({
      userId: 'u1',
      budgetMicroUsd: 500_000,
      startsAt: new Date('2026-10-01T00:00:00Z'),
      expiresAt: null,
      revokedAt: null,
    }),
  },
  aiVideoGeneration: { findMany: jest.fn().mockResolvedValue([]) },
} as any;
const NO_GRANT = { aiVideoGrant: { findUnique: jest.fn().mockResolvedValue(null) } } as any;

describe('canUseAiVideo (R7 kapisi)', () => {
  it('bayrak + anahtar + etkin hak + yetiskin: izin', async () => {
    expect(await canUseAiVideo(cfg(), GRANTED, ADULT)).toBe(true);
  });
  it('bayrak kapali: red', async () => {
    expect(await canUseAiVideo(cfg({ 'aiVideo.enabled': false }), GRANTED, ADULT)).toBe(false);
  });
  it('anahtar bos: red', async () => {
    expect(await canUseAiVideo(cfg({ 'aiVideo.apiKey': '' }), GRANTED, ADULT)).toBe(false);
  });
  it('hak yok: red (AI_VIDEO_USER_IDS env tanimli olsa bile etkisiz)', async () => {
    process.env.AI_VIDEO_USER_IDS = 'u1';
    try {
      expect(await canUseAiVideo(cfg(), NO_GRANT, ADULT)).toBe(false);
    } finally {
      delete process.env.AI_VIDEO_USER_IDS;
    }
  });
  it('minor: etkin hak olsa bile red', async () => {
    expect(await canUseAiVideo(cfg(), GRANTED, { id: 'u1', isMinor: true })).toBe(false);
  });
});

describe('canUseAiVideo C43 (hak durumlari)', () => {
  const withGrant = (over: Record<string, unknown>, spent: unknown[] = []) =>
    ({
      aiVideoGrant: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'u1',
          budgetMicroUsd: 500_000,
          startsAt: new Date('2026-10-01T00:00:00Z'),
          expiresAt: null,
          revokedAt: null,
          ...over,
        }),
      },
      aiVideoGeneration: { findMany: jest.fn().mockResolvedValue(spent) },
    }) as any;
  it('etkin hak: izin', async () => {
    expect(await canUseAiVideo(cfg(), withGrant({}), ADULT)).toBe(true);
  });
  it('suresi dolmus hak: kapi kapali', async () => {
    const p = withGrant({ expiresAt: new Date(Date.now() - 1000) });
    expect(await canUseAiVideo(cfg(), p, ADULT)).toBe(false);
  });
  it('iptal edilmis hak: kapi kapali', async () => {
    expect(await canUseAiVideo(cfg(), withGrant({ revokedAt: new Date() }), ADULT)).toBe(false);
  });
  it('butcesi biten hak: kapi kapali', async () => {
    const spent = [{ status: 'COMPLETED', costMicroUsd: 500_000, quoteMicroUsd: 500_000 }];
    expect(await canUseAiVideo(cfg(), withGrant({}, spent), ADULT)).toBe(false);
  });
  it('hak yok: kapi kapali', async () => {
    expect(await canUseAiVideo(cfg(), NO_GRANT, ADULT)).toBe(false);
  });
});

describe('canPreviewAiVideo (C33 pasif tanitim)', () => {
  it('minor: false (hakli olsa bile)', () => {
    expect(canPreviewAiVideo(cfg(), { isMinor: true })).toBe(false);
  });
  it('bayrak kapali: false', () => {
    expect(canPreviewAiVideo(cfg({ 'aiVideo.enabled': false }), { isMinor: false })).toBe(false);
  });
  it('yetiskin hakki yok: preview true, allowed false', async () => {
    const c = cfg();
    const adult = { id: 'u9', isMinor: false };
    expect(canPreviewAiVideo(c, adult)).toBe(true);
    expect(await canUseAiVideo(c, NO_GRANT, adult)).toBe(false);
  });
  it('yetiskin hakli: ikisi de true', async () => {
    expect(canPreviewAiVideo(cfg(), ADULT)).toBe(true);
    expect(await canUseAiVideo(cfg(), GRANTED, ADULT)).toBe(true);
  });
  it('guard davranisi degismedi: hakki olmayan yetiskin preview gorse de 403', async () => {
    const g = new AiVideoAccessGuard(
      cfg(),
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
  function run(config: any, user: any, granted = false) {
    const handler = function opts() {};
    Reflect.defineMetadata(AI_VIDEO_PREVIEW_OK, true, handler);
    const req: any = { user: { id: 'u9' } };
    const g = new AiVideoAccessGuard(
      config,
      {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
        ...(granted ? GRANTED : NO_GRANT),
      } as any,
      new Reflector(),
    );
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
    } as any;
    return { p: g.canActivate(ctx), req };
  }
  const c = cfg();
  it('hakki olmayan yetiskin: preview-ok uca girer, aiVideoAllowed false', async () => {
    const { p, req } = run(c, { id: 'u9', isMinor: false });
    await expect(p).resolves.toBe(true);
    expect(req.aiVideoAllowed).toBe(false);
  });
  it('hakli yetiskin: aiVideoAllowed true', async () => {
    const { p, req } = run(cfg(), { id: 'u1', isMinor: false }, true);
    await expect(p).resolves.toBe(true);
    expect(req.aiVideoAllowed).toBe(true);
  });
  it('minor: preview-ok uc de 403', async () => {
    await expect(run(c, { id: 'u9', isMinor: true }).p).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('bayrak kapali: 403', async () => {
    const off = cfg({ 'aiVideo.enabled': false });
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
  const prisma = (row: unknown, granted = false) =>
    ({
      user: { findUnique: jest.fn().mockResolvedValue(row) },
      ...(granted ? GRANTED : NO_GRANT),
    }) as any;

  it('izinli kullanici gecer', async () => {
    const g = new AiVideoAccessGuard(cfg(), prisma(ADULT, true), new Reflector());
    await expect(g.canActivate(ctx({ id: 'u1', isModerator: false }))).resolves.toBe(true);
  });
  it('moderator tek basina yetmez: jenerik 403 FORBIDDEN', async () => {
    const g = new AiVideoAccessGuard(cfg(), prisma({ id: 'm1', isMinor: false }), new Reflector());
    await expect(g.canActivate(ctx({ id: 'm1', isModerator: true }))).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });
  it('minor hakli olsa red; kullanici yoksa red', async () => {
    const minor = new AiVideoAccessGuard(
      cfg(),
      prisma({ id: 'u1', isMinor: true }, true),
      new Reflector(),
    );
    await expect(minor.canActivate(ctx({ id: 'u1' }))).rejects.toBeInstanceOf(ForbiddenException);
    const none = new AiVideoAccessGuard(cfg(), prisma(null), new Reflector());
    await expect(none.canActivate(ctx({ id: 'u1' }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(none.canActivate(ctx(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('C40 admin hakki (canUseAiVideo async)', () => {
  const NOT_LISTED = cfg();
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
    const off = cfg({ 'aiVideo.enabled': false });
    expect(await canUseAiVideo(off, prismaWith(grant()), U)).toBe(false);
    const noKey = cfg({ 'aiVideo.apiKey': '' });
    expect(await canUseAiVideo(noKey, prismaWith(grant()), U)).toBe(false);
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

describe('C44 kendi-verim uclari (hak istemez)', () => {
  function run(config: any, user: any, granted = false) {
    const handler = function own() {};
    Reflect.defineMetadata(AI_VIDEO_OWN_DATA, true, handler);
    const req: any = { user: { id: 'u9' } };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      aiVideoGrant: {
        findUnique: jest.fn().mockResolvedValue(granted ? GRANTED.aiVideoGrant : null),
      },
    } as any;
    const g = new AiVideoAccessGuard(config, prisma, new Reflector());
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
    } as any;
    return { p: g.canActivate(ctx), prisma };
  }
  it('hakki biten / hic olmayan yetiskin gecer; hak sorgulanmaz', async () => {
    const { p, prisma } = run(cfg(), { id: 'u9', isMinor: false });
    await expect(p).resolves.toBe(true);
    expect(prisma.aiVideoGrant.findUnique).not.toHaveBeenCalled();
  });
  it('apiKey bos olsa da gecer (hak/anahtar istemez, yalniz bayrak)', async () => {
    await expect(run(cfg({ 'aiVideo.apiKey': '' }), { id: 'u9', isMinor: false }).p).resolves.toBe(
      true,
    );
  });
  it('minor red (hakli olsa bile)', async () => {
    await expect(run(cfg(), { id: 'u9', isMinor: true }, true).p).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('bayrak kapali red', async () => {
    const off = cfg({ 'aiVideo.enabled': false });
    await expect(run(off, { id: 'u9', isMinor: false }, true).p).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('kullanici yok red', async () => {
    await expect(run(cfg(), null).p).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('C44 uc -> kapi haritasi (controller metadata)', () => {
  const proto = AiVideoController.prototype as any;
  const own = (name: string) => Reflect.getMetadata(AI_VIDEO_OWN_DATA, proto[name]) === true;
  it('para harcayan uc uc hak kapisinda kalir (isaretsiz)', () => {
    for (const n of ['presign', 'estimate', 'create']) expect(own(n)).toBe(false);
  });
  it('options hak istemeyen onizleme ucu, kendi-verim degil', () => {
    expect(own('options')).toBe(false);
    expect(Reflect.getMetadata(AI_VIDEO_PREVIEW_OK, proto.options)).toBe(true);
  });
  it('liste/oku/ek/sil ucleri hak istemez', () => {
    for (const n of ['list', 'get', 'attachment', 'deleteAll', 'deleteOne'])
      expect(own(n)).toBe(true);
  });
});
