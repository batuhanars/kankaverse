import sharp from 'sharp';
import { CURATED_STEAM_APP_IDS, GameIconService } from './game-icon.service';

const HASH = '503acf3ef0503e24af6b5336012a1f585a2f955e';

const prismaMock = { game: { update: jest.fn(), findMany: jest.fn() } };
const storageMock = { putPublic: jest.fn() };
const configMock = { get: jest.fn(() => 'https://cdn.example.com') };

function itemsResponse(hash: unknown) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({ response: { store_items: [{ assets: { community_icon: hash } }] } }),
  };
}

async function jpegResponse(contentType = 'image/jpeg') {
  const buf = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#336699' },
  })
    .jpeg()
    .toBuffer();
  return {
    ok: true,
    headers: new Headers({ 'content-type': contentType, 'content-length': String(buf.length) }),
    arrayBuffer: () =>
      Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)),
  };
}

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

describe('GameIconService (C31c §1)', () => {
  let service: GameIconService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    configMock.get.mockReturnValue('https://cdn.example.com');
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    service = new GameIconService(prismaMock as any, storageMock as any, configMock as any);
  });

  it('Steam simgesi: karma bulunur, 64x64 WebP public depoya yazılır, kendi adresimiz döner', async () => {
    fetchMock
      .mockResolvedValueOnce(itemsResponse(HASH))
      .mockResolvedValueOnce(await jpegResponse());
    const url = await service.fetchAndStore('1466860');
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://cdn.fastly.steamstatic.com/steamcommunity/public/images/apps/1466860/${HASH}.jpg`,
    );
    const [key, body, type] = storageMock.putPublic.mock.calls[0];
    expect(key).toMatch(/^game-icons\/[0-9a-f-]{36}\.webp$/);
    expect(type).toBe('image/webp');
    const meta = await sharp(body).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([64, 64, 'webp']);
    expect(url).toBe(`https://cdn.example.com/${key}`);
  });

  it('başarısızlık yolları null: karma yok / geçersiz karma / image olmayan içerik / HTTP hatası', async () => {
    fetchMock.mockResolvedValueOnce(itemsResponse(undefined));
    expect(await service.fetchAndStore('1')).toBeNull();
    fetchMock.mockResolvedValueOnce(itemsResponse('../../etc'));
    expect(await service.fetchAndStore('1')).toBeNull();
    fetchMock
      .mockResolvedValueOnce(itemsResponse(HASH))
      .mockResolvedValueOnce(await jpegResponse('text/html'));
    expect(await service.fetchAndStore('1')).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: false });
    expect(await service.fetchAndStore('1')).toBeNull();
    expect(storageMock.putPublic).not.toHaveBeenCalled();
  });

  it('ensure: iconUrl DB yazılır, dinleyiciler haberdar edilir, ikinci deneme tekrar etmez', async () => {
    const ready = jest.fn();
    service.onIconReady(ready);
    fetchMock
      .mockResolvedValueOnce(itemsResponse(HASH))
      .mockResolvedValueOnce(await jpegResponse());
    service.ensure({ id: 'g1', source: 'STEAM', externalId: '1466860', iconUrl: null });
    await tick();
    expect(prismaMock.game.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { iconUrl: expect.stringMatching(/^https:\/\/cdn\.example\.com\/game-icons\//) },
    });
    expect(ready).toHaveBeenCalledWith('g1');
    service.ensure({ id: 'g1', source: 'STEAM', externalId: '1466860', iconUrl: null });
    await tick(20);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('null yolları: Epic, eşlemesiz CURATED ve zaten simgesi olan oyun için istek yok', async () => {
    service.ensure({ id: 'e', source: 'EPIC', externalId: 'abc', iconUrl: null });
    service.ensure({ id: 'c', source: 'CURATED', externalId: 'valorant', iconUrl: null });
    service.ensure({ id: 's', source: 'STEAM', externalId: '1', iconUrl: 'https://cdn/x.webp' });
    await tick(20);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CURATED: yalnız eşlemesi olan oyun Steam simgesi arar', () => {
    expect(service.steamAppIdFor({ source: 'CURATED', externalId: 'apex-legends' })).toBe(
      '1172470',
    );
    expect(service.steamAppIdFor({ source: 'CURATED', externalId: 'valorant' })).toBeNull();
    expect(Object.keys(CURATED_STEAM_APP_IDS)).toHaveLength(13);
  });

  it('Steam hata verince fırlatmaz, simge null kalır', async () => {
    fetchMock.mockRejectedValue(new Error('ağ'));
    service.ensure({ id: 'g2', source: 'STEAM', externalId: '5', iconUrl: null });
    await tick(20);
    expect(prismaMock.game.update).not.toHaveBeenCalled();
  });
});
