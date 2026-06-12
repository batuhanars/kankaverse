import { FriendPermissionService } from './friend-permission.service';

// ── Mock PrismaService ───────────────────────────────────────────────────────
const prismaMock = {
  user: { findUnique: jest.fn() },
  userBlock: { findFirst: jest.fn() },
  friendship: { findFirst: jest.fn() },
  guildMember: { findFirst: jest.fn() },
};

function makeService() {
  return new FriendPermissionService(prismaMock as any);
}

// ── Helper: varsayılan mock'ları sıfırla ────────────────────────────────────
function resetMocks() {
  jest.resetAllMocks();
  prismaMock.userBlock.findFirst.mockResolvedValue(null);
  prismaMock.friendship.findFirst.mockResolvedValue(null);
  prismaMock.guildMember.findFirst.mockResolvedValue(null);
}

const ADULT = { id: 'adult1', isMinor: false };
const ADULT2 = { id: 'adult2', isMinor: false };
const MINOR = { id: 'minor1', isMinor: true };

describe('FriendPermissionService.canSendFriendRequest — §3 matrisi', () => {
  let service: FriendPermissionService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
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
});
