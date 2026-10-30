import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StreamAnnounceConfigService } from './stream-announce-config.service';

describe('StreamAnnounceConfigService (C36 §4)', () => {
  let prisma: Record<string, Record<string, jest.Mock> | jest.Mock>;
  let membership: { requireChannelAccess: jest.Mock; requireGuildMembership: jest.Mock };
  let permissions: { hasGuildPermission: jest.Mock };
  let service: StreamAnnounceConfigService;

  beforeEach(() => {
    const tx = {
      webhook: {
        create: jest.fn().mockResolvedValue({ id: 'wh-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      streamAnnounceConfig: {
        create: jest.fn().mockImplementation(({ data }: { data: object }) => Promise.resolve(data)),
        update: jest.fn().mockImplementation(({ data }: { data: object }) => Promise.resolve(data)),
      },
    };
    prisma = {
      channel: { findFirst: jest.fn().mockResolvedValue({ id: 'ch-1' }) },
      role: { findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
      streamAnnounceConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn(),
      },
      webhook: { update: jest.fn() },
      streamAnnounceOptIn: { upsert: jest.fn(), deleteMany: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ isMinor: false }) },
      externalAccount: { count: jest.fn().mockResolvedValue(1) },
      auditLog: { create: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((arg: unknown) =>
          typeof arg === 'function' ? (arg as (t: unknown) => unknown)(tx) : Promise.all(arg as []),
        ),
      __tx: tx as unknown as Record<string, jest.Mock>,
    } as never;
    membership = {
      requireChannelAccess: jest.fn().mockResolvedValue({}),
      requireGuildMembership: jest.fn().mockResolvedValue({}),
    };
    permissions = { hasGuildPermission: jest.fn().mockResolvedValue(true) };
    service = new StreamAnnounceConfigService(
      prisma as never,
      membership as never,
      permissions as never,
    );
  });

  const tx = () => (prisma as unknown as { __tx: Record<string, Record<string, jest.Mock>> }).__tx;

  it('MANAGE_WEBHOOKS yoksa PUT/GET/DELETE 403', async () => {
    permissions.hasGuildPermission.mockResolvedValue(false);
    await expect(service.get('u', 'g')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.put('u', 'g', { channelId: 'ch-1', enabled: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('u', 'g')).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.hasGuildPermission).toHaveBeenCalledWith('u', 'g', 'MANAGE_WEBHOOKS');
  });

  it('ilk PUT STREAM_ANNOUNCE webhook\'u oluşturur (ad "Yayın Duyurusu", oluşturan çağıran, token hash rastgele)', async () => {
    const res = await service.put('admin', 'g', { channelId: 'ch-1', enabled: true });
    const data = tx().webhook.create.mock.calls[0][0].data as Record<string, string>;
    expect(data).toMatchObject({
      kind: 'STREAM_ANNOUNCE',
      name: 'Yayın Duyurusu',
      createdById: 'admin',
      guildId: 'g',
    });
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res).toEqual({ channelId: 'ch-1', mentionRoleId: null, enabled: true });
    expect(
      (prisma.auditLog as unknown as { create: jest.Mock }).create.mock.calls[0][0].data.action,
    ).toBe('stream_announce.update');
  });

  it("sonraki PUT mevcut webhook'u günceller ve sorumluluğu çağırana devreder", async () => {
    (prisma.streamAnnounceConfig as Record<string, jest.Mock>).findUnique.mockResolvedValue({
      webhookId: 'wh-1',
      channelId: 'ch-0',
    });
    await service.put('admin2', 'g', { channelId: 'ch-1', enabled: false });
    expect(tx().webhook.create).not.toHaveBeenCalled();
    expect(tx().webhook.update.mock.calls[0][0].data).toEqual({
      channelId: 'ch-1',
      createdById: 'admin2',
    });
  });

  it('devir AuditLog metadata içinde eski ve yeni sahip var', async () => {
    (prisma.streamAnnounceConfig as Record<string, jest.Mock>).findUnique.mockResolvedValue({
      webhookId: 'wh-1',
      channelId: 'ch-0',
      createdById: 'eski-admin',
    });
    await service.put('yeni-admin', 'g', { channelId: 'ch-1', enabled: true });
    const meta = (prisma.auditLog as unknown as { create: jest.Mock }).create.mock.calls[0][0].data
      .metadata;
    expect(meta).toMatchObject({ previousOwnerId: 'eski-admin', newOwnerId: 'yeni-admin' });
  });

  it('kanal bu ortamın metin kanalı değilse 404', async () => {
    (prisma.channel as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
    await expect(service.put('u', 'g', { channelId: 'x', enabled: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rol bu ortamın değilse (ya da @everyone ise) 404', async () => {
    (prisma.role as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
    await expect(
      service.put('u', 'g', { channelId: 'ch-1', mentionRoleId: 'r-baska', enabled: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const where = (prisma.role as Record<string, jest.Mock>).findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ guildId: 'g', isEveryone: false });
  });

  it("DELETE webhook'u yumuşak siler ve ayarı kaldırır", async () => {
    (prisma.streamAnnounceConfig as Record<string, jest.Mock>).findUnique.mockResolvedValue({
      webhookId: 'wh-1',
      channelId: 'ch-1',
    });
    await service.remove('u', 'g');
    expect(
      (prisma.webhook as Record<string, jest.Mock>).update.mock.calls[0][0].data.deletedAt,
    ).toBeInstanceOf(Date);
    expect((prisma.streamAnnounceConfig as Record<string, jest.Mock>).delete).toHaveBeenCalled();
  });

  describe('opt-in (§4.3)', () => {
    it('başarı: üye + yetişkin + bağlı hesap → kayıt', async () => {
      await service.optIn('u', 'g');
      expect((prisma.streamAnnounceOptIn as Record<string, jest.Mock>).upsert).toHaveBeenCalled();
      expect(membership.requireGuildMembership).toHaveBeenCalledWith('u', 'g');
    });

    it('minör 403', async () => {
      (prisma.user as Record<string, jest.Mock>).findUnique.mockResolvedValue({ isMinor: true });
      await expect(service.optIn('u', 'g')).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        (prisma.streamAnnounceOptIn as Record<string, jest.Mock>).upsert,
      ).not.toHaveBeenCalled();
    });

    it('bağlı hesap yoksa 400 NO_LINKED_ACCOUNT', async () => {
      (prisma.externalAccount as Record<string, jest.Mock>).count.mockResolvedValue(0);
      await expect(service.optIn('u', 'g')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('üye değilse requireGuildMembership hatası geçer', async () => {
      membership.requireGuildMembership.mockRejectedValue(new ForbiddenException());
      await expect(service.optIn('u', 'g')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
