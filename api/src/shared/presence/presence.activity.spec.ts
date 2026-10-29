import { PresenceService } from './presence.service';

// C31b §2.7 — oyun etkinliği görünürlüğü (R7) ve bağlantı başına oyun kaydı.

interface FakeUser {
  isMinor: boolean;
  showGameActivity: boolean | null;
}

const users: Record<string, FakeUser> = {};
let friendPairs: Array<[string, string]> = [];
let blockPairs: Array<[string, string]> = [];
let sharedGuildPairs: Array<[string, string]> = [];

const hasPair = (pairs: Array<[string, string]>, a: string, b: string) =>
  pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const prismaMock = {
  userBlock: {
    findFirst: jest.fn(({ where }) => {
      const [first] = where.OR;
      return Promise.resolve(
        hasPair(blockPairs, first.blockerId, first.blockedId) ? { id: 'b' } : null,
      );
    }),
  },
  friendship: {
    findFirst: jest.fn(({ where }) => {
      const [first] = where.OR;
      return Promise.resolve(
        hasPair(friendPairs, first.requesterId, first.addresseeId) ? { id: 'f' } : null,
      );
    }),
    findMany: jest.fn(({ where }) => {
      const me = where.OR[0].requesterId as string;
      return Promise.resolve(
        friendPairs
          .filter(([a, b]) => a === me || b === me)
          .map(([a, b]) => ({ requesterId: a, addresseeId: b })),
      );
    }),
  },
  user: {
    findUnique: jest.fn(({ where }) => Promise.resolve(users[where.id] ?? null)),
  },
  guildMember: {
    findFirst: jest.fn(({ where }) => {
      const targetId = where.guild.members.some.userId as string;
      return Promise.resolve(
        hasPair(sharedGuildPairs, where.userId, targetId) ? { id: 'g' } : null,
      );
    }),
    findMany: jest.fn(({ where }) => {
      if (where.userId && where.guild) {
        const me = where.userId as string;
        const has = sharedGuildPairs.some(([a, b]) => a === me || b === me);
        return Promise.resolve(has ? [{ guildId: 'g1' }] : []);
      }
      const me = where.userId.not as string;
      return Promise.resolve(
        sharedGuildPairs
          .filter(([a, b]) => a === me || b === me)
          .map(([a, b]) => ({ userId: a === me ? b : a })),
      );
    }),
  },
};

const realtimeMock = { emitToUser: jest.fn() };
const gamesMock = {
  visibleById: jest.fn((id: string) =>
    Promise.resolve(id === 'hidden-game' ? null : { id, name: `Oyun ${id}` }),
  ),
};

function makeService() {
  return new PresenceService(prismaMock as any, realtimeMock as any, gamesMock as any);
}

describe('PresenceService — oyun etkinliği (C31b)', () => {
  let service: PresenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(users)) delete users[k];
    friendPairs = [];
    blockPairs = [];
    sharedGuildPairs = [];
    users['adult'] = { isMinor: false, showGameActivity: null };
    users['minor'] = { isMinor: true, showGameActivity: null };
    users['viewer'] = { isMinor: false, showGameActivity: null };
    service = makeService();
  });

  describe('bağlantı başına oyun kaydı', () => {
    it('hesabın etkin oyunu EN SON set edilen bağlantınınkidir', () => {
      service.connect('adult', 'c1');
      service.connect('adult', 'c2');
      service.setGame('adult', 'c1', 'g-a');
      service.setGame('adult', 'c2', 'g-b');
      expect(service.activeGameId('adult')).toBe('g-b');
      service.setGame('adult', 'c1', 'g-a'); // c1 yeniden set etti → en yeni
      expect(service.activeGameId('adult')).toBe('g-a');
    });

    it('bağlantı kopunca o bağlantının oyunu temizlenir, diğerininki kalır', () => {
      service.connect('adult', 'c1');
      service.connect('adult', 'c2');
      service.setGame('adult', 'c1', 'g-a');
      service.setGame('adult', 'c2', 'g-b');
      service.disconnect('adult', 'c2');
      expect(service.activeGameId('adult')).toBe('g-a');
      service.disconnect('adult', 'c1');
      expect(service.activeGameId('adult')).toBeNull();
    });

    it('null set oyunu siler; kayıtsız bağlantı için set false döner', () => {
      service.connect('adult', 'c1');
      service.setGame('adult', 'c1', 'g-a');
      service.setGame('adult', 'c1', null);
      expect(service.activeGameId('adult')).toBeNull();
      expect(service.setGame('adult', 'yok', 'g-a')).toBe(false);
      expect(service.setGame('kimse', 'c1', 'g-a')).toBe(false);
    });

    it('dnd iken oyun yayılmaz, dnd bitince geri gelir', () => {
      service.connect('adult', 'c1');
      service.setGame('adult', 'c1', 'g-a');
      service.setStatus('adult', 'dnd', { connectionId: 'c1' });
      expect(service.activeGameId('adult')).toBeNull();
      service.setStatus('adult', 'online', { connectionId: 'c1' });
      expect(service.activeGameId('adult')).toBe('g-a');
    });

    it('clearGames bütün bağlantıların oyununu siler', () => {
      service.connect('adult', 'c1');
      service.setGame('adult', 'c1', 'g-a');
      service.clearGames('adult');
      expect(service.activeGameId('adult')).toBeNull();
    });
  });

  describe('canSeeActivity — R7 matrisi', () => {
    it('yetişkin + ortak ortam + varsayılan ayar → görür', async () => {
      sharedGuildPairs = [['viewer', 'adult']];
      expect(await service.canSeeActivity('viewer', 'adult')).toBe(true);
    });

    it('yetişkin ayarı kapalı → ortak ortam üyesi görmez, kanka da görmez', async () => {
      users['adult'].showGameActivity = false;
      sharedGuildPairs = [['viewer', 'adult']];
      friendPairs = [['viewer', 'adult']];
      expect(await service.canSeeActivity('viewer', 'adult')).toBe(false);
    });

    it('minör + yabancı ortak ortam üyesi → görmez (ayar açık olsa bile)', async () => {
      users['minor'].showGameActivity = true;
      sharedGuildPairs = [['viewer', 'minor']];
      expect(await service.canSeeActivity('viewer', 'minor')).toBe(false);
    });

    it('minör + kanka + minör ayarı AÇIK → görür', async () => {
      users['minor'].showGameActivity = true;
      friendPairs = [['viewer', 'minor']];
      expect(await service.canSeeActivity('viewer', 'minor')).toBe(true);
    });

    it('minör + kanka + ayar hiç dokunulmamış (varsayılan kapalı) → görmez', async () => {
      friendPairs = [['viewer', 'minor']];
      expect(await service.canSeeActivity('viewer', 'minor')).toBe(false);
    });

    it('engel iki yönde de gizler (kanka olsa bile)', async () => {
      friendPairs = [['viewer', 'adult']];
      blockPairs = [['viewer', 'adult']];
      expect(await service.canSeeActivity('viewer', 'adult')).toBe(false);
      expect(await service.canSeeActivity('adult', 'viewer')).toBe(false);
    });

    it('ilişki yok → görmez; silinmiş hedef → görmez (fail-closed)', async () => {
      expect(await service.canSeeActivity('viewer', 'adult')).toBe(false);
      expect(await service.canSeeActivity('viewer', 'yok')).toBe(false);
    });

    it('kendi oyununu görür', async () => {
      expect(await service.canSeeActivity('adult', 'adult')).toBe(true);
    });
  });

  describe('activityAudienceFor / broadcastActivity', () => {
    it('minörün oyun kitlesi yalnız kankalardır; ortak ortamdaki yabancı dışarıda', async () => {
      users['minor'].showGameActivity = true;
      friendPairs = [['viewer', 'minor']];
      sharedGuildPairs = [['stranger', 'minor']];
      users['stranger'] = { isMinor: false, showGameActivity: null };
      expect(await service.activityAudienceFor('minor')).toEqual(['viewer']);
    });

    it('ayar kapalıysa oyun kitlesi boş', async () => {
      users['adult'].showGameActivity = false;
      sharedGuildPairs = [['viewer', 'adult']];
      expect(await service.activityAudienceFor('adult')).toEqual([]);
    });

    it('oyun varsa oyun kitlesine + kendine yayar', async () => {
      sharedGuildPairs = [['viewer', 'adult']];
      service.connect('adult', 'c1');
      service.setGame('adult', 'c1', 'g-a');
      await service.broadcastActivity('adult');
      const sent = realtimeMock.emitToUser.mock.calls.map((c) => [c[0], c[1], c[2]]);
      expect(sent).toContainEqual([
        'viewer',
        'activity:update',
        { userId: 'adult', game: { id: 'g-a', name: 'Oyun g-a' } },
      ]);
      expect(sent.map((s) => s[0])).toContain('adult');
    });

    it('ayar kapanınca oyun null yayılır (bayat satır temizlenir)', async () => {
      sharedGuildPairs = [['viewer', 'adult']];
      service.connect('adult', 'c1');
      service.setGame('adult', 'c1', 'g-a');
      users['adult'].showGameActivity = false;
      await service.broadcastActivity('adult');
      expect(realtimeMock.emitToUser).toHaveBeenCalledWith('viewer', 'activity:update', {
        userId: 'adult',
        game: null,
      });
    });

    it('gizli (hidden) oyun yayılmaz', async () => {
      sharedGuildPairs = [['viewer', 'adult']];
      service.connect('adult', 'c1');
      service.setGame('adult', 'c1', 'hidden-game');
      await service.broadcastActivity('adult');
      expect(realtimeMock.emitToUser).toHaveBeenCalledWith('viewer', 'activity:update', {
        userId: 'adult',
        game: null,
      });
    });
  });

  describe('visibleOnlineFor — snapshot oyun satırı', () => {
    it('görebilen izleyiciye gameId + ad gelir; göremeyene gelmez', async () => {
      sharedGuildPairs = [['viewer', 'adult']];
      service.connect('adult', 'c1');
      service.setGame('adult', 'c1', 'g-a');
      let states = await service.visibleOnlineFor('viewer');
      expect(states).toEqual([
        { userId: 'adult', status: 'online', gameId: 'g-a', gameName: 'Oyun g-a' },
      ]);
      users['adult'].showGameActivity = false;
      states = await service.visibleOnlineFor('viewer');
      expect(states).toEqual([{ userId: 'adult', status: 'online' }]);
    });
  });
});
