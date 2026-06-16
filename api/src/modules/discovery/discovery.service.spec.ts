import { DiscoveryService } from './discovery.service';

// ── Mock PrismaService ───────────────────────────────────────────────────────
const prismaMock = {
  user: { findUnique: jest.fn() },
  guild: { findMany: jest.fn() },
};

function makeService() {
  return new DiscoveryService(prismaMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
}

function makeGuild(over: Partial<any> = {}) {
  return {
    id: 'g1',
    name: 'Ortam',
    iconUrl: null,
    bannerColor: null,
    description: null,
    adultsOnly: false,
    tags: [],
    _count: { members: 3 },
    createdAt: new Date(),
    ...over,
  };
}

describe('DiscoveryService.listGuilds — [R7 KRİTİK] adultsOnly minör süzme', () => {
  let service: DiscoveryService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.guild.findMany.mockResolvedValue([makeGuild()]);
  });

  it('minör görüntüleyici → where.adultsOnly === false (adultsOnly ortamlar süzülür)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

    await service.listGuilds('minor1', {});

    const where = prismaMock.guild.findMany.mock.calls[0][0].where;
    expect(where.discoverable).toBe(true);
    expect(where.deletedAt).toBeNull();
    expect(where.adultsOnly).toBe(false); // KRİTİK: minör süzme
  });

  it('yetişkin görüntüleyici → where.adultsOnly KISITI YOK (hepsini görür)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });

    await service.listGuilds('adult1', {});

    const where = prismaMock.guild.findMany.mock.calls[0][0].where;
    expect(where.adultsOnly).toBeUndefined(); // kısıt yok → adultsOnly dahil hepsi
  });

  it('viewer bulunamazsa fail-closed → minör kabul (adultsOnly süzülür)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await service.listGuilds('ghost', {});

    const where = prismaMock.guild.findMany.mock.calls[0][0].where;
    expect(where.adultsOnly).toBe(false);
  });

  it('search + tag → where.name contains insensitive + tags.has normalize', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });

    await service.listGuilds('adult1', { search: '  Oyun ', tag: '  MUZIK ' });

    const where = prismaMock.guild.findMany.mock.calls[0][0].where;
    expect(where.name).toEqual({ contains: 'Oyun', mode: 'insensitive' });
    expect(where.tags).toEqual({ has: 'muzik' });
  });

  it('memberCount azalan sıralama + memberCount _count.members map + nextCursor', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    // 31 sonuç döndür (PAGE_LIMIT+1) → hasMore=true
    const many = Array.from({ length: 31 }, (_, i) => makeGuild({ id: `g${i}`, _count: { members: 31 - i } }));
    prismaMock.guild.findMany.mockResolvedValue(many);

    const res = await service.listGuilds('adult1', {});

    const orderBy = prismaMock.guild.findMany.mock.calls[0][0].orderBy;
    expect(orderBy[0]).toEqual({ members: { _count: 'desc' } });
    expect(res.items).toHaveLength(30); // limit
    expect(res.items[0].memberCount).toBe(31);
    expect(res.nextCursor).toBe('30'); // offset 0 + 30
  });

  it('cursor → skip offset olarak decode edilir', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    await service.listGuilds('adult1', { cursor: '30' });
    expect(prismaMock.guild.findMany.mock.calls[0][0].skip).toBe(30);
  });
});

describe('DiscoveryService.popularTags', () => {
  let service: DiscoveryService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('discoverable ortamların etiketlerini sayar, azalan döner', async () => {
    prismaMock.guild.findMany.mockResolvedValue([
      { tags: ['oyun', 'müzik'] },
      { tags: ['oyun', 'sohbet'] },
      { tags: ['oyun'] },
    ]);

    const res = await service.popularTags();
    expect(res[0]).toEqual({ tag: 'oyun', count: 3 });
    expect(res.find((t) => t.tag === 'müzik')?.count).toBe(1);
    // yalnız discoverable + deletedAt:null sorgulanır
    expect(prismaMock.guild.findMany.mock.calls[0][0].where).toEqual({ discoverable: true, deletedAt: null });
  });
});
