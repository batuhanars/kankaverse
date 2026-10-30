import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { hashWebhookToken } from './webhook-token.util';

const NOW = new Date('2026-10-30T10:00:00Z');
const CREATOR = { id: 'u-creator', username: 'yapan' };

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'wh-1',
    guildId: 'g-1',
    channelId: 'ch-1',
    name: 'Bot',
    tokenHash: 'HASH-SECRET',
    createdById: CREATOR.id,
    createdBy: CREATOR,
    deletedAt: null,
    lastUsedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const CHANNEL = { id: 'ch-1', guildId: 'g-1', type: 'GUILD_TEXT', guild: { deletedAt: null } };

const prismaMock = {
  webhook: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  channel: { findFirst: jest.fn() },
  auditLog: { create: jest.fn() },
};
const membershipMock = { requireChannelAccess: jest.fn() };
const permissionsMock = { hasGuildPermission: jest.fn() };
const messagesMock = { assertSenderUnrestricted: jest.fn(), assertTextsAllowed: jest.fn() };
const configMock = {
  get: jest.fn((k: string) => (k === 'frontendUrl' ? 'https://kankaverse.com/' : undefined)),
};

let service: WebhooksService;

beforeEach(() => {
  jest.resetAllMocks();
  configMock.get.mockImplementation((k: string) =>
    k === 'frontendUrl' ? 'https://kankaverse.com/' : undefined,
  );
  permissionsMock.hasGuildPermission.mockResolvedValue(true);
  membershipMock.requireChannelAccess.mockResolvedValue(CHANNEL);
  messagesMock.assertSenderUnrestricted.mockResolvedValue(undefined);
  prismaMock.channel.findFirst.mockResolvedValue({ id: 'ch-1' });
  prismaMock.webhook.count.mockResolvedValue(0);
  prismaMock.webhook.create.mockImplementation(({ data }) => Promise.resolve(row(data)));
  prismaMock.webhook.update.mockImplementation(({ data }) => Promise.resolve(row(data)));
  prismaMock.auditLog.create.mockResolvedValue({});
  service = new WebhooksService(
    prismaMock as never,
    membershipMock as never,
    permissionsMock as never,
    messagesMock as never,
    configMock as never,
  );
});

describe('WebhooksService.resolveSender (§3.1-§3.2)', () => {
  const w = { guildId: 'g-1', channelId: 'ch-1', createdById: CREATOR.id };

  it('her şey uygun → ok + kanal', async () => {
    await expect(service.resolveSender(w)).resolves.toEqual({ ok: true, channel: CHANNEL });
    expect(permissionsMock.hasGuildPermission).toHaveBeenCalledWith(
      CREATOR.id,
      'g-1',
      'MANAGE_WEBHOOKS',
    );
    expect(messagesMock.assertSenderUnrestricted).toHaveBeenCalledWith(CREATOR.id, 'g-1');
  });

  it('oluşturan ortamdan/kanaldan ayrıldı (requireChannelAccess 403) → DISABLED', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.resolveSender(w)).resolves.toEqual({ ok: false, reason: 'DISABLED' });
  });

  it('MANAGE_WEBHOOKS izni alındı → DISABLED', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    await expect(service.resolveSender(w)).resolves.toEqual({ ok: false, reason: 'DISABLED' });
  });

  it('global ban / mute (assertSenderUnrestricted 403) → DISABLED', async () => {
    messagesMock.assertSenderUnrestricted.mockRejectedValue(new ForbiddenException());
    await expect(service.resolveSender(w)).resolves.toEqual({ ok: false, reason: 'DISABLED' });
  });

  it('kanal silinmiş (requireChannelAccess 404) → CHANNEL_GONE', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(new NotFoundException());
    await expect(service.resolveSender(w)).resolves.toEqual({ ok: false, reason: 'CHANNEL_GONE' });
  });

  it('kanal başka ortamda / metin değil / ortam silinmiş → CHANNEL_GONE', async () => {
    for (const ch of [
      { ...CHANNEL, guildId: 'baska' },
      { ...CHANNEL, type: 'GUILD_VOICE' },
      { ...CHANNEL, guild: { deletedAt: NOW } },
    ]) {
      membershipMock.requireChannelAccess.mockResolvedValue(ch);
      await expect(service.resolveSender(w)).resolves.toEqual({
        ok: false,
        reason: 'CHANNEL_GONE',
      });
    }
  });

  it('beklenmeyen hata yutulmaz', async () => {
    membershipMock.requireChannelAccess.mockRejectedValue(new Error('db'));
    await expect(service.resolveSender(w)).rejects.toThrow('db');
  });
});

describe('WebhooksService yönetim (§4)', () => {
  it('izinsiz kullanıcı her uçta 403 (MANAGE_WEBHOOKS yok)', async () => {
    permissionsMock.hasGuildPermission.mockResolvedValue(false);
    const calls = [
      () => service.list('u', 'g-1'),
      () => service.create('u', 'g-1', { channelId: 'ch-1', name: 'x' }),
      () => service.update('u', 'g-1', 'wh-1', { name: 'y' }),
      () => service.resetToken('u', 'g-1', 'wh-1'),
      () => service.remove('u', 'g-1', 'wh-1'),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(prismaMock.webhook.create).not.toHaveBeenCalled();
  });

  it('liste token ve özet döndürmez; oluşturan ve devre dışı bilgisi var', async () => {
    prismaMock.webhook.findMany.mockResolvedValue([row()]);
    const list = await service.list('u', 'g-1');
    expect(JSON.stringify(list)).not.toContain('HASH-SECRET');
    expect(list[0]).toEqual({
      id: 'wh-1',
      name: 'Bot',
      channelId: 'ch-1',
      createdBy: CREATOR,
      disabled: false,
      lastUsedAt: null,
      createdAt: NOW.toISOString(),
    });
    expect(list[0]).not.toHaveProperty('url');
  });

  it('oluşturanın izni alınmışsa listede disabled: true', async () => {
    prismaMock.webhook.findMany.mockResolvedValue([row()]);
    permissionsMock.hasGuildPermission.mockImplementation((uid: string) =>
      Promise.resolve(uid !== CREATOR.id),
    );
    const list = await service.list('admin', 'g-1');
    expect(list[0].disabled).toBe(true);
  });

  it('oluşturma: token yalnız cevapta (url), DB yalnız özet, AuditLog yazılır', async () => {
    const res = await service.create('u1', 'g-1', { channelId: 'ch-1', name: 'Derleme' });
    const created = prismaMock.webhook.create.mock.calls[0][0].data;
    const token = res.url.split('/').pop()!;

    expect(res.url).toBe(`https://kankaverse.com/api/webhooks/${res.id}/${token}`);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.tokenHash).toBe(hashWebhookToken(token));
    expect(JSON.stringify(created)).not.toContain(token);
    expect(created.createdById).toBe('u1');
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'u1',
        action: 'webhook.create',
        entityType: 'Webhook',
        metadata: { guildId: 'g-1', name: 'Derleme', channelId: 'ch-1' },
      }),
    });
    expect(res).not.toHaveProperty('tokenHash');
  });

  it('ayrılmış ad → 400 WEBHOOK_NAME_RESERVED, kayıt açılmaz', async () => {
    await expect(
      service.create('u1', 'g-1', { channelId: 'ch-1', name: 'Kankaverse Moderatör' }),
    ).rejects.toMatchObject({ response: { error: 'WEBHOOK_NAME_RESERVED' } });
    expect(prismaMock.webhook.create).not.toHaveBeenCalled();
  });

  it('kanal bu ortamın GUILD_TEXT kanalı değilse 404 (başka ortamın kanalı dahil)', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(null);
    await expect(
      service.create('u1', 'g-1', { channelId: 'baska-ortam-kanali', name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.channel.findFirst).toHaveBeenCalledWith({
      where: { id: 'baska-ortam-kanali', guildId: 'g-1', deletedAt: null, type: 'GUILD_TEXT' },
      select: { id: true },
    });
  });

  it('kanal başına 10 etkin webhook sınırı → 409', async () => {
    prismaMock.webhook.count.mockResolvedValue(10);
    await expect(
      service.create('u1', 'g-1', { channelId: 'ch-1', name: 'x' }),
    ).rejects.toMatchObject({ status: 409, response: { error: 'WEBHOOK_LIMIT_REACHED' } });
  });

  it('taşıma: başka ortamın kanalı reddedilir', async () => {
    prismaMock.webhook.findFirst.mockResolvedValue(row());
    prismaMock.channel.findFirst.mockResolvedValue(null);
    await expect(
      service.update('u1', 'g-1', 'wh-1', { channelId: 'baska' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.webhook.update).not.toHaveBeenCalled();
  });

  it('güncelleme AuditLog yazar', async () => {
    prismaMock.webhook.findFirst.mockResolvedValue(row());
    await service.update('u1', 'g-1', 'wh-1', { name: 'Yeni' });
    expect(prismaMock.auditLog.create.mock.calls[0][0].data.action).toBe('webhook.update');
  });

  it("başka ortamın / silinmiş webhook id'si 404 WEBHOOK_NOT_FOUND", async () => {
    prismaMock.webhook.findFirst.mockResolvedValue(null);
    await expect(service.remove('u1', 'g-1', 'x')).rejects.toMatchObject({
      response: { error: 'WEBHOOK_NOT_FOUND' },
    });
    expect(prismaMock.webhook.findFirst).toHaveBeenCalledWith({
      where: { id: 'x', guildId: 'g-1', deletedAt: null, kind: 'USER' },
    });
  });

  it('silme yumuşaktır (deletedAt) ve AuditLog yazar', async () => {
    prismaMock.webhook.findFirst.mockResolvedValue(row());
    await service.remove('u1', 'g-1', 'wh-1');
    expect(prismaMock.webhook.update).toHaveBeenCalledWith({
      where: { id: 'wh-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prismaMock.auditLog.create.mock.calls[0][0].data.action).toBe('webhook.delete');
  });

  describe('token yenileme + sahiplik devri (§4.4, R7)', () => {
    it('yeni özet yazılır, eski token geçersizleşir, createdById çağırana devredilir', async () => {
      prismaMock.webhook.findFirst.mockResolvedValue(row({ createdById: 'eski-sahip' }));
      const res = await service.resetToken('yeni-sahip', 'g-1', 'wh-1');
      const data = prismaMock.webhook.update.mock.calls[0][0].data;

      const token = res.url.split('/').pop()!;
      expect(data.tokenHash).toBe(hashWebhookToken(token));
      expect(data.tokenHash).not.toBe('HASH-SECRET');
      expect(data.createdById).toBe('yeni-sahip');
    });

    it('AuditLog eski ve yeni sahibi yazar', async () => {
      prismaMock.webhook.findFirst.mockResolvedValue(row({ createdById: 'eski-sahip' }));
      await service.resetToken('yeni-sahip', 'g-1', 'wh-1');
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'yeni-sahip',
          action: 'webhook.token_reset',
          metadata: expect.objectContaining({
            previousOwnerId: 'eski-sahip',
            newOwnerId: 'yeni-sahip',
          }),
        }),
      });
    });

    it('MANAGE_WEBHOOKS olmayan devralamaz (devir yetki sınamasının ARDINDAN)', async () => {
      permissionsMock.hasGuildPermission.mockResolvedValue(false);
      await expect(service.resetToken('sizma', 'g-1', 'wh-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prismaMock.webhook.update).not.toHaveBeenCalled();
    });
  });
});
