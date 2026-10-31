import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AiVideoBalanceController } from './ai-video-balance.controller';
import { AiVideoBalanceService } from './ai-video-balance.service';
import { AiVideoGrantsService } from './ai-video-grants.service';
import { PikaClient } from './pika.client';

const DAY = 86_400_000;

function setup(balanceMicro: number | Error, grants: unknown[] = [], gens: unknown[] = []) {
  const pika = {
    getBalance: jest
      .fn()
      .mockImplementation(() =>
        balanceMicro instanceof Error
          ? Promise.reject(balanceMicro)
          : Promise.resolve({ balanceMicroUsd: balanceMicro }),
      ),
  };
  const prisma = {
    aiVideoGrant: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            grants.filter((g: any) => !where?.revokedAt === undefined || g.revokedAt === null),
          ),
        ),
    },
    aiVideoGeneration: { findMany: jest.fn().mockResolvedValue(gens) },
  };
  const config = { get: () => undefined };
  const grantsSvc = new AiVideoGrantsService(prisma as any, config as any);
  const service = new AiVideoBalanceService(
    pika as unknown as PikaClient,
    grantsSvc,
    config as any,
  );
  return { pika, prisma, service };
}

const grant = (over: object = {}) => ({
  userId: 'u1',
  startsAt: new Date(Date.now() - DAY),
  expiresAt: null,
  revokedAt: null,
  budgetMicroUsd: 1_000_000,
  ...over,
});

describe('AiVideoBalanceService (C45)', () => {
  it('mikro-USD -> USD, kredi asagi yuvarlanir', async () => {
    const { service } = setup(41_279_999);
    const r = await service.get();
    expect(r.balanceUsd).toBeCloseTo(41.279999);
    expect(r.balanceCredits).toBe(4127);
    expect(new Date(r.fetchedAt).toString()).not.toBe('Invalid Date');
  });

  it('outstanding: iptal/bitmis/suresi dolmus 0, etkin kalan toplanir', async () => {
    const spent = [{ status: 'COMPLETED', costMicroUsd: 400_000, quoteMicroUsd: 400_000 }];
    const { service } = setup(
      10_000_000,
      [
        grant(), // 1_000_000 - 400_000 = 600_000
        grant({ userId: 'u2', revokedAt: new Date() }),
        grant({ userId: 'u3', expiresAt: new Date(Date.now() - 1000) }),
        grant({ userId: 'u4', budgetMicroUsd: 400_000 }), // harcandi: bitmis
      ],
      spent,
    );
    // u1 icin 600_000 (60 kredi); u4 bitmis; u2 filtrede; u3 suresi dolmus
    expect((await service.get()).outstandingCredits).toBe(60);
  });

  it("60 sn onbellek: ikinci cagri Pika'ya gitmez", async () => {
    const { pika, service } = setup(1_000_000);
    const a = await service.get();
    const b = await service.get();
    expect(pika.getBalance).toHaveBeenCalledTimes(1);
    expect(b.fetchedAt).toBe(a.fetchedAt);
  });

  it('Pika hatasi: 503 AI_VIDEO_PROVIDER_ERROR, hata onbellege alinmaz', async () => {
    const { pika, service } = setup(new Error('Pika 500'));
    await expect(service.get()).rejects.toMatchObject({
      status: 503,
      response: { error: 'AI_VIDEO_PROVIDER_ERROR' },
    });
    await expect(service.get()).rejects.toBeDefined();
    expect(pika.getBalance).toHaveBeenCalledTimes(2);
  });

  it('uc yalniz platform adminine acik (guard)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AiVideoBalanceController) as unknown[];
    expect(guards).toContain(PlatformAdminGuard);
  });
});

describe('PikaClient.getBalance', () => {
  afterEach(() => jest.restoreAllMocks());
  const client = () =>
    new PikaClient({
      get: (k: string) => (k === 'aiVideo.apiKey' ? 'SECRET' : 'https://p'),
    } as any);

  it('balance_micro_usd okur, anahtar yalniz basliktadir', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ balance_micro_usd: 5_000_000, postpaid: null }),
    } as any);
    await expect(client().getBalance()).resolves.toEqual({ balanceMicroUsd: 5_000_000 });
    expect(spy.mock.calls[0][0]).toBe('https://p/billing/balance');
    expect((spy.mock.calls[0][1] as any).headers['X-API-Key']).toBe('SECRET');
  });

  it('hata mesaji anahtar icermez', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 401,
      json: () => Promise.resolve({ message: 'bad key' }),
    } as any);
    const err = await client()
      .getBalance()
      .catch((e) => e as Error);
    expect(err.message).toBe('Pika 401: bad key');
    expect(err.message).not.toContain('SECRET');
  });
});
