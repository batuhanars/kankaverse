import { PresenceService } from './presence.service';

// C31f — "son oynanan oyun" yazım şartları (R7/KVKK): minör asla, ayarlar kapalıyken asla, dnd'de asla.

interface FakeUser {
  isMinor: boolean;
  showRecentActivity: boolean;
  showGameActivity: boolean | null;
}
let user: FakeUser | null;

const prismaMock = {
  user: { findUnique: jest.fn(() => Promise.resolve(user)) },
  recentGame: { upsert: jest.fn(() => Promise.resolve({})) },
};

function makeService() {
  return new PresenceService(prismaMock as any, { emitToUser: jest.fn() } as any, {} as any);
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const upsertArg = (i: number) =>
  (prismaMock.recentGame.upsert.mock.calls[i] as unknown as unknown[])[0] as {
    where: unknown;
    create: { gameId: string; lastPlayedAt: Date };
  };

describe('PresenceService — son oynanan oyun yazımı (C31f)', () => {
  let service: PresenceService;
  beforeEach(() => {
    jest.clearAllMocks();
    user = { isMinor: false, showRecentActivity: true, showGameActivity: null };
    service = makeService();
    service.connect('u1', 'c1');
  });

  it('oyun bitince (null) upsert yazılır, başlangıçta yazılmaz', async () => {
    service.setGame('u1', 'c1', 'g1');
    await flush();
    expect(prismaMock.recentGame.upsert).not.toHaveBeenCalled();
    service.setGame('u1', 'c1', null);
    await flush();
    expect(prismaMock.recentGame.upsert).toHaveBeenCalledTimes(1);
    expect(upsertArg(0).where).toEqual({ userId_gameId: { userId: 'u1', gameId: 'g1' } });
    expect(upsertArg(0).create.lastPlayedAt).toBeInstanceOf(Date);
  });

  it('oyun değişince önceki oyun yazılır; aynı oyun yeniden bildirilince yazılmaz', async () => {
    service.setGame('u1', 'c1', 'g1');
    service.setGame('u1', 'c1', 'g1');
    await flush();
    expect(prismaMock.recentGame.upsert).not.toHaveBeenCalled();
    service.setGame('u1', 'c1', 'g2');
    await flush();
    expect(prismaMock.recentGame.upsert).toHaveBeenCalledTimes(1);
    expect(upsertArg(0).create.gameId).toBe('g1');
  });

  it('bağlantı kopunca oyun yazılır', async () => {
    service.setGame('u1', 'c1', 'g1');
    service.disconnect('u1', 'c1');
    await flush();
    expect(prismaMock.recentGame.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['minör', { isMinor: true, showRecentActivity: true, showGameActivity: true }],
    [
      'son etkinlik ayarı kapalı',
      { isMinor: false, showRecentActivity: false, showGameActivity: null },
    ],
    [
      'oyun paylaşımı kapalı',
      { isMinor: false, showRecentActivity: true, showGameActivity: false },
    ],
  ])('%s iken hiç yazılmaz', async (_label, fake) => {
    user = fake;
    service.setGame('u1', 'c1', 'g1');
    service.setGame('u1', 'c1', null);
    await flush();
    expect(prismaMock.recentGame.upsert).not.toHaveBeenCalled();
  });

  it('rahatsız etmeyin (dnd) iken yazılmaz', async () => {
    service.setStatus('u1', 'dnd');
    service.setGame('u1', 'c1', 'g1');
    service.setGame('u1', 'c1', null);
    await flush();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.recentGame.upsert).not.toHaveBeenCalled();
  });

  it('ayar kapanıp clearGames çağrılınca oyun yazılmaz', async () => {
    service.setGame('u1', 'c1', 'g1');
    service.clearGames('u1');
    service.disconnect('u1', 'c1');
    await flush();
    expect(prismaMock.recentGame.upsert).not.toHaveBeenCalled();
  });

  it('DB hatası presence akışını bozmaz', async () => {
    prismaMock.recentGame.upsert.mockRejectedValueOnce(new Error('db'));
    service.setGame('u1', 'c1', 'g1');
    expect(() => service.setGame('u1', 'c1', null)).not.toThrow();
    await flush();
  });
});
