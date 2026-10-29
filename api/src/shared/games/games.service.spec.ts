import { Prisma } from '@prisma/client';
import { GamesService, GAMES_DAILY_NEW_LIMIT } from './games.service';

const prismaMock = {
  game: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
};
const automodMock = { check: jest.fn() };

function makeService() {
  return new GamesService(prismaMock as any, automodMock as any);
}

function steamResponse(appId: string, name: string, type = 'game') {
  return {
    ok: true,
    json: () => Promise.resolve({ [appId]: { success: true, data: { name, type } } }),
  };
}

describe('GamesService (C31b §1)', () => {
  let service: GamesService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    automodMock.check.mockReturnValue({ blocked: false });
    prismaMock.game.findUnique.mockResolvedValue(null);
    prismaMock.game.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `new-${data.externalId}`, name: data.name }),
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    service = makeService();
  });

  it('bilinmeyen / bozuk ref reddedilir', async () => {
    for (const ref of [undefined, 42, '', 'valorant', 'foo:bar', 'steam:abc', 'steam:', 'epic:x']) {
      expect(await service.resolve(ref, { userId: 'u1' })).toBeNull();
    }
    expect(prismaMock.game.create).not.toHaveBeenCalled();
  });

  it('curated: yalnız tablodaki, gizli olmayan CURATED kaydı çözülür', async () => {
    prismaMock.game.findFirst.mockResolvedValue({ id: 'curated_valorant', name: 'Valorant' });
    expect(await service.resolve('curated:curated_valorant', { userId: 'u1' })).toEqual({
      id: 'curated_valorant',
      name: 'Valorant',
    });
    expect(prismaMock.game.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'curated_valorant', source: 'CURATED', hidden: false },
      }),
    );
    prismaMock.game.findFirst.mockResolvedValue(null);
    expect(await service.resolve('curated:yok', { userId: 'u1' })).toBeNull();
  });

  it('steam: ad istemciden ALINMAZ, mağazadan gelen ad yazılır', async () => {
    fetchMock.mockResolvedValue(steamResponse('730', 'Counter-Strike 2'));
    const game = await service.resolve('steam:730', { userId: 'u1', epicName: 'SAHTE AD' });
    expect(game).toEqual({ id: 'new-730', name: 'Counter-Strike 2' });
    expect(prismaMock.game.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { source: 'STEAM', externalId: '730', name: 'Counter-Strike 2' },
      }),
    );
  });

  it('steam: mağaza hatası / oyun olmayan uygulama → kayıt açılmaz', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ağ'));
    expect(await service.resolve('steam:1', { userId: 'u1' })).toBeNull();
    fetchMock.mockResolvedValueOnce(steamResponse('2', 'Araç', 'software'));
    expect(await service.resolve('steam:2', { userId: 'u1' })).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: false });
    expect(await service.resolve('steam:3', { userId: 'u1' })).toBeNull();
    expect(prismaMock.game.create).not.toHaveBeenCalled();
  });

  it('steam: aynı appid için eşzamanlı istekler tek çekime düşer', async () => {
    fetchMock.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(steamResponse('730', 'CS2')), 10)),
    );
    await Promise.all([
      service.resolve('steam:730', { userId: 'u1' }),
      service.resolve('steam:730', { userId: 'u2' }),
      service.resolve('steam:730', { userId: 'u3' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('steam: tabloda varsa mağazaya gidilmez; hidden ise null', async () => {
    prismaMock.game.findUnique.mockResolvedValue({ id: 'g1', name: 'CS2', hidden: false });
    expect(await service.resolve('steam:730', { userId: 'u1' })).toEqual({ id: 'g1', name: 'CS2' });
    prismaMock.game.findUnique.mockResolvedValue({ id: 'g1', name: 'CS2', hidden: true });
    expect(await service.resolve('steam:730', { userId: 'u1' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('epic: automod süzgecine takılan ad kayıt açmaz', async () => {
    automodMock.check.mockReturnValue({ blocked: true });
    const ref = 'epic:abcdef1234567890abcdef1234567890';
    expect(await service.resolve(ref, { userId: 'u1', epicName: 'küfürlü ad' })).toBeNull();
    expect(prismaMock.game.create).not.toHaveBeenCalled();
  });

  it('epic: ad yok / çok uzun / kontrol karakteri → kayıt açmaz', async () => {
    const ref = 'epic:abcdef1234567890abcdef1234567890';
    expect(await service.resolve(ref, { userId: 'u1' })).toBeNull();
    expect(await service.resolve(ref, { userId: 'u1', epicName: '   ' })).toBeNull();
    expect(await service.resolve(ref, { userId: 'u1', epicName: 'x'.repeat(65) })).toBeNull();
    expect(await service.resolve(ref, { userId: 'u1', epicName: 'ad‮ters' })).toBeNull();
    expect(prismaMock.game.create).not.toHaveBeenCalled();
  });

  it('epic: ilk gelen ad kilitlenir, ikinci farklı ad tablodaki adı değiştirmez', async () => {
    const ref = 'epic:abcdef1234567890abcdef1234567890';
    const first = await service.resolve(ref, { userId: 'u1', epicName: 'Fortnite' });
    expect(first?.name).toBe('Fortnite');
    prismaMock.game.findUnique.mockResolvedValue({ id: 'e1', name: 'Fortnite', hidden: false });
    const second = await service.resolve(ref, { userId: 'u2', epicName: 'Başka Ad' });
    expect(second).toEqual({ id: 'e1', name: 'Fortnite' });
    expect(prismaMock.game.create).toHaveBeenCalledTimes(1);
  });

  it('epic: eşzamanlı yarışta (P2002) kazananın adı döner', async () => {
    const ref = 'epic:abcdef1234567890abcdef1234567890';
    prismaMock.game.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    prismaMock.game.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'e1', name: 'Kazanan', hidden: false });
    expect(await service.resolve(ref, { userId: 'u1', epicName: 'Kaybeden' })).toEqual({
      id: 'e1',
      name: 'Kazanan',
    });
  });

  it('epic: hidden oyun yayılmaz', async () => {
    prismaMock.game.findUnique.mockResolvedValue({ id: 'e1', name: 'X', hidden: true });
    const ref = 'epic:abcdef1234567890abcdef1234567890';
    expect(await service.resolve(ref, { userId: 'u1', epicName: 'X' })).toBeNull();
  });

  it('günlük yeni kayıt sınırı: kullanıcı başına 20, sonrası null', async () => {
    for (let i = 0; i < GAMES_DAILY_NEW_LIMIT; i++) {
      const id = `epic:abcdef12345678900000${String(i).padStart(4, '0')}`;
      expect(await service.resolve(id, { userId: 'u1', epicName: `Oyun ${i}` })).not.toBeNull();
    }
    const over = await service.resolve('epic:abcdef1234567890ffffffffffff', {
      userId: 'u1',
      epicName: 'Fazla',
    });
    expect(over).toBeNull();
    // başka kullanıcı etkilenmez
    const other = await service.resolve('epic:abcdef1234567890eeeeeeeeeeee', {
      userId: 'u2',
      epicName: 'Başka',
    });
    expect(other).not.toBeNull();
  });

  it('listCurated 1 saat önbelleğe alınır', async () => {
    prismaMock.game.findMany.mockResolvedValue([{ id: 'c1', name: 'A', executables: ['a.exe'] }]);
    await service.listCurated();
    await service.listCurated();
    expect(prismaMock.game.findMany).toHaveBeenCalledTimes(1);
  });
});
