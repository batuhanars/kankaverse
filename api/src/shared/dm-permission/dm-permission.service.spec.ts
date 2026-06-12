import { DmPermissionService } from './dm-permission.service';

// ── Mock PrismaService ───────────────────────────────────────────────────────
const prismaMock = {
  user: { findUnique: jest.fn() },
  userBlock: { findFirst: jest.fn() },
  friendship: { findFirst: jest.fn() },
  guildMember: { findFirst: jest.fn() },
};

// ── Mock ConfigService ───────────────────────────────────────────────────────
const configMock = {
  get: jest.fn(),
};

function makeService() {
  return new DmPermissionService(prismaMock as any, configMock as any);
}

// ── Zaman sabitleri ──────────────────────────────────────────────────────────
// "Yerleşik": 30 gün önce açılmış hesap
const NOW = new Date('2026-06-12T12:00:00.000Z').getTime();
const THIRTY_DAYS_AGO = new Date(NOW - 30 * 24 * 60 * 60 * 1000);
// "Yeni": 3 gün önce açılmış (7 günlük lock içinde)
const THREE_DAYS_AGO = new Date(NOW - 3 * 24 * 60 * 60 * 1000);

// ── Helper: varsayılan mock'ları sıfırla ────────────────────────────────────
function resetMocks() {
  jest.resetAllMocks();
  prismaMock.userBlock.findFirst.mockResolvedValue(null);
  prismaMock.friendship.findFirst.mockResolvedValue(null);
  prismaMock.guildMember.findFirst.mockResolvedValue(null);
  // Varsayılan lock: 7 gün
  configMock.get.mockReturnValue(7);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ADULT_A = {
  id: 'adult-a',
  isMinor: false,
  dmPolicy: 'EVERYONE',
  verificationStatus: 'UNVERIFIED',
  createdAt: THIRTY_DAYS_AGO,
};

const ADULT_B = {
  id: 'adult-b',
  isMinor: false,
  dmPolicy: 'EVERYONE',
  verificationStatus: 'UNVERIFIED',
  createdAt: THIRTY_DAYS_AGO,
};

const MINOR_A = {
  id: 'minor-a',
  isMinor: true,
  dmPolicy: 'EVERYONE',
  verificationStatus: 'UNVERIFIED',
  createdAt: THIRTY_DAYS_AGO,
};

const MINOR_B = {
  id: 'minor-b',
  isMinor: true,
  dmPolicy: 'EVERYONE',
  verificationStatus: 'UNVERIFIED',
  createdAt: THIRTY_DAYS_AGO,
};

const NEW_ADULT_A = {
  id: 'new-adult-a',
  isMinor: false,
  dmPolicy: 'EVERYONE',
  verificationStatus: 'UNVERIFIED',
  createdAt: THREE_DAYS_AGO,
};

const NEW_ADULT_B = {
  id: 'new-adult-b',
  isMinor: false,
  dmPolicy: 'EVERYONE',
  verificationStatus: 'UNVERIFIED',
  createdAt: THREE_DAYS_AGO,
};

describe('DmPermissionService.canDm — §13 karar matrisi', () => {
  let service: DmPermissionService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    // Date.now() deterministik — her testte aynı NOW değerini kullan
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Kural 1: kendi kendine DM ────────────────────────────────────────────
  describe('Kural 1: kendi kendine DM', () => {
    it('senderId === targetId → CANNOT_DM_SELF', async () => {
      const r = await service.canDm('u1', 'u1');
      expect(r).toEqual({ allowed: false, reason: 'CANNOT_DM_SELF' });
      // Prisma çağrısı yapılmamalı
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── Kural 2: kullanıcı yok / silinmiş ────────────────────────────────────
  describe('Kural 2: kullanıcı bulunamadı (deletedAt veya gerçekten yok)', () => {
    it('sender yok → DM_NOT_ALLOWED (fail-closed)', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(ADULT_B);
      const r = await service.canDm('ghost', ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('target yok → DM_NOT_ALLOWED (fail-closed)', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(null);
      const r = await service.canDm(ADULT_A.id, 'ghost');
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('her ikisi de yok → DM_NOT_ALLOWED', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const r = await service.canDm('ghost1', 'ghost2');
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });
  });

  // ── Kural 3: blok ────────────────────────────────────────────────────────
  describe('Kural 3: blok (her iki yönde, arkadaşlıktan önce)', () => {
    beforeEach(() => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(ADULT_B);
    });

    it('sender→target blok → DM_NOT_ALLOWED (BLOCKED dışarı sızdırılmaz)', async () => {
      prismaMock.userBlock.findFirst.mockResolvedValue({
        id: 'blk1',
        blockerId: ADULT_A.id,
        blockedId: ADULT_B.id,
      });
      const r = await service.canDm(ADULT_A.id, ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('target→sender blok → DM_NOT_ALLOWED (ters yön de bloklar)', async () => {
      prismaMock.userBlock.findFirst.mockResolvedValue({
        id: 'blk2',
        blockerId: ADULT_B.id,
        blockedId: ADULT_A.id,
      });
      const r = await service.canDm(ADULT_A.id, ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('blok + ACCEPTED arkadaşlık birlikte → DM_NOT_ALLOWED (blok kazanır)', async () => {
      prismaMock.userBlock.findFirst.mockResolvedValue({ id: 'blk3' });
      // friendship'e hiç bakılmamalı — ama mock'ta ayarla
      prismaMock.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });
      const r = await service.canDm(ADULT_A.id, ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
      // Blok bulduktan sonra friendship sorgusu yapılmamalı
      expect(prismaMock.friendship.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── Kural 4: ACCEPTED arkadaş ────────────────────────────────────────────
  describe('Kural 4: ACCEPTED arkadaş → her zaman izinli', () => {
    it('iki yetişkin ACCEPTED arkadaş → allowed', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(ADULT_B);
      prismaMock.friendship.findFirst.mockResolvedValue({
        status: 'ACCEPTED',
        requesterId: ADULT_A.id,
        addresseeId: ADULT_B.id,
      });
      const r = await service.canDm(ADULT_A.id, ADULT_B.id);
      expect(r).toEqual({ allowed: true });
    });

    it('sender minör + ACCEPTED arkadaş → allowed (minör+arkadaş = izinli §13)', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(MINOR_A)
        .mockResolvedValueOnce(ADULT_B);
      prismaMock.friendship.findFirst.mockResolvedValue({
        status: 'ACCEPTED',
        requesterId: MINOR_A.id,
        addresseeId: ADULT_B.id,
      });
      const r = await service.canDm(MINOR_A.id, ADULT_B.id);
      expect(r).toEqual({ allowed: true });
    });

    it('target minör + ACCEPTED arkadaş → allowed', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(MINOR_B);
      prismaMock.friendship.findFirst.mockResolvedValue({
        status: 'ACCEPTED',
        requesterId: ADULT_A.id,
        addresseeId: MINOR_B.id,
      });
      const r = await service.canDm(ADULT_A.id, MINOR_B.id);
      expect(r).toEqual({ allowed: true });
    });

    it('her ikisi minör + ACCEPTED arkadaş → allowed', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(MINOR_A)
        .mockResolvedValueOnce(MINOR_B);
      prismaMock.friendship.findFirst.mockResolvedValue({
        status: 'ACCEPTED',
        requesterId: MINOR_A.id,
        addresseeId: MINOR_B.id,
      });
      const r = await service.canDm(MINOR_A.id, MINOR_B.id);
      expect(r).toEqual({ allowed: true });
    });
  });

  // ── Kural 4a: Yabancı + minör ────────────────────────────────────────────
  describe('Kural 4a: yabancı + minör → DM_NOT_ALLOWED', () => {
    beforeEach(() => {
      // Blok yok, arkadaş yok
      prismaMock.userBlock.findFirst.mockResolvedValue(null);
      prismaMock.friendship.findFirst.mockResolvedValue(null);
    });

    it('sender minör, target yetişkin yabancı → DM_NOT_ALLOWED', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(MINOR_A)
        .mockResolvedValueOnce(ADULT_B);
      const r = await service.canDm(MINOR_A.id, ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('sender yetişkin, target minör yabancı → DM_NOT_ALLOWED', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(MINOR_B);
      const r = await service.canDm(ADULT_A.id, MINOR_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('her ikisi minör yabancı → DM_NOT_ALLOWED', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(MINOR_A)
        .mockResolvedValueOnce(MINOR_B);
      const r = await service.canDm(MINOR_A.id, MINOR_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });
  });

  // ── Kural 4b: Yeni hesap DM lock ─────────────────────────────────────────
  describe('Kural 4b: yeni hesap DM lock (§5.1.b)', () => {
    beforeEach(() => {
      prismaMock.userBlock.findFirst.mockResolvedValue(null);
      prismaMock.friendship.findFirst.mockResolvedValue(null);
    });

    it('sender yeni hesap (3 gün, lock 7 gün) → DM_NOT_ALLOWED', async () => {
      configMock.get.mockReturnValue(7);
      prismaMock.user.findUnique
        .mockResolvedValueOnce(NEW_ADULT_A)
        .mockResolvedValueOnce(ADULT_B);
      const r = await service.canDm(NEW_ADULT_A.id, ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('target yeni hesap (3 gün, lock 7 gün) → DM_NOT_ALLOWED', async () => {
      configMock.get.mockReturnValue(7);
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(NEW_ADULT_B);
      const r = await service.canDm(ADULT_A.id, NEW_ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('her ikisi yeni hesap → DM_NOT_ALLOWED', async () => {
      configMock.get.mockReturnValue(7);
      prismaMock.user.findUnique
        .mockResolvedValueOnce(NEW_ADULT_A)
        .mockResolvedValueOnce(NEW_ADULT_B);
      const r = await service.canDm(NEW_ADULT_A.id, NEW_ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('sender 30 günlük (lock 7 gün) → lock geçer, dmPolicy EVERYONE → allowed', async () => {
      configMock.get.mockReturnValue(7);
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(ADULT_B);
      const r = await service.canDm(ADULT_A.id, ADULT_B.id);
      expect(r).toEqual({ allowed: true });
    });

    it('sender tam sınırda (7. gün, eşikten genç) → DM_NOT_ALLOWED', async () => {
      configMock.get.mockReturnValue(7);
      // Tam 7 gün önce = lock içinde (< lockMs değil, tam eşit = pass etmez çünkü < değil)
      // 7 * 24 * 60 * 60 * 1000 = 604800000ms — tam eşit: now - createdAt = lockMs (değil < lockMs)
      // Bu durumda now - createdAt === lockMs → koşul false → geçer
      // Eşiğin 1ms gerisinde olalım: 7 gün - 1ms önce açılmış → hâlâ yeni
      const justInsideLock = new Date(NOW - (7 * 24 * 60 * 60 * 1000 - 1));
      const newSender = { ...ADULT_A, id: 'just-inside', createdAt: justInsideLock };
      prismaMock.user.findUnique
        .mockResolvedValueOnce(newSender)
        .mockResolvedValueOnce(ADULT_B);
      const r = await service.canDm(newSender.id, ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('sender tam sınırın 1ms dışında (7 gün + 1ms) → lock geçer', async () => {
      configMock.get.mockReturnValue(7);
      const justOutsideLock = new Date(NOW - (7 * 24 * 60 * 60 * 1000 + 1));
      const settledSender = { ...ADULT_A, id: 'just-outside', createdAt: justOutsideLock };
      prismaMock.user.findUnique
        .mockResolvedValueOnce(settledSender)
        .mockResolvedValueOnce(ADULT_B);
      const r = await service.canDm(settledSender.id, ADULT_B.id);
      expect(r).toEqual({ allowed: true });
    });

    it('config newAccountDmLockDays tanımsızsa 7 gün default uygulanır', async () => {
      configMock.get.mockReturnValue(undefined); // config'de yok → ?? 7
      prismaMock.user.findUnique
        .mockResolvedValueOnce(NEW_ADULT_A) // 3 gün önce
        .mockResolvedValueOnce(ADULT_B);
      const r = await service.canDm(NEW_ADULT_A.id, ADULT_B.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });
  });

  // ── Kural 4c: dmPolicy matrisi ───────────────────────────────────────────
  describe('Kural 4c: dmPolicy matrisi (ikisi yetişkin + yerleşik yabancı)', () => {
    beforeEach(() => {
      prismaMock.userBlock.findFirst.mockResolvedValue(null);
      prismaMock.friendship.findFirst.mockResolvedValue(null);
      configMock.get.mockReturnValue(7);
    });

    it('target.dmPolicy = EVERYONE → allowed', async () => {
      const targetEveryone = { ...ADULT_B, dmPolicy: 'EVERYONE' };
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(targetEveryone);
      const r = await service.canDm(ADULT_A.id, targetEveryone.id);
      expect(r).toEqual({ allowed: true });
    });

    it('target.dmPolicy = FRIENDS + ortak sunucu var → allowed', async () => {
      const targetFriends = { ...ADULT_B, id: 'adult-b-friends', dmPolicy: 'FRIENDS' };
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(targetFriends);
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      const r = await service.canDm(ADULT_A.id, targetFriends.id);
      expect(r).toEqual({ allowed: true });
    });

    it('target.dmPolicy = FRIENDS + ortak sunucu yok → DM_NOT_ALLOWED', async () => {
      const targetFriends = { ...ADULT_B, id: 'adult-b-friends2', dmPolicy: 'FRIENDS' };
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(targetFriends);
      prismaMock.guildMember.findFirst.mockResolvedValue(null);
      const r = await service.canDm(ADULT_A.id, targetFriends.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('target.dmPolicy = NONE → DM_NOT_ALLOWED', async () => {
      const targetNone = { ...ADULT_B, id: 'adult-b-none', dmPolicy: 'NONE' };
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(targetNone);
      const r = await service.canDm(ADULT_A.id, targetNone.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('target.dmPolicy = bilinmeyen değer → DM_NOT_ALLOWED (fail-closed default)', async () => {
      const targetUnknown = { ...ADULT_B, id: 'adult-b-unknown', dmPolicy: 'UNKNOWN_POLICY' };
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(targetUnknown);
      const r = await service.canDm(ADULT_A.id, targetUnknown.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });

    it('target.dmPolicy = null/undefined → DM_NOT_ALLOWED (fail-closed default)', async () => {
      const targetNull = { ...ADULT_B, id: 'adult-b-null', dmPolicy: null };
      prismaMock.user.findUnique
        .mockResolvedValueOnce(ADULT_A)
        .mockResolvedValueOnce(targetNull);
      const r = await service.canDm(ADULT_A.id, targetNull.id);
      expect(r).toEqual({ allowed: false, reason: 'DM_NOT_ALLOWED' });
    });
  });
});
