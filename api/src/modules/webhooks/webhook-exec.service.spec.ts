import { ForbiddenException, HttpException } from '@nestjs/common';
import { WebhookExecService } from './webhook-exec.service';
import { WebhookRateLimiter } from './webhook-rate-limiter';
import { generateWebhookToken } from './webhook-token.util';

const { token: TOKEN, tokenHash: HASH } = generateWebhookToken();

const WEBHOOK = {
  id: 'wh-1',
  guildId: 'g-1',
  channelId: 'ch-1',
  name: 'Derleme Botu',
  tokenHash: HASH,
  createdById: 'creator-1',
  deletedAt: null as Date | null,
  lastUsedAt: null as Date | null,
  kind: 'USER' as 'USER' | 'STREAM_ANNOUNCE',
};
const CHANNEL = { id: 'ch-1', guildId: 'g-1', type: 'GUILD_TEXT', guild: { deletedAt: null } };

const prismaMock = {
  webhook: { findUnique: jest.fn(), updateMany: jest.fn() },
};
const webhooksMock = { resolveSender: jest.fn() };
const messagesMock = {
  assertTextsAllowed: jest.fn(),
  resolveMentions: jest.fn(),
  createWebhookMessage: jest.fn(),
};
const gatewayMock = {
  broadcastMessage: jest.fn(),
  notifyChannelActivity: jest.fn().mockResolvedValue(undefined),
  notifyMentions: jest.fn().mockResolvedValue(undefined),
};

let limiter: WebhookRateLimiter;
let service: WebhookExecService;

beforeEach(() => {
  jest.resetAllMocks();
  prismaMock.webhook.findUnique.mockResolvedValue({ ...WEBHOOK });
  prismaMock.webhook.updateMany.mockResolvedValue({ count: 1 });
  webhooksMock.resolveSender.mockResolvedValue({ ok: true, channel: CHANNEL });
  messagesMock.resolveMentions.mockResolvedValue({
    mentions: [],
    mentionsEveryone: false,
    mentionRoles: [],
  });
  messagesMock.createWebhookMessage.mockResolvedValue({ id: 'msg-1', author: { id: 'wh-1' } });
  gatewayMock.notifyChannelActivity.mockResolvedValue(undefined);
  gatewayMock.notifyMentions.mockResolvedValue(undefined);
  limiter = new WebhookRateLimiter();
  service = new WebhookExecService(
    prismaMock as never,
    webhooksMock as never,
    messagesMock as never,
    gatewayMock as never,
    limiter,
  );
});

async function errorOf(p: Promise<unknown>): Promise<HttpException> {
  try {
    await p;
  } catch (err) {
    return err as HttpException;
  }
  throw new Error('hata bekleniyordu');
}
const codeOf = (e: HttpException) => (e.getResponse() as { error: string }).error;

describe('WebhookExecService.execute — C36 sistem yönetimli webhook', () => {
  it('STREAM_ANNOUNCE türü doğru token ile bile 404 WEBHOOK_NOT_FOUND', async () => {
    prismaMock.webhook.findUnique.mockResolvedValue({ ...WEBHOOK, kind: 'STREAM_ANNOUNCE' });
    const err = await errorOf(service.execute('wh-1', TOKEN, { content: 'x' }, '1.1.1.1'));
    expect(err.getStatus()).toBe(404);
    expect(codeOf(err)).toBe('WEBHOOK_NOT_FOUND');
    expect(messagesMock.createWebhookMessage).not.toHaveBeenCalled();
  });
});

describe('WebhookExecService.execute — token (§2.2)', () => {
  it('doğru token → mesaj yazılır, { id } döner, yayın yapılır', async () => {
    const res = await service.execute('wh-1', TOKEN, { content: 'merhaba' }, '1.1.1.1');
    expect(res).toEqual({ id: 'msg-1' });
    expect(messagesMock.createWebhookMessage).toHaveBeenCalledWith(
      CHANNEL,
      expect.objectContaining({
        creatorId: 'creator-1',
        webhookId: 'wh-1',
        webhookName: 'Derleme Botu',
        content: 'merhaba',
      }),
    );
    expect(gatewayMock.broadcastMessage).toHaveBeenCalledWith('ch-1', expect.anything());
  });

  it('yanlış token, silinmiş webhook, olmayan webhook: HEPSİ aynı 404 WEBHOOK_NOT_FOUND', async () => {
    const wrong = await errorOf(service.execute('wh-1', 'yanlis', { content: 'x' }, 'ip'));

    prismaMock.webhook.findUnique.mockResolvedValue({ ...WEBHOOK, deletedAt: new Date() });
    const deleted = await errorOf(service.execute('wh-1', TOKEN, { content: 'x' }, 'ip'));

    prismaMock.webhook.findUnique.mockResolvedValue(null);
    const missing = await errorOf(service.execute('nope', TOKEN, { content: 'x' }, 'ip'));

    for (const e of [wrong, deleted, missing]) {
      expect(e.getStatus()).toBe(404);
      expect(codeOf(e)).toBe('WEBHOOK_NOT_FOUND');
    }
    expect(wrong.getResponse()).toEqual(deleted.getResponse());
    expect(wrong.getResponse()).toEqual(missing.getResponse());
    expect(messagesMock.createWebhookMessage).not.toHaveBeenCalled();
  });
});

describe('WebhookExecService.execute — hız sınırı (§2.7)', () => {
  it('webhook başına 2 sn içinde 5 geçer, 6. 429 WEBHOOK_RATE_LIMITED + retryAfter', async () => {
    for (let i = 0; i < 5; i++) await service.execute('wh-1', TOKEN, { content: 'x' }, `ip${i}`);
    const err = await errorOf(service.execute('wh-1', TOKEN, { content: 'x' }, 'ip9'));
    expect(err.getStatus()).toBe(429);
    expect(codeOf(err)).toBe('WEBHOOK_RATE_LIMITED');
    expect((err.getResponse() as { retryAfter: number }).retryAfter).toBeGreaterThan(0);
  });

  it('IP başına dakikada 60; yanlış token denemeleri de sayılır', async () => {
    for (let i = 0; i < 60; i++) {
      await errorOf(service.execute('wh-1', 'yanlis', { content: 'x' }, '9.9.9.9'));
    }
    const err = await errorOf(service.execute('wh-1', 'yanlis', { content: 'x' }, '9.9.9.9'));
    expect(err.getStatus()).toBe(429);
    expect(codeOf(err)).toBe('WEBHOOK_RATE_LIMITED');
  });

  it('yanlış token başkasının webhook kovasını yakmaz', async () => {
    for (let i = 0; i < 10; i++) {
      await errorOf(service.execute('wh-1', 'yanlis', { content: 'x' }, `ip${i}`));
    }
    await expect(service.execute('wh-1', TOKEN, { content: 'x' }, 'ipX')).resolves.toBeDefined();
  });
});

describe('WebhookExecService.execute — gövde (§2.4-§2.5)', () => {
  it('bilinmeyen alanlar 400 vermez; avatar_url/tts/flags/components yok sayılır', async () => {
    await service.execute(
      'wh-1',
      TOKEN,
      {
        content: 'x',
        avatar_url: 'https://evil.test/a.png',
        tts: true,
        flags: 4,
        thread_id: '1',
        components: [],
        whatever: { a: 1 },
      },
      'ip',
    );
    const data = messagesMock.createWebhookMessage.mock.calls[0][1];
    expect(JSON.stringify(data)).not.toContain('evil.test');
    expect(Object.keys(data).sort()).toEqual(
      [
        'content',
        'creatorId',
        'embeds',
        'mentionRoles',
        'mentionsEveryone',
        'webhookId',
        'webhookName',
      ].sort(),
    );
  });

  it('embed görselleri atılır', async () => {
    await service.execute(
      'wh-1',
      TOKEN,
      { embeds: [{ title: 't', image: { url: 'https://evil.test/i.png' } }] },
      'ip',
    );
    const data = messagesMock.createWebhookMessage.mock.calls[0][1];
    expect(data.embeds).toEqual([{ title: 't' }]);
  });

  it('content ve embeds boş → 400 EMPTY_MESSAGE', async () => {
    for (const body of [{}, { content: '   ' }, { content: '', embeds: [] }]) {
      const err = await errorOf(service.execute('wh-1', TOKEN, body, `ip${Math.random()}`));
      expect(err.getStatus()).toBe(400);
      expect(codeOf(err)).toBe('EMPTY_MESSAGE');
    }
  });

  it('content 2001 karakter → 400', async () => {
    const err = await errorOf(service.execute('wh-1', TOKEN, { content: 'x'.repeat(2001) }, 'ip'));
    expect(err.getStatus()).toBe(400);
  });

  it('embed sınır aşımı → 400 INVALID_EMBED', async () => {
    const err = await errorOf(
      service.execute('wh-1', TOKEN, { embeds: [{ title: 'x'.repeat(257) }] }, 'ip'),
    );
    expect(codeOf(err)).toBe('INVALID_EMBED');
  });

  it('gövde nesne değil → 400', async () => {
    const err = await errorOf(service.execute('wh-1', TOKEN, [1, 2], 'ip'));
    expect(err.getStatus()).toBe(400);
  });

  it('username webhook adını bu mesaj için ezer (anlık görüntü webhookName)', async () => {
    await service.execute('wh-1', TOKEN, { content: 'x', username: 'GitHub' }, 'ip');
    expect(messagesMock.createWebhookMessage.mock.calls[0][1].webhookName).toBe('GitHub');
  });

  it('boş username yok sayılır (webhook adı kullanılır); 33 karakter 400', async () => {
    await service.execute('wh-1', TOKEN, { content: 'x', username: '  ' }, 'ip');
    expect(messagesMock.createWebhookMessage.mock.calls[0][1].webhookName).toBe('Derleme Botu');
    const err = await errorOf(
      service.execute('wh-1', TOKEN, { content: 'x', username: 'a'.repeat(33) }, 'ip2'),
    );
    expect(err.getStatus()).toBe(400);
  });

  it('ayrılmış username → 400 WEBHOOK_NAME_RESERVED (Türkçe varyantlar dahil)', async () => {
    for (const username of ['Kankaverse', 'Moderatör', 'YÖNETİCİ', 'sistem uyarısı']) {
      const err = await errorOf(
        service.execute('wh-1', TOKEN, { content: 'x', username }, `ip${username}`),
      );
      expect(codeOf(err)).toBe('WEBHOOK_NAME_RESERVED');
    }
    expect(messagesMock.createWebhookMessage).not.toHaveBeenCalled();
  });
});

describe('WebhookExecService.execute — kapılar (§3)', () => {
  it('oluşturan devre dışı (ayrıldı / izin alındı / ban / mute) → 403 WEBHOOK_DISABLED', async () => {
    webhooksMock.resolveSender.mockResolvedValue({ ok: false, reason: 'DISABLED' });
    const err = await errorOf(service.execute('wh-1', TOKEN, { content: 'x' }, 'ip'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(codeOf(err)).toBe('WEBHOOK_DISABLED');
    expect(messagesMock.createWebhookMessage).not.toHaveBeenCalled();
  });

  it('kanal silinmiş → 404', async () => {
    webhooksMock.resolveSender.mockResolvedValue({ ok: false, reason: 'CHANNEL_GONE' });
    const err = await errorOf(service.execute('wh-1', TOKEN, { content: 'x' }, 'ip'));
    expect(err.getStatus()).toBe(404);
  });

  it('automod content + username + embed metinlerini tek tek denetler', async () => {
    await service.execute(
      'wh-1',
      TOKEN,
      {
        content: 'icerik',
        username: 'Ad',
        embeds: [{ title: 'baslik', fields: [{ name: 'fn', value: 'fv' }] }],
      },
      'ip',
    );
    expect(messagesMock.assertTextsAllowed).toHaveBeenCalledWith([
      'icerik',
      'Ad',
      'baslik',
      'fn',
      'fv',
    ]);
  });

  it('automod takılırsa mesaj yazılmaz', async () => {
    messagesMock.assertTextsAllowed.mockImplementation(() => {
      throw new HttpException({ error: 'MESSAGE_BLOCKED' }, 400);
    });
    const err = await errorOf(service.execute('wh-1', TOKEN, { content: 'x' }, 'ip'));
    expect(codeOf(err)).toBe('MESSAGE_BLOCKED');
    expect(messagesMock.createWebhookMessage).not.toHaveBeenCalled();
  });

  it('bahsetme OLUŞTURANIN kimliğiyle çözülür ve kullanıcı bahsetmesi çözülmez', async () => {
    await service.execute('wh-1', TOKEN, { content: '<@u1> selam' }, 'ip');
    expect(messagesMock.resolveMentions).toHaveBeenCalledWith(CHANNEL, '<@u1> selam', 'creator-1', {
      resolveUsers: false,
      plainEveryone: true,
    });
    expect(messagesMock.createWebhookMessage.mock.calls[0][1]).not.toHaveProperty('mentions');
  });

  describe('allowed_mentions (§3.4)', () => {
    beforeEach(() => {
      messagesMock.resolveMentions.mockResolvedValue({
        mentions: [],
        mentionsEveryone: true,
        mentionRoles: ['r1'],
      });
    });
    const sent = () => messagesMock.createWebhookMessage.mock.calls[0][1];

    it('alan yok → Discord varsayılanı gibi izin verilir (oluşturanın izni çözümde sınandı)', async () => {
      await service.execute('wh-1', TOKEN, { content: 'x' }, 'ip');
      expect(sent()).toMatchObject({ mentionsEveryone: true, mentionRoles: ['r1'] });
    });

    it('parse: [] daraltır', async () => {
      await service.execute('wh-1', TOKEN, { content: 'x', allowed_mentions: { parse: [] } }, 'ip');
      expect(sent()).toMatchObject({ mentionsEveryone: false, mentionRoles: [] });
    });

    it('parse: ["roles"] yalnız rolü bırakır, ["everyone"] yalnız herkesi', async () => {
      await service.execute(
        'wh-1',
        TOKEN,
        { content: 'x', allowed_mentions: { parse: ['roles'] } },
        'ip',
      );
      expect(sent()).toMatchObject({ mentionsEveryone: false, mentionRoles: ['r1'] });
      messagesMock.createWebhookMessage.mockClear();
      await service.execute(
        'wh-1',
        TOKEN,
        { content: 'x', allowed_mentions: { parse: ['everyone'] } },
        'ip2',
      );
      expect(sent()).toMatchObject({ mentionsEveryone: true, mentionRoles: [] });
    });

    it('alan var ama parse yok → daraltma yönünde (hiçbiri)', async () => {
      await service.execute('wh-1', TOKEN, { content: 'x', allowed_mentions: {} }, 'ip');
      expect(sent()).toMatchObject({ mentionsEveryone: false, mentionRoles: [] });
    });

    it('oluşturanın izni yoksa çözüm false döner, parse genişletemez', async () => {
      messagesMock.resolveMentions.mockResolvedValue({
        mentions: [],
        mentionsEveryone: false,
        mentionRoles: [],
      });
      await service.execute(
        'wh-1',
        TOKEN,
        { content: 'x', allowed_mentions: { parse: ['everyone', 'roles'] } },
        'ip',
      );
      expect(sent()).toMatchObject({ mentionsEveryone: false, mentionRoles: [] });
    });
  });

  it('lastUsedAt başarılı gönderimde dakikada en çok bir kez güncellenir (stale koşulu)', async () => {
    await service.execute('wh-1', TOKEN, { content: 'x' }, 'ip');
    await new Promise((r) => setImmediate(r));
    const call = prismaMock.webhook.updateMany.mock.calls[0][0];
    expect(call.where.id).toBe('wh-1');
    expect(call.where.OR).toEqual([{ lastUsedAt: null }, { lastUsedAt: { lt: expect.any(Date) } }]);
  });
});
