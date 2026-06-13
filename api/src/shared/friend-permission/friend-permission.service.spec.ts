import { FriendPermissionService } from './friend-permission.service';

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

// ── Mock ModerationService (Sprint 4B) ──────────────────────────────────────
// Varsayilan: BAN yok (enforcement geçirir) — BAN testleri moderation.service.spec.ts'te
const moderationMock = {
  hasActiveBan: jest.fn().mockResolvedValue(false),
};

function makeService() {
  return new FriendPermissionService(prismaMock as any, configMock as any, moderationMock as any);
}

// ── Helper: varsayılan mock'ları sıfırla ────────────────────────────────────
function resetMocks() {
  jest.resetAllMocks();
  prismaMock.userBlock.findFirst.mockResolvedValue(null);
  prismaMock.friendship.findFirst.mockResolvedValue(null);
  prismaMock.guildMember.findFirst.mockResolvedValue(null);
  // Varsayılan: quarantineHours=24
  configMock.get.mockReturnValue(24);
  // Sprint 4B: BAN yok (varsayılan — enforcement geçirir)
  moderationMock.hasActiveBan.mockResolvedValue(false);
}

// ── Zaman sabitleri ──────────────────────────────────────────────────────────
const NOW = new Date('2026-06-12T12:00:00.000Z').getTime();

const ADULT = { id: 'adult1', isMinor: false };
const ADULT2 = { id: 'adult2', isMinor: false };
const MINOR = { id: 'minor1', isMinor: true };

describe('FriendPermissionService.canSendFriendRequest — §3 matrisi', () => {
  let service: FriendPermissionService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Kural 1: kendi kendine ──────────────────────────────────────────────
  describe('Kural 1: kendi kendine istek', () => {
    it('CANNOT_FRIEND_SELF döner', async () => {
      const r = await service.canSendFriendRequest('u1', 'u1', 'CODE');
      expect(r).toEqual({ allowed: false, reason: 'CANNOT_FRIEND_SELF' });
    });
  });

  // ── Kural 2: kullanıcı yok ──────────────────────────────────────────────
  describe('Kural 2: kullanıcı yok', () => {
    it('sender yok → USER_NOT_FOUND', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(ADULT2);
      const r = await service.canSendFriendRequest('ghost', ADULT2.id, 'CODE');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });

    it('target yok → USER_NOT_FOUND', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(null);
      const r = await service.canSendFriendRequest(ADULT.id, 'ghost', 'CODE');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });
  });

  // ── Kural 3: blok ───────────────────────────────────────────────────────
  describe('Kural 3: blok (G3 — jenerik USER_NOT_FOUND)', () => {
    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
    });

    it('sender→target blok → USER_NOT_FOUND (BLOCKED sızdırmaz)', async () => {
      prismaMock.userBlock.findFirst.mockResolvedValue({ id: 'blk1' });
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'CODE');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });

    it('target→sender blok → USER_NOT_FOUND (jenerik)', async () => {
      prismaMock.userBlock.findFirst.mockResolvedValue({ id: 'blk2' });
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'USER_CLICK');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });
  });

  // ── Kural 4: zaten arkadaş ──────────────────────────────────────────────
  describe('Kural 4: zaten ACCEPTED', () => {
    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
    });

    it('ACCEPTED → ALREADY_FRIENDS', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED', requesterId: ADULT.id, addresseeId: ADULT2.id });
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'CODE');
      expect(r).toEqual({ allowed: false, reason: 'ALREADY_FRIENDS' });
    });
  });

  // ── Kural 5: bekleyen istek ──────────────────────────────────────────────
  describe('Kural 5: bekleyen istek', () => {
    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
    });

    it('karşıdan PENDING (addresseeId=sender) → allowed (otomatik kabul)', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        status: 'PENDING',
        requesterId: ADULT2.id,
        addresseeId: ADULT.id,
      });
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'CODE');
      expect(r).toEqual({ allowed: true });
    });

    it('aynı yönde PENDING (requesterId=sender) → REQUEST_EXISTS', async () => {
      prismaMock.friendship.findFirst.mockResolvedValue({
        status: 'PENDING',
        requesterId: ADULT.id,
        addresseeId: ADULT2.id,
      });
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'CODE');
      expect(r).toEqual({ allowed: false, reason: 'REQUEST_EXISTS' });
    });
  });

  // ── Kural 6: USER_CLICK ─────────────────────────────────────────────────
  describe('Kural 6: USER_CLICK — ortak ortam + yetişkin zorunlu', () => {
    it('ortak ortam yok → USER_NOT_FOUND (jenerik)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
      prismaMock.guildMember.findFirst.mockResolvedValue(null);
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'USER_CLICK');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });

    it('sender minör + ortak ortam → USER_NOT_FOUND (G1 — statü sızdırmaz)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(MINOR).mockResolvedValueOnce(ADULT2);
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      const r = await service.canSendFriendRequest(MINOR.id, ADULT2.id, 'USER_CLICK');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });

    it('target minör + ortak ortam → USER_NOT_FOUND (G1)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(MINOR);
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      const r = await service.canSendFriendRequest(ADULT.id, MINOR.id, 'USER_CLICK');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });

    it('her ikisi minör + ortak ortam → USER_NOT_FOUND (G1)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(MINOR).mockResolvedValueOnce({ id: 'minor2', isMinor: true });
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      const r = await service.canSendFriendRequest(MINOR.id, 'minor2', 'USER_CLICK');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });

    it('her ikisi yetişkin + ortak ortam → allowed', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'USER_CLICK');
      expect(r).toEqual({ allowed: true });
    });
  });

  // ── Kural 7: CODE — minör dahil açık ────────────────────────────────────
  describe('Kural 7: CODE — minör dahil açık', () => {
    it('sender minör + CODE → allowed', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(MINOR).mockResolvedValueOnce(ADULT2);
      const r = await service.canSendFriendRequest(MINOR.id, ADULT2.id, 'CODE');
      expect(r).toEqual({ allowed: true });
    });

    it('target minör + CODE → allowed', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(MINOR);
      const r = await service.canSendFriendRequest(ADULT.id, MINOR.id, 'CODE');
      expect(r).toEqual({ allowed: true });
    });

    it('her ikisi minör + CODE → allowed', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(MINOR).mockResolvedValueOnce({ id: 'minor2', isMinor: true });
      const r = await service.canSendFriendRequest(MINOR.id, 'minor2', 'CODE');
      expect(r).toEqual({ allowed: true });
    });

    it('her ikisi yetişkin + CODE + ortak ortam yok → allowed (CODE ortam gerektirmez)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
      // guildMember.findFirst çağrılmamalı — kural 7'ye kadar gelmiyor
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'CODE');
      expect(r).toEqual({ allowed: true });
      expect(prismaMock.guildMember.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── DECLINED geçmiş ─────────────────────────────────────────────────────
  describe('DECLINED geçmiş: yeniden istek', () => {
    it('eski DECLINED istek varsa → allowed (FriendsService upsert eder)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
      prismaMock.friendship.findFirst.mockResolvedValue({
        status: 'DECLINED',
        requesterId: ADULT.id,
        addresseeId: ADULT2.id,
      });
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'CODE');
      expect(r).toEqual({ allowed: true });
    });
  });

  // ── Kural 6a: Karantina (R7) — USER_CLICK ortak-ortam basamağı ──────────
  describe('Kural 6a karantina (R7): sender yeni üye → ortak-ortam basamağı geçmez', () => {
    // joinedAt sabitleri
    const ONE_HOUR_AGO = new Date(NOW - 1 * 60 * 60 * 1000);        // karantinada (24s içinde)
    const TWO_DAYS_AGO = new Date(NOW - 48 * 60 * 60 * 1000);        // yerleşik (24s dışında)

    it('sender karantinada (joinedAt 1 saat önce, quarantine 24s) → ortak-ortam null → USER_NOT_FOUND', async () => {
      configMock.get.mockReturnValue(24);
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
      // guildMember karantina filtresi eşleşmez → null döner
      prismaMock.guildMember.findFirst.mockResolvedValue(null);
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'USER_CLICK');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });

    it('sender yerleşik (joinedAt 48 saat önce, quarantine 24s) → ortak-ortam var → allowed', async () => {
      configMock.get.mockReturnValue(24);
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
      // guildMember karantina filtresi eşleşir → kayıt döner
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm-settled', joinedAt: TWO_DAYS_AGO });
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'USER_CLICK');
      expect(r).toEqual({ allowed: true });
    });

    it('quarantineHours=0 → karantina kapalı → ortak-ortam var → allowed', async () => {
      configMock.get.mockReturnValue(0); // karantina kapalı
      prismaMock.user.findUnique.mockResolvedValueOnce(ADULT).mockResolvedValueOnce(ADULT2);
      // cutoff=now → joinedAt { lt: now } — 1 saat önce katılmış dahil geçer
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm-any', joinedAt: ONE_HOUR_AGO });
      const r = await service.canSendFriendRequest(ADULT.id, ADULT2.id, 'USER_CLICK');
      expect(r).toEqual({ allowed: true });
    });

    it('karantina yalnız 6a USER_CLICK basamağını etkiler — G1 minör kalkanı bozulmaz', async () => {
      // Sender minör + ortak ortam → G1 devreye girmeli, 6a karantinaya ulaşılmamalı
      // (6b minör kontrolü, 6a'dan sonra gelir — ama guildMember.findFirst null dönerse
      //  6a zaten USER_NOT_FOUND verir; minör için karantinalı durumda test edelim)
      configMock.get.mockReturnValue(24);
      prismaMock.user.findUnique.mockResolvedValueOnce(MINOR).mockResolvedValueOnce(ADULT2);
      // Ortak ortam var ama sender minör → 6b engellenmeli
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1', joinedAt: TWO_DAYS_AGO });
      const r = await service.canSendFriendRequest(MINOR.id, ADULT2.id, 'USER_CLICK');
      expect(r).toEqual({ allowed: false, reason: 'USER_NOT_FOUND' });
    });
  });
});
