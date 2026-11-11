import { ExecutionContext } from '@nestjs/common';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2eeController } from './e2ee.controller';
import { UserThrottlerGuard } from './user-throttler.guard';

function config(values: Record<string, unknown>) {
  return { get: (k: string) => values[k] } as never;
}

function ctx(user: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as never;
}

describe('E2eeFlagService (§2.2)', () => {
  it('bayrak kapalıyken kimse uygun değil', () => {
    const f = new E2eeFlagService(config({ e2eeEnabled: false, e2eeUserIds: [] }));
    expect(f.enabled).toBe(false);
    expect(f.isEligible('u1')).toBe(false);
  });

  it('bayrak açık + liste dolu → yalnız listedekiler', () => {
    const f = new E2eeFlagService(config({ e2eeEnabled: true, e2eeUserIds: ['u1'] }));
    expect(f.isEligible('u1')).toBe(true);
    expect(f.isEligible('u2')).toBe(false);
  });

  it('bayrak açık + liste boş → herkes (prod kapısı: §0 öncesi YASAK)', () => {
    const f = new E2eeFlagService(config({ e2eeEnabled: true, e2eeUserIds: [] }));
    expect(f.isEligible('anyone')).toBe(true);
  });
});

describe('E2eeEnabledGuard', () => {
  const prisma = { e2eeDevice: { findUnique: jest.fn() } };
  const make = (eligible: boolean) =>
    new E2eeEnabledGuard({ isEligible: () => eligible } as never, prisma as never);
  const USER = { id: 'u1', tokenFamily: 'fam' };

  beforeEach(() => jest.resetAllMocks());

  it('bayrak kapalı/uygun değil → 404 E2EE_DISABLED', async () => {
    await expect(make(false).canActivate(ctx(USER))).rejects.toMatchObject({
      status: 404,
      response: { error: 'E2EE_DISABLED' },
    });
  });

  it('iptal edilmiş cihazın zinciri → 403 E2EE_DEVICE_REQUIRED', async () => {
    prisma.e2eeDevice.findUnique.mockResolvedValue({ revokedAt: new Date() });
    await expect(make(true).canActivate(ctx(USER))).rejects.toMatchObject({
      status: 403,
      response: { error: 'E2EE_DEVICE_REQUIRED' },
    });
  });

  it('cihaz yok (henüz kayıt olmamış) ya da etkin → geçer', async () => {
    prisma.e2eeDevice.findUnique.mockResolvedValueOnce(null);
    await expect(make(true).canActivate(ctx(USER))).resolves.toBe(true);
    prisma.e2eeDevice.findUnique.mockResolvedValueOnce({ revokedAt: null });
    await expect(make(true).canActivate(ctx(USER))).resolves.toBe(true);
  });
});

describe('GET /e2ee/status', () => {
  it('kapalıyken de 404 değil, { enabled:false } döner', () => {
    const c = new E2eeController(
      new E2eeFlagService(config({ e2eeEnabled: false, e2eeUserIds: [] })),
      null as never,
      null as never,
      null as never,
    );
    expect(c.status({ id: 'u1' } as never)).toEqual({ enabled: false, franking: false, backup: false });
  });

  it('E4: franking bayrağı E2EE_FRANKING ile açılır, varsayılan false', () => {
    const make = (cfg: Record<string, unknown>) =>
      new E2eeController(
        new E2eeFlagService(config({ e2eeEnabled: true, e2eeUserIds: [], ...cfg })),
        null as never,
        null as never,
        null as never,
      );
    expect(make({}).status({ id: 'u1' } as never)).toEqual({
      enabled: true,
      franking: false,
      backup: false,
    });
    expect(make({ e2eeFranking: true }).status({ id: 'u1' } as never)).toEqual({
      enabled: true,
      franking: true,
      backup: false,
    });
  });

  it('E5a: backup bayrağı E2EE_BACKUP ile açılır ve uygunluk ister', () => {
    const make = (cfg: Record<string, unknown>) =>
      new E2eeController(
        new E2eeFlagService(config({ e2eeEnabled: true, e2eeUserIds: ['u1'], ...cfg })),
        null as never,
        null as never,
        null as never,
      );
    expect(make({ e2eeBackup: true }).status({ id: 'u1' } as never).backup).toBe(true);
    expect(make({ e2eeBackup: true }).status({ id: 'u2' } as never).backup).toBe(false);
  });
});

describe('UserThrottlerGuard', () => {
  it('izleyici kullanıcı kimliği (IP değil); kullanıcı yoksa IP', async () => {
    const guard = Object.create(UserThrottlerGuard.prototype) as {
      getTracker(req: unknown): Promise<string>;
    };
    await expect(guard.getTracker({ user: { id: 'u1' }, ip: '1.2.3.4' })).resolves.toBe('u1');
    await expect(guard.getTracker({ ip: '1.2.3.4' })).resolves.toBe('1.2.3.4');
  });
});
