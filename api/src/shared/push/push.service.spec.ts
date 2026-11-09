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

// ── C50 — veri-yalnız (v2) mesaj push'u ───────────────────────────────────────
describe('PushService C50 v2', () => {
  const V2 = {
    v: 2 as const,
    kind: 'message' as const,
    type: 'DM_MESSAGE' as const,
    conversationId: 'ch-1',
    guildId: null,
    messageId: 'm1',
    senderId: 'sender',
    senderName: 'yazar',
    senderAvatarUrl: null,
    isGroup: false,
    conversationTitle: null,
    conversationIconUrl: null,
    text: 'selam',
    timestamp: 1,
  };
  const PAYLOAD = {
    title: 'yazar',
    body: 'selam',
    data: { type: 'DM_MESSAGE', channelId: 'ch-1' },
    priority: 'high' as const,
    androidChannelId: 'messages_v6',
    tag: 'ch-1',
    v2: V2,
  };

  const redisMock = { setMarker: jest.fn(), takeMarkers: jest.fn() };

  function make(opts: { v2?: boolean; allow?: string[] } = {}) {
    const values: Record<string, unknown> = {
      expoPushEnabled: true,
      pushV2Enabled: opts.v2 ?? false,
      pushV2UserIds: opts.allow ?? [],
    };
    const config = { get: jest.fn((k: string) => values[k]) };
    return new PushService(prismaMock as any, config as any, redisMock as any);
  }

  function sent(): any[] {
    return JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => ({ data: [] }) });
    redisMock.setMarker.mockResolvedValue(undefined);
  });

  it('bayrak kapalı + format 2 token → v1 gövdesi (v2 anahtarı sızmaz), işaret yok', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[a]', userId: 'u1', format: 2 },
    ]);
    await make({ v2: false }).sendToUsers(['u1'], PAYLOAD);

    expect(sent()).toEqual([
      {
        to: 'ExponentPushToken[a]',
        title: 'yazar',
        body: 'selam',
        data: { type: 'DM_MESSAGE', channelId: 'ch-1' },
        priority: 'high',
        channelId: 'messages_v6',
        tag: 'ch-1',
      },
    ]);
    expect(redisMock.setMarker).not.toHaveBeenCalled();
  });

  it('bayrak açık + format 2 → yalnız data + priority (üst düzey title/body/channelId/tag yok), işaret yazılır', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[a]', userId: 'u1', format: 2 },
    ]);
    await make({ v2: true }).sendToUsers(['u1'], PAYLOAD);

    const [msg] = sent();
    expect(msg).toEqual({ to: 'ExponentPushToken[a]', data: V2, priority: 'high' });
    expect(redisMock.setMarker).toHaveBeenCalledWith('push:pending:u1:ch-1', 7 * 24 * 60 * 60);
  });

  it('v2 mesajında ttlSeconds varsa ttl taşınır', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[a]', userId: 'u1', format: 2 },
    ]);
    await make({ v2: true }).sendToUsers(['u1'], { ...PAYLOAD, ttlSeconds: 60 });

    expect(sent()[0]).toMatchObject({ priority: 'high', ttl: 60 });
  });

  it('bayrak açık + format 1 → v1', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[a]', userId: 'u1', format: 1 },
    ]);
    await make({ v2: true }).sendToUsers(['u1'], PAYLOAD);

    expect(sent()[0]).toMatchObject({ title: 'yazar', body: 'selam', channelId: 'messages_v6' });
    expect(redisMock.setMarker).not.toHaveBeenCalled();
  });

  it('allowlist dolu: listede olmayan alıcı v1, listedeki v2', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[in]', userId: 'u1', format: 2 },
      { token: 'ExponentPushToken[out]', userId: 'u2', format: 2 },
    ]);
    await make({ v2: true, allow: ['u1'] }).sendToUsers(['u1', 'u2'], PAYLOAD);

    const [a, b] = sent();
    expect(a).toEqual({ to: 'ExponentPushToken[in]', data: V2, priority: 'high' });
    expect(b).toMatchObject({ to: 'ExponentPushToken[out]', title: 'yazar', body: 'selam' });
    expect(redisMock.setMarker).toHaveBeenCalledTimes(1);
  });

  it('v2 verilmemiş payload (başka bildirim tipi) → format 2 token yine v1', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[a]', userId: 'u1', format: 2 },
    ]);
    const v1Only = { ...PAYLOAD, v2: undefined };
    await make({ v2: true }).sendToUsers(['u1'], v1Only);

    expect(sent()[0]).toMatchObject({ title: 'yazar', body: 'selam' });
  });

  it('karışık tokenlar doğru ayrışır (format 1, format 2, aynı kullanıcı iki cihaz)', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[old]', userId: 'u1', format: 1 },
      { token: 'ExponentPushToken[new]', userId: 'u1', format: 2 },
      { token: 'ExponentPushToken[other]', userId: 'u2', format: 2 },
    ]);
    await make({ v2: true }).sendToUsers(['u1', 'u2'], PAYLOAD);

    const [old, nw, other] = sent();
    expect(old.body).toBe('selam');
    expect(nw).toEqual({ to: 'ExponentPushToken[new]', data: V2, priority: 'high' });
    expect(other).toEqual({ to: 'ExponentPushToken[other]', data: V2, priority: 'high' });
    // işaret kullanıcı başına bir kez
    expect(redisMock.setMarker).toHaveBeenCalledTimes(2);
  });

  describe('notifyRead (§2.4)', () => {
    it('işaret varken v2 tokenlarına tek okundu mesajı gider', async () => {
      redisMock.takeMarkers.mockResolvedValue(['push:pending:u1:ch-1']);
      prismaMock.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);

      await make({ v2: true }).notifyRead('u1', ['ch-1', 'ch-2']);

      expect(redisMock.takeMarkers).toHaveBeenCalledWith([
        'push:pending:u1:ch-1',
        'push:pending:u1:ch-2',
      ]);
      expect(prismaMock.pushToken.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', format: 2 },
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(sent()).toEqual([
        {
          to: 'ExponentPushToken[a]',
          data: { v: 2, kind: 'read', conversationIds: ['ch-1'] },
          priority: 'high',
        },
      ]);
    });

    it('işaret yokken hiç push atılmaz', async () => {
      redisMock.takeMarkers.mockResolvedValue([]);

      await make({ v2: true }).notifyRead('u1', ['ch-1']);

      expect(prismaMock.pushToken.findMany).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('tümünü okundu: işaretliler tek mesajda, 50 id sınırıyla parçalanır', async () => {
      const ids = Array.from({ length: 120 }, (_, i) => `ch-${i}`);
      redisMock.takeMarkers.mockResolvedValue(ids.map((id) => `push:pending:u1:${id}`));
      prismaMock.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);

      await make({ v2: true }).notifyRead('u1', ids);

      const calls = (global.fetch as jest.Mock).mock.calls.map((c) => JSON.parse(c[1].body));
      expect(calls).toHaveLength(3);
      expect(calls.map((b) => b[0].data.conversationIds.length)).toEqual([50, 50, 20]);
    });

    it('tümünü okundu: 3 işaretli kanal tek mesajda', async () => {
      redisMock.takeMarkers.mockResolvedValue([
        'push:pending:u1:a',
        'push:pending:u1:b',
        'push:pending:u1:c',
      ]);
      prismaMock.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[a]' }]);

      await make({ v2: true }).notifyRead('u1', ['a', 'b', 'c', 'd']);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(sent()[0].data.conversationIds).toEqual(['a', 'b', 'c']);
    });

    it('bayrak kapalıyken redis/token sorgusu yok', async () => {
      await make({ v2: false }).notifyRead('u1', ['ch-1']);

      expect(redisMock.takeMarkers).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('redis hatası fırlatmaz', async () => {
      redisMock.takeMarkers.mockRejectedValue(new Error('redis yok'));

      await expect(make({ v2: true }).notifyRead('u1', ['ch-1'])).resolves.toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});

// ── C53 — veri-yalnız arama push'u ────────────────────────────────────────────
describe('PushService C53 arama', () => {
  const CALL = {
    v: 2 as const,
    kind: 'call' as const,
    callChannelId: 'dm-1',
    callerId: 'caller',
    callerName: 'arayan',
    callerAvatarUrl: null,
  };
  const PAYLOAD = {
    title: 'Gelen Arama',
    body: 'arayan seni arıyor!',
    data: { type: 'incoming_call', channelId: 'dm-1', callerId: 'caller', callerName: 'arayan' },
    priority: 'high' as const,
    androidChannelId: 'incoming_call_v4',
    categoryId: 'incoming_call',
    ttlSeconds: 30,
    v2: CALL,
  };
  const redisMock = { setMarker: jest.fn(), takeMarkers: jest.fn() };

  function make(opts: { v2?: boolean; allow?: string[] } = {}) {
    const values: Record<string, unknown> = {
      expoPushEnabled: true,
      pushV2Enabled: opts.v2 ?? false,
      pushV2UserIds: opts.allow ?? [],
    };
    const config = { get: jest.fn((k: string) => values[k]) };
    return new PushService(prismaMock as any, config as any, redisMock as any);
  }
  function sent(): any[] {
    return JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => ({ data: [] }) });
  });

  it('v2 token: gövdede title/body yok, callChannelId var, ttl 30, işaret yazılmaz', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[a]', userId: 'u1', format: 2 },
    ]);
    await make({ v2: true }).sendToUsers(['u1'], PAYLOAD);

    const m = sent()[0];
    expect(m.title).toBeUndefined();
    expect(m.body).toBeUndefined();
    expect(m.data).toEqual(CALL);
    expect(m.data.channelId).toBeUndefined();
    expect(m.ttl).toBe(30);
    expect(redisMock.setMarker).not.toHaveBeenCalled();
  });

  it('v1 token (format 1) → bugünkü arama push gövdesi birebir', async () => {
    prismaMock.pushToken.findMany.mockResolvedValue([
      { token: 'ExponentPushToken[a]', userId: 'u1', format: 1 },
    ]);
    await make({ v2: true }).sendToUsers(['u1'], PAYLOAD);

    const m = sent()[0];
    expect(m.title).toBe('Gelen Arama');
    expect(m.data.type).toBe('incoming_call');
    expect(m.channelId).toBe('incoming_call_v4');
    expect(m.categoryId).toBe('incoming_call');
    expect(m.ttl).toBe(30);
  });

  describe('sendCallEnd', () => {
    it('yalnız v2 tokenlarına call_end gider', async () => {
      prismaMock.pushToken.findMany.mockResolvedValue([
        { token: 'ExponentPushToken[a]', userId: 'u1', format: 2 },
      ]);
      await make({ v2: true }).sendCallEnd('u1', 'dm-1');

      expect(prismaMock.pushToken.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', format: 2 },
      });
      expect(sent()).toEqual([
        {
          to: 'ExponentPushToken[a]',
          data: { v: 2, kind: 'call_end', callChannelId: 'dm-1' },
          priority: 'high',
          ttl: 30,
        },
      ]);
    });

    it('bayrak kapalı → no-op', async () => {
      await make({ v2: false }).sendCallEnd('u1', 'dm-1');
      expect(prismaMock.pushToken.findMany).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('allowlist dışı kullanıcı → no-op', async () => {
      await make({ v2: true, allow: ['x'] }).sendCallEnd('u1', 'dm-1');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('v2 token yoksa fetch yok; hata fırlatmaz', async () => {
      prismaMock.pushToken.findMany.mockResolvedValue([]);
      await expect(make({ v2: true }).sendCallEnd('u1', 'dm-1')).resolves.toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
