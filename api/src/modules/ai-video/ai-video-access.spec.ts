import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { canPreviewAiVideo, canUseAiVideo } from './ai-video-access';
import { AiVideoAccessGuard } from './ai-video-access.guard';

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

describe('canUseAiVideo (R7 kapisi)', () => {
  it('bayrak + anahtar + liste + yetiskin: izin', () => {
    expect(canUseAiVideo(cfg(), ADULT)).toBe(true);
  });
  it('bayrak kapali: red', () => {
    expect(canUseAiVideo(cfg({ 'aiVideo.enabled': false }), ADULT)).toBe(false);
  });
  it('anahtar bos: red', () => {
    expect(canUseAiVideo(cfg({ 'aiVideo.apiKey': '' }), ADULT)).toBe(false);
  });
  it('listede degil: red (bos liste = kimse)', () => {
    expect(canUseAiVideo(cfg({ 'aiVideo.userIds': ['x'] }), ADULT)).toBe(false);
    expect(canUseAiVideo(cfg({ 'aiVideo.userIds': [] }), ADULT)).toBe(false);
  });
  it('minor: listede olsa bile red', () => {
    expect(canUseAiVideo(cfg(), { id: 'u1', isMinor: true })).toBe(false);
  });
});

describe('canPreviewAiVideo (C33 pasif tanitim)', () => {
  it('minor: false (listede olsa bile)', () => {
    expect(canPreviewAiVideo(cfg(), { isMinor: true })).toBe(false);
  });
  it('bayrak kapali: false', () => {
    expect(canPreviewAiVideo(cfg({ 'aiVideo.enabled': false }), { isMinor: false })).toBe(false);
  });
  it('yetiskin listede degil: preview true, allowed false', () => {
    const c = cfg({ 'aiVideo.userIds': ['x'] });
    const adult = { id: 'u9', isMinor: false };
    expect(canPreviewAiVideo(c, adult)).toBe(true);
    expect(canUseAiVideo(c, adult)).toBe(false);
  });
  it('yetiskin listede: ikisi de true', () => {
    expect(canPreviewAiVideo(cfg(), ADULT)).toBe(true);
    expect(canUseAiVideo(cfg(), ADULT)).toBe(true);
  });
  it('guard davranisi degismedi: listede olmayan yetiskin preview gorse de 403', async () => {
    const g = new AiVideoAccessGuard(cfg({ 'aiVideo.userIds': ['x'] }), {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u9', isMinor: false }) },
    } as any);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u9' } }) }) } as any;
    await expect(g.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AiVideoAccessGuard', () => {
  const ctx = (user: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
  const prisma = (row: unknown) =>
    ({ user: { findUnique: jest.fn().mockResolvedValue(row) } }) as any;

  it('izinli kullanici gecer', async () => {
    const g = new AiVideoAccessGuard(cfg(), prisma(ADULT));
    await expect(g.canActivate(ctx({ id: 'u1', isModerator: false }))).resolves.toBe(true);
  });
  it('moderator tek basina yetmez: jenerik 403 FORBIDDEN', async () => {
    const g = new AiVideoAccessGuard(cfg(), prisma({ id: 'm1', isMinor: false }));
    await expect(g.canActivate(ctx({ id: 'm1', isModerator: true }))).rejects.toMatchObject({
      response: { error: 'FORBIDDEN' },
    });
  });
  it('minor listede olsa red; kullanici yoksa red', async () => {
    const minor = new AiVideoAccessGuard(cfg(), prisma({ id: 'u1', isMinor: true }));
    await expect(minor.canActivate(ctx({ id: 'u1' }))).rejects.toBeInstanceOf(ForbiddenException);
    const none = new AiVideoAccessGuard(cfg(), prisma(null));
    await expect(none.canActivate(ctx({ id: 'u1' }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(none.canActivate(ctx(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
