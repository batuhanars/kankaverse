import { StreamAnnouncerService } from './stream-announcer.service';

const OWNER = 'u1';
const ACCOUNT = {
  id: 'acc-1',
  userId: OWNER,
  externalId: '42',
  username: 'Yayinci',
  lastAnnouncedAt: null as Date | null,
  user: { id: OWNER, isMinor: false, deletedAt: null },
};
const CHANNEL = { id: 'ch-1', guildId: 'g-1', type: 'GUILD_TEXT' };

function cfg(guildId: string, extra: Record<string, unknown> = {}) {
  return {
    guildId,
    channelId: 'ch-1',
    mentionRoleId: null,
    enabled: true,
    webhook: {
      id: `wh-${guildId}`,
      name: 'Yayın Duyurusu',
      guildId,
      channelId: 'ch-1',
      createdById: 'admin',
    },
    ...extra,
  };
}

describe('StreamAnnouncerService (C36 §5)', () => {
  const provider = {
    key: 'kick',
    db: 'KICK',
    fetchStream: jest.fn(),
    channelUrl: (u: string) => `https://kick.com/${u}`,
  };
  let prisma: Record<string, Record<string, jest.Mock>>;
  let moderation: { hasActiveBan: jest.Mock };
  let webhooks: { resolveSender: jest.Mock };
  let messages: Record<string, jest.Mock>;
  let gateway: Record<string, jest.Mock>;
  let config: { get: jest.Mock };
  let service: StreamAnnouncerService;

  const STREAM = {
    title: 'Ranked',
    categoryId: '1',
    categoryName: 'Valorant',
    mature: false,
    labels: [],
    channelSlug: 'yayinci',
  };

  beforeEach(() => {
    provider.fetchStream.mockReset().mockResolvedValue(STREAM);
    prisma = {
      externalAccount: {
        findUnique: jest.fn().mockResolvedValue({ ...ACCOUNT }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      streamAnnounceOptIn: {
        findMany: jest.fn().mockResolvedValue([{ guildId: 'g-normal' }, { guildId: 'g-adult' }]),
      },
      streamAnnounceConfig: {
        findMany: jest.fn().mockResolvedValue([cfg('g-normal'), cfg('g-adult')]),
      },
      guildMember: {
        findMany: jest.fn().mockResolvedValue([{ guildId: 'g-normal' }, { guildId: 'g-adult' }]),
      },
      guild: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: { where: { adultsOnly?: boolean } }) =>
            Promise.resolve(
              where.adultsOnly ? [{ id: 'g-adult' }] : [{ id: 'g-normal' }, { id: 'g-adult' }],
            ),
          ),
      },
    };
    moderation = { hasActiveBan: jest.fn().mockResolvedValue(false) };
    webhooks = { resolveSender: jest.fn().mockResolvedValue({ ok: true, channel: CHANNEL }) };
    messages = {
      assertTextsAllowed: jest.fn(),
      resolveMentions: jest.fn().mockResolvedValue({ mentionRoles: [] }),
      createWebhookMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
    };
    gateway = {
      broadcastMessage: jest.fn(),
      notifyChannelActivity: jest.fn().mockResolvedValue(undefined),
      notifyMentions: jest.fn().mockResolvedValue(undefined),
    };
    config = { get: jest.fn().mockReturnValue([]) };
    service = new StreamAnnouncerService(
      prisma as never,
      config as never,
      moderation as never,
      webhooks as never,
      messages as never,
      gateway as never,
    );
    service.retryDelaysMs = [0, 0, 0, 0];
  });

  const run = () => service.onOnline(provider as never, '42', 'İpucu');
  const sentGuilds = () =>
    messages.createWebhookMessage.mock.calls.map((c) => (c[1] as { webhookId: string }).webhookId);

  it('opt-in + açık ayar: embed mesajı C35 çekirdeğiyle yazılır ve yayılır', async () => {
    await run();
    expect(sentGuilds().sort()).toEqual(['wh-g-adult', 'wh-g-normal']);
    const data = messages.createWebhookMessage.mock.calls[0][1] as {
      content: string;
      creatorId: string;
      embeds: { title: string; url: string; description: string; color: number }[];
      mentionsEveryone: boolean;
    };
    expect(data.content).toBe("Yayinci Kick'te yayında!");
    expect(data.creatorId).toBe('admin');
    expect(data.mentionsEveryone).toBe(false);
    expect(data.embeds[0]).toMatchObject({
      title: 'Ranked',
      url: 'https://kick.com/yayinci',
      description: 'Valorant',
      color: 0x53fc18,
    });
    expect(gateway.broadcastMessage).toHaveBeenCalledTimes(2);
    expect(prisma.externalAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastAnnouncedAt: expect.any(Date) }),
      }),
    );
  });

  it('opt-in yoksa hiç duyuru yok', async () => {
    prisma.streamAnnounceOptIn.findMany.mockResolvedValue([]);
    await run();
    expect(messages.createWebhookMessage).not.toHaveBeenCalled();
  });

  it('yönetici ayarı kapalı ortama duyuru yok (sorgu enabled: true ister)', async () => {
    await run();
    expect(prisma.streamAnnounceConfig.findMany.mock.calls[0][0].where).toMatchObject({
      enabled: true,
      webhook: { deletedAt: null },
    });
    prisma.streamAnnounceConfig.findMany.mockResolvedValue([]);
    messages.createWebhookMessage.mockClear();
    await run();
    expect(messages.createWebhookMessage).not.toHaveBeenCalled();
  });

  it('artık üye olmadığı ortama duyuru yok', async () => {
    prisma.guildMember.findMany.mockResolvedValue([{ guildId: 'g-adult' }]);
    await run();
    expect(sentGuilds()).toEqual(['wh-g-adult']);
  });

  it('kumar kategorisi yalnız adultsOnly ortama gider', async () => {
    provider.fetchStream.mockResolvedValue({ ...STREAM, categoryName: 'Slots & Casino' });
    await run();
    expect(sentGuilds()).toEqual(['wh-g-adult']);
  });

  it('yetişkin işaretli yayın yalnız adultsOnly ortama gider', async () => {
    provider.fetchStream.mockResolvedValue({ ...STREAM, mature: true });
    await run();
    expect(sentGuilds()).toEqual(['wh-g-adult']);
  });

  it('yayın bilgisi okunamazsa riskli sayılır (yalnız adultsOnly), 5 deneme yapılır', async () => {
    provider.fetchStream.mockRejectedValue(new Error('down'));
    await run();
    expect(provider.fetchStream).toHaveBeenCalledTimes(5);
    expect(sentGuilds()).toEqual(['wh-g-adult']);
    // başlık olarak olayın verdiği ipucu kullanılır
    const embed = (
      messages.createWebhookMessage.mock.calls[0][1] as { embeds: { title: string }[] }
    ).embeds[0];
    expect(embed.title).toBe('İpucu');
  });

  it('platform yayını geç görürse (ilk 3 okuma boş) sonraki denemede normal yayın normal ortama de gider', async () => {
    provider.fetchStream
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(STREAM);
    await run();
    expect(provider.fetchStream).toHaveBeenCalledTimes(4);
    expect(sentGuilds().sort()).toEqual(['wh-g-adult', 'wh-g-normal']);
  });

  it('bekleme planı yaklaşık 2 dakika (5, 15, 30, 60 sn) ve ilk deneme anında', () => {
    const real = new StreamAnnouncerService(
      prisma as never,
      config as never,
      moderation as never,
      webhooks as never,
      messages as never,
      gateway as never,
    );
    expect(real.retryDelaysMs).toEqual([5000, 15000, 30000, 60000]);
    expect(real.retryDelaysMs.reduce((a, b) => a + b, 0)).toBe(110_000);
  });

  it('30 dakika kapısı: son duyuru yeniyse hiçbir şey gönderilmez', async () => {
    prisma.externalAccount.findUnique.mockResolvedValue({
      ...ACCOUNT,
      lastAnnouncedAt: new Date(Date.now() - 10 * 60_000),
    });
    await run();
    expect(messages.createWebhookMessage).not.toHaveBeenCalled();
    expect(provider.fetchStream).not.toHaveBeenCalled();
  });

  it('30 dakikadan eski son duyuru yeni duyuruyu engellemez', async () => {
    prisma.externalAccount.findUnique.mockResolvedValue({
      ...ACCOUNT,
      lastAnnouncedAt: new Date(Date.now() - 31 * 60_000),
    });
    await run();
    expect(messages.createWebhookMessage).toHaveBeenCalled();
  });

  it('sahibi minörse / silinmişse / banlıysa hiçbir şey yapılmaz', async () => {
    prisma.externalAccount.findUnique.mockResolvedValue({
      ...ACCOUNT,
      user: { ...ACCOUNT.user, isMinor: true },
    });
    await run();
    prisma.externalAccount.findUnique.mockResolvedValue({
      ...ACCOUNT,
      user: { ...ACCOUNT.user, deletedAt: new Date() },
    });
    await run();
    prisma.externalAccount.findUnique.mockResolvedValue({ ...ACCOUNT });
    moderation.hasActiveBan.mockResolvedValue(true);
    await run();
    expect(messages.createWebhookMessage).not.toHaveBeenCalled();
    expect(prisma.streamAnnounceOptIn.findMany).not.toHaveBeenCalled();
  });

  it('bağlı hesap bulunamazsa sessizce çıkar', async () => {
    prisma.externalAccount.findUnique.mockResolvedValue(null);
    await run();
    expect(messages.createWebhookMessage).not.toHaveBeenCalled();
  });

  it('oluşturan (yönetici) yetkisini kaybettiyse C35 kapısı o ortamı atlar, diğerleri gider', async () => {
    webhooks.resolveSender.mockImplementation((w: { guildId: string }) =>
      Promise.resolve(
        w.guildId === 'g-normal'
          ? { ok: false, reason: 'DISABLED' }
          : { ok: true, channel: CHANNEL },
      ),
    );
    await run();
    expect(sentGuilds()).toEqual(['wh-g-adult']);
  });

  it('automod başlığa takılırsa o ortama duyuru yok', async () => {
    messages.assertTextsAllowed.mockImplementation(() => {
      throw new Error('blocked');
    });
    await run();
    expect(messages.createWebhookMessage).not.toHaveBeenCalled();
  });

  it('rol bahsetmesi içeriğe eklenir ve oluşturanın kimliğiyle çözülür', async () => {
    prisma.streamAnnounceConfig.findMany.mockResolvedValue([
      cfg('g-adult', { mentionRoleId: 'r1' }),
    ]);
    messages.resolveMentions.mockResolvedValue({ mentionRoles: ['r1'] });
    await run();
    const call = messages.resolveMentions.mock.calls[0];
    expect(call[1]).toContain('<@&r1>');
    expect(call[2]).toBe('admin');
    expect(call[3]).toEqual({ resolveUsers: false });
    expect(messages.createWebhookMessage.mock.calls[0][1]).toMatchObject({
      mentionRoles: ['r1'],
      mentionsEveryone: false,
    });
  });

  it('bir ortamın hatası diğerini engellemez', async () => {
    messages.createWebhookMessage.mockRejectedValueOnce(new Error('db'));
    await run();
    expect(messages.createWebhookMessage).toHaveBeenCalledTimes(2);
    expect(gateway.broadcastMessage).toHaveBeenCalledTimes(1);
  });

  it('eşzamanlı iki olay tek duyuru üretir', async () => {
    await Promise.all([run(), run()]);
    expect(messages.createWebhookMessage).toHaveBeenCalledTimes(2); // 2 ortam, tek tur
  });

  it('offline yalnız lastLiveAt günceller', async () => {
    await service.onOffline(provider as never, '42');
    expect(prisma.externalAccount.updateMany).toHaveBeenCalled();
    expect(messages.createWebhookMessage).not.toHaveBeenCalled();
  });
});
