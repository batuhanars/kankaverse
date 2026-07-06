import { ForbiddenException } from '@nestjs/common';
import { VerifiedEmailGuard } from './verified-email.guard';

/**
 * C8 — avatar/afiş presign+set endpoint'leri VerifiedEmailGuard'a tabi (doğrulanmamış
 * hesap görsel yükleyemez; throwaway-hesap suistimalini kısar). Guard'ın kendisi
 * paylaşılan (users + guilds) olduğundan burada tek yerden test edilir.
 */
describe('VerifiedEmailGuard', () => {
  let guard: VerifiedEmailGuard;

  beforeEach(() => {
    guard = new VerifiedEmailGuard();
  });

  function makeContext(user: { emailVerifiedAt?: Date | null } | undefined) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  it('emailVerifiedAt dolu → canActivate true döner', () => {
    const ctx = makeContext({ emailVerifiedAt: new Date('2026-01-01T00:00:00Z') });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('emailVerifiedAt null → ForbiddenException EMAIL_NOT_VERIFIED', () => {
    const ctx = makeContext({ emailVerifiedAt: null });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    try {
      guard.canActivate(ctx);
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toMatchObject({ error: 'EMAIL_NOT_VERIFIED' });
    }
  });

  it('user tanımsız (guard sırası bozulursa) → ForbiddenException EMAIL_NOT_VERIFIED', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
