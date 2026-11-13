import { groupVisibility, isHiddenBeforeJoin, preJoinEncryptedFilter } from './pre-join.util';

/** C65 §4/§5: dönem farkında katılım öncesi şifreli süzgeç (tek yardımcı). */
const at = (d: number) => new Date(Date.UTC(2026, 10, d));
const JOINED = at(10);

describe('preJoinEncryptedFilter', () => {
  it('görünürlük yok (GROUP_DM değil) → süzgeç yok', () => {
    expect(preJoinEncryptedFilter(null)).toEqual({});
    expect(preJoinEncryptedFilter(undefined)).toEqual({});
  });

  it('geçmiş dönemi olmayan üye: eski şekil BİT-BİT aynı', () => {
    expect(preJoinEncryptedFilter({ joinedAt: JOINED, periods: [] })).toEqual({
      NOT: { encrypted: true, createdAt: { lt: JOINED } },
    });
  });

  it('dönemli üye: şifreli VE joinedAt öncesi VE hiçbir dönemde olmayan gizlenir (açık dışlama)', () => {
    const periods = [
      { from: at(1), to: at(3) },
      { from: at(5), to: at(6) },
    ];
    expect(preJoinEncryptedFilter({ joinedAt: JOINED, periods })).toEqual({
      NOT: {
        encrypted: true,
        createdAt: { lt: JOINED },
        NOT: [{ createdAt: { gte: at(1), lte: at(3) } }, { createdAt: { gte: at(5), lte: at(6) } }],
      },
    });
  });
});

describe('isHiddenBeforeJoin', () => {
  const vis = { joinedAt: JOINED, periods: [{ from: at(1), to: at(3) }] };
  const enc = (d: number) => ({ encrypted: true, createdAt: at(d) });

  it('dönem içi şifreli görünür, dönemler arası (dışarıdayken) gizli, katılım sonrası görünür', () => {
    expect(isHiddenBeforeJoin(enc(2), vis)).toBe(false);
    expect(isHiddenBeforeJoin(enc(5), vis)).toBe(true);
    expect(isHiddenBeforeJoin(enc(11), vis)).toBe(false);
  });
  it('dönem sınırları dahil; düz mesaj hiç gizlenmez; görünürlük yoksa gizli değil', () => {
    expect(isHiddenBeforeJoin(enc(1), vis)).toBe(false);
    expect(isHiddenBeforeJoin(enc(3), vis)).toBe(false);
    expect(isHiddenBeforeJoin({ encrypted: false, createdAt: at(5) }, vis)).toBe(false);
    expect(isHiddenBeforeJoin(enc(5), null)).toBe(false);
  });
  it('geçmiş dönemi olmayan üyede eski kural (joinedAt öncesi şifreli gizli)', () => {
    const plain = { joinedAt: JOINED, periods: [] };
    expect(isHiddenBeforeJoin(enc(5), plain)).toBe(true);
    expect(isHiddenBeforeJoin(enc(10), plain)).toBe(false);
  });
});

describe('groupVisibility', () => {
  const prisma = {
    channelMember: { findUnique: jest.fn() },
    groupDmPastPeriod: { findMany: jest.fn() },
  };
  beforeEach(() => jest.resetAllMocks());

  it('GROUP_DM değil → null, hiç sorgu yok', async () => {
    expect(await groupVisibility(prisma as never, { id: 'c', type: 'DM' }, 'u')).toBeNull();
    expect(prisma.channelMember.findUnique).not.toHaveBeenCalled();
    expect(prisma.groupDmPastPeriod.findMany).not.toHaveBeenCalled();
  });
  it('aktif üye: katılım + dönemler', async () => {
    prisma.channelMember.findUnique.mockResolvedValue({ createdAt: JOINED });
    prisma.groupDmPastPeriod.findMany.mockResolvedValue([{ joinedAt: at(1), leftAt: at(3) }]);
    expect(await groupVisibility(prisma as never, { id: 'c', type: 'GROUP_DM' }, 'u')).toEqual({
      joinedAt: JOINED,
      periods: [{ from: at(1), to: at(3) }],
    });
  });
  it('eski üye: joinedAt override, üyelik sorgusu yok; satırı olmayan yabancı null', async () => {
    prisma.groupDmPastPeriod.findMany.mockResolvedValue([]);
    const v = await groupVisibility(prisma as never, { id: 'c', type: 'GROUP_DM' }, 'u', at(7));
    expect(v).toEqual({ joinedAt: at(7), periods: [] });
    expect(prisma.channelMember.findUnique).not.toHaveBeenCalled();
    prisma.channelMember.findUnique.mockResolvedValue(null);
    expect(await groupVisibility(prisma as never, { id: 'c', type: 'GROUP_DM' }, 'x')).toBeNull();
  });
});
