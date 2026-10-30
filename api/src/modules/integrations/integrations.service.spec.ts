import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { IntegrationsService } from './integrations.service';
import { StreamProvidersRegistry } from './stream-providers.registry';

function makeProvider(key: 'kick' | 'twitch', enabled = true, pkce = true) {
  return {
    key,
    db: key === 'kick' ? 'KICK' : 'TWITCH',
    usesPkce: pkce,
    isEnabled: () => enabled,
    buildAuthorizeUrl: jest.fn(
      (state: string, challenge: string | null) => `https://idp/${key}?s=${state}&c=${challenge}`,
    ),
    identify: jest.fn().mockResolvedValue({ externalId: 'ext-1', username: 'Yayinci' }),
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    listSubscriptions: jest.fn().mockResolvedValue([]),
    channelUrl: (u: string) => `https://${key}/${u}`,
  };
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: '7' });
const p2025 = () =>
  new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: '7' });

describe('IntegrationsService (C36 §2)', () => {
  let kick: ReturnType<typeof makeProvider>;
  let twitch: ReturnType<typeof makeProvider>;
  let prisma: {
    user: { findUnique: jest.Mock };
    externalAccount: Record<string, jest.Mock>;
    externalLinkState: Record<string, jest.Mock>;
    streamAnnounceOptIn: { deleteMany: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: IntegrationsService;

  const stateRow = (over: Record<string, unknown> = {}) => ({
    id: 'st',
    userId: 'u1',
    provider: 'KICK',
    codeVerifier: 'verifier',
    expiresAt: new Date(Date.now() + 60_000),
    ...over,
  });

  beforeEach(() => {
    kick = makeProvider('kick');
    twitch = makeProvider('twitch', false, false);
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ isMinor: false }) },
      externalAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'acc-1', externalId: 'ext-1' }),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      externalLinkState: {
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue(stateRow()),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      streamAnnounceOptIn: { deleteMany: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    const registry = new StreamProvidersRegistry(kick as never, twitch as never);
    service = new IntegrationsService(prisma as never, registry);
  });

  describe('startLink', () => {
    it('bayrağı kapalı sağlayıcı 404, bilinmeyen sağlayıcı 404', async () => {
      await expect(service.startLink('u1', 'twitch')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.startLink('u1', 'steam')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('minör 403 MINOR_NOT_ALLOWED ve state yazılmaz', async () => {
      prisma.user.findUnique.mockResolvedValue({ isMinor: true });
      const err = await service.startLink('u1', 'kick').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        error: 'MINOR_NOT_ALLOWED',
      });
      expect(prisma.externalLinkState.create).not.toHaveBeenCalled();
    });

    it('zaten bağlıysa 409 ALREADY_LINKED', async () => {
      prisma.externalAccount.findUnique.mockResolvedValue({ id: 'a' });
      await expect(service.startLink('u1', 'kick')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rastgele state + PKCE: challenge = base64url(sha256(verifier)), state tabloya yazılır', async () => {
      const { url } = await service.startLink('u1', 'kick');
      const data = prisma.externalLinkState.create.mock.calls[0][0].data as {
        id: string;
        codeVerifier: string;
        expiresAt: Date;
      };
      expect(data.id).toHaveLength(43); // 32 bayt base64url
      expect(data.codeVerifier.length).toBeGreaterThanOrEqual(43);
      const challenge = createHash('sha256').update(data.codeVerifier).digest('base64url');
      expect(url).toContain(`s=${data.id}`);
      expect(url).toContain(`c=${challenge}`);
      const ttl = data.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(9 * 60_000);
      expect(ttl).toBeLessThanOrEqual(10 * 60_000);
    });

    it('iki çağrı farklı state üretir', async () => {
      await service.startLink('u1', 'kick');
      await service.startLink('u1', 'kick');
      const ids = prisma.externalLinkState.create.mock.calls.map((c) => c[0].data.id as string);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it('PKCE desteklemeyen sağlayıcıda verifier boş, challenge null', async () => {
      twitch = makeProvider('twitch', true, false);
      service = new IntegrationsService(
        prisma as never,
        new StreamProvidersRegistry(kick as never, twitch as never),
      );
      await service.startLink('u1', 'twitch');
      expect(prisma.externalLinkState.create.mock.calls[0][0].data.codeVerifier).toBe('');
      expect(twitch.buildAuthorizeUrl).toHaveBeenCalledWith(expect.any(String), null);
    });
  });

  describe('completeLink', () => {
    it('başarı: hesap yazılır, token hiçbir create çağrısında yok, abonelik açılır, audit düşer', async () => {
      await expect(service.completeLink('kick', 'code', 'st')).resolves.toBe('linked');
      expect(kick.identify).toHaveBeenCalledWith('code', 'verifier');
      const created = prisma.externalAccount.create.mock.calls[0][0].data;
      expect(Object.keys(created).sort()).toEqual(['externalId', 'provider', 'userId', 'username']);
      expect(kick.subscribe).toHaveBeenCalledWith('ext-1');
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'integration.link',
        metadata: { provider: 'kick' },
      });
    });

    it('state yok / bilinmiyor → error, kimlik okunmaz', async () => {
      prisma.externalLinkState.delete.mockRejectedValue(p2025());
      await expect(service.completeLink('kick', 'code', 'yok')).resolves.toBe('error');
      expect(kick.identify).not.toHaveBeenCalled();
    });

    it('ikinci kullanım: state ilk kullanımda silindi → error', async () => {
      await service.completeLink('kick', 'code', 'st');
      prisma.externalLinkState.delete.mockRejectedValueOnce(p2025());
      await expect(service.completeLink('kick', 'code', 'st')).resolves.toBe('error');
      expect(kick.identify).toHaveBeenCalledTimes(1);
    });

    it('süresi geçmiş state → error', async () => {
      prisma.externalLinkState.delete.mockResolvedValue(
        stateRow({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.completeLink('kick', 'code', 'st')).resolves.toBe('error');
      expect(kick.identify).not.toHaveBeenCalled();
    });

    it('state başka sağlayıcıya ait (yoldaki sağlayıcı uyuşmuyor) → error', async () => {
      prisma.externalLinkState.delete.mockResolvedValue(stateRow({ provider: 'TWITCH' }));
      await expect(service.completeLink('kick', 'code', 'st')).resolves.toBe('error');
      expect(kick.identify).not.toHaveBeenCalled();
    });

    it('callback anında kullanıcı minör işaretlenmiş → error, hesap yazılmaz', async () => {
      prisma.user.findUnique.mockResolvedValue({ isMinor: true });
      await expect(service.completeLink('kick', 'code', 'st')).resolves.toBe('error');
      expect(prisma.externalAccount.create).not.toHaveBeenCalled();
    });

    it('kullanıcı silinmiş → error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.completeLink('kick', 'code', 'st')).resolves.toBe('error');
    });

    it('kod yok (kullanıcı reddetti) → error; aşırı uzun state → error', async () => {
      await expect(service.completeLink('kick', undefined, 'st')).resolves.toBe('error');
      await expect(service.completeLink('kick', 'c', 'x'.repeat(500))).resolves.toBe('error');
      expect(prisma.externalLinkState.delete).not.toHaveBeenCalled();
    });

    it('dış hesap başka kullanıcıya bağlı → taken', async () => {
      prisma.externalAccount.create.mockRejectedValue(p2002());
      prisma.externalAccount.findUnique.mockResolvedValue({ userId: 'baska' });
      await expect(service.completeLink('kick', 'code', 'st')).resolves.toBe('taken');
      expect(kick.subscribe).not.toHaveBeenCalled();
    });

    it('platform kimlik okuyamazsa → error ve hesap yazılmaz', async () => {
      kick.identify.mockRejectedValue(new Error('boom'));
      await expect(service.completeLink('kick', 'code', 'st')).resolves.toBe('error');
      expect(prisma.externalAccount.create).not.toHaveBeenCalled();
    });

    it('abonelik açılamazsa bağlama yine başarılı (uzlaştırma düzeltir)', async () => {
      kick.subscribe.mockRejectedValue(new Error('down'));
      await expect(service.completeLink('kick', 'code', 'st')).resolves.toBe('linked');
    });

    it('bayrağı kapalı sağlayıcının callback ucu 404', async () => {
      await expect(service.completeLink('twitch', 'c', 's')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('unlink', () => {
    beforeEach(() => {
      prisma.externalAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        externalId: 'ext-1',
        provider: 'KICK',
      });
    });

    it('son hesap koparılınca opt-in kayıtları silinir, abonelik kapatılır', async () => {
      prisma.externalAccount.count.mockResolvedValue(0);
      kick.listSubscriptions.mockResolvedValue([
        { id: 'sub-1', externalId: 'ext-1', healthy: true },
        { id: 'sub-2', externalId: 'baska', healthy: true },
      ]);
      await service.unlink('u1', 'kick');
      expect(prisma.streamAnnounceOptIn.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(kick.unsubscribe).toHaveBeenCalledTimes(1);
      expect(kick.unsubscribe).toHaveBeenCalledWith('sub-1');
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('integration.unlink');
    });

    it('başka bağlı hesap kalırsa opt-in duruyor', async () => {
      prisma.externalAccount.count.mockResolvedValue(1);
      await service.unlink('u1', 'kick');
      expect(prisma.streamAnnounceOptIn.deleteMany).not.toHaveBeenCalled();
    });

    it('bağlı değilse 404', async () => {
      prisma.externalAccount.findUnique.mockResolvedValue(null);
      await expect(service.unlink('u1', 'kick')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
