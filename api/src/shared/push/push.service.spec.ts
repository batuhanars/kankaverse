import { PushService } from './push.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  pushToken: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

function configMock(enabled: boolean) {
  return {
    get: jest.fn((key: string) => (key === 'expoPushEnabled' ? enabled : undefined)),
  };
}

function makeService(enabled = true) {
  return new PushService(prismaMock as any, configMock(enabled) as any);
}

const BASE_PAYLOAD = { body: 'merhaba', data: { type: 'MENTION' } };

describe('PushService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).fetch = jest.fn();
  });

  // ── §2.5 — EXPO_PUSH_ENABLED=false → hiç istek atılmaz ─────────────────────
  it('EXPO_PUSH_ENABLED=false → token sorgusu da fetch de yapılmaz (no-op)', async () => {
    const service = makeService(false);
    await service.sendToUsers(['u1'], BASE_PAYLOAD);

    expect(prismaMock.pushToken.findMany).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('boş alıcı listesi → hiçbir şey yapmaz', async () => {
    const service = makeService(true);
    await service.sendToUsers([], BASE_PAYLOAD);

    expect(prismaMock.pushToken.findMany).not.toHaveBeenCalled();
  });

  it('tekrarlı userId tekilleştirilir', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([]);
    const service = makeService(true);
    await service.sendToUsers(['u1', 'u1'], BASE_PAYLOAD);

    expect(prismaMock.pushToken.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['u1'] } },
    });
  });

  it("alıcının hiç token'ı yoksa fetch çağrılmaz", async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([]);
    const service = makeService(true);
    await service.sendToUsers(['u1'], BASE_PAYLOAD);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("token(lar) bulunursa Expo Push API'ye doğru gövdeyle istek atar", async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[a]' },
      { token: 'ExponentPushToken[b]' },
    ]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }),
    });

    const service = makeService(true);
    await service.sendToUsers(['u1', 'u2'], {
      title: 'Aktör',
      body: 'merhaba',
      data: { type: 'MENTION', channelId: 'ch-1' },
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const body = JSON.parse(options.body);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      to: 'ExponentPushToken[a]',
      title: 'Aktör',
      body: 'merhaba',
      data: { type: 'MENTION', channelId: 'ch-1' },
    });
  });

  // ── §2.3 — ≤100 mesaj/istek (chunk) ─────────────────────────────────────────
  it("100'den fazla token → birden çok istek (chunk ≤100)", async () => {
    const tokens = Array.from({ length: 101 }, (_, i) => ({ token: `ExponentPushToken[t${i}]` }));
    prismaMock.pushToken.findMany.mockResolvedValue(tokens);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => ({ data: [] }) });

    const service = makeService(true);
    await service.sendToUsers(['u1'], BASE_PAYLOAD);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const secondBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(firstBody).toHaveLength(100);
    expect(secondBody).toHaveLength(1);
  });

  // ── §2.3/§2.5 — DeviceNotRegistered → token silinir ─────────────────────────
  it('DeviceNotRegistered yanıtı → yalnız o token silinir', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[a]' },
      { token: 'ExponentPushToken[b]' },
    ]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => ({
        data: [
          { status: 'error', message: 'gitti', details: { error: 'DeviceNotRegistered' } },
          { status: 'ok' },
        ],
      }),
    });

    const service = makeService(true);
    await service.sendToUsers(['u1'], BASE_PAYLOAD);

    expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['ExponentPushToken[a]'] } },
    });
  });

  it('tüm biletler ok → hiçbir token silinmez', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => ({ data: [{ status: 'ok' }] }),
    });

    const service = makeService(true);
    await service.sendToUsers(['u1'], BASE_PAYLOAD);

    expect(prismaMock.pushToken.deleteMany).not.toHaveBeenCalled();
  });

  // ── §2.3 — hata ana akışı ASLA bloke etmez ──────────────────────────────────
  it('ağ hatası → sessiz yutulur, throw etmez', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const service = makeService(true);
    await expect(service.sendToUsers(['u1'], BASE_PAYLOAD)).resolves.toBeUndefined();
  });

  it('5xx yanıt → sessiz yutulur, token silinmez', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

    const service = makeService(true);
    await expect(service.sendToUsers(['u1'], BASE_PAYLOAD)).resolves.toBeUndefined();
    expect(prismaMock.pushToken.deleteMany).not.toHaveBeenCalled();
  });

  it('token sorgusu (Prisma) patlasa bile throw etmez', async () => {
    prismaMock.pushToken.findMany.mockRejectedValue(new Error('db down'));

    const service = makeService(true);
    await expect(service.sendToUsers(['u1'], BASE_PAYLOAD)).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── M4a-3 §9.1 — PushPayload genişlemesi, geriye uyumlu ────────────────────
  describe('M4a-3 §9.1 — yeni opsiyonel alanlar', () => {
    it('REGRESYON: yeni alanlar verilmezse Expo gövdesi bugünküyle birebir aynı (yalnız to/title/body/data)', async () => {
      prismaMock.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => ({ data: [{ status: 'ok' }] }),
      });

      const service = makeService(true);
      await service.sendToUsers(['u1'], {
        title: 'Aktör',
        body: 'merhaba',
        data: { type: 'MENTION', channelId: 'ch-1' },
      });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body).toEqual([
        {
          to: 'ExponentPushToken[a]',
          title: 'Aktör',
          body: 'merhaba',
          data: { type: 'MENTION', channelId: 'ch-1' },
        },
      ]);
    });

    it("priority/androidChannelId/categoryId/ttlSeconds → Expo mesajına doğru map'lenir (channelId/ttl adları)", async () => {
      prismaMock.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => ({ data: [{ status: 'ok' }] }),
      });

      const service = makeService(true);
      await service.sendToUsers(['u1'], {
        title: 'Gelen Arama',
        body: 'kanka1 seni arıyor!',
        data: {
          type: 'incoming_call',
          channelId: 'ch-dm-1',
          callerId: 'u-caller',
          callerName: 'kanka1',
        },
        priority: 'high',
        androidChannelId: 'incoming_call_v4',
        categoryId: 'incoming_call',
        ttlSeconds: 30,
      });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body).toEqual([
        {
          to: 'ExponentPushToken[a]',
          title: 'Gelen Arama',
          body: 'kanka1 seni arıyor!',
          data: {
            type: 'incoming_call',
            channelId: 'ch-dm-1',
            callerId: 'u-caller',
            callerName: 'kanka1',
          },
          priority: 'high',
          // 🔴 `androidChannelId` Expo mesajının `channelId` alanına map'lenir (data.channelId ile karışmasın diye ayrı isimlendirildi).
          channelId: 'incoming_call_v4',
          categoryId: 'incoming_call',
          ttl: 30,
        },
      ]);
    });
  });
});
