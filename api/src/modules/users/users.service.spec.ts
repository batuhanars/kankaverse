import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

// ── Mock PrismaService ───────────────────────────────────────────────────────
const prismaMock = {
  user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  guildMember: { findFirst: jest.fn() },
  channelMember: { findFirst: jest.fn() },
  guild: { findMany: jest.fn() },
  friendship: { findFirst: jest.fn(), findMany: jest.fn() },
  userBlock: { findUnique: jest.fn() },
};

function makeService() {
  return new UsersService(prismaMock as any);
}

const NOW_ISO = '2026-01-02T03:04:05.000Z';
const CREATED_AT = new Date(NOW_ISO);

function resetMocks() {
  jest.resetAllMocks();
  prismaMock.guildMember.findFirst.mockResolvedValue(null);
  prismaMock.channelMember.findFirst.mockResolvedValue(null);
  prismaMock.guild.findMany.mockResolvedValue([]);
  prismaMock.friendship.findFirst.mockResolvedValue(null);
  prismaMock.friendship.findMany.mockResolvedValue([]);
  prismaMock.userBlock.findUnique.mockResolvedValue(null);
  prismaMock.user.findMany.mockResolvedValue([]);
}

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ── PATCH /users/me ────────────────────────────────────────────────────────
  describe('updateProfile', () => {
    it('yalnız verilen alanları günceller (bio + dmPolicy)', async () => {
      const updated = {
        id: 'u1',
        username: 'kanka',
        email: 'k@x.tr',
        avatarUrl: null,
        bio: 'merhaba',
        dmPolicy: 'FRIENDS',
        isMinor: false,
        verificationStatus: 'NONE',
        createdAt: CREATED_AT,
        emailVerifiedAt: null,
        twoFactorEnabled: false,
        isModerator: false,
        friendCode: 'ABC123',
      };
      prismaMock.user.update.mockResolvedValue(updated);

      const dto = { bio: 'merhaba', dmPolicy: 'FRIENDS' as const };
      const res = await service.updateProfile('u1', dto);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { bio: 'merhaba', dmPolicy: 'FRIENDS' },
      });
      expect(res.bio).toBe('merhaba');
      expect(res.dmPolicy).toBe('FRIENDS');
    });

    it('undefined alan → data objesine girmez (değişmez)', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 'u1',
        username: 'kanka',
        email: 'k@x.tr',
        avatarUrl: null,
        bio: 'eski',
        dmPolicy: 'EVERYONE',
        isMinor: false,
        verificationStatus: 'NONE',
        createdAt: CREATED_AT,
        emailVerifiedAt: null,
        twoFactorEnabled: false,
        isModerator: false,
        friendCode: 'ABC123',
      });

      await service.updateProfile('u1', { dmPolicy: 'EVERYONE' as const });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { dmPolicy: 'EVERYONE' },
      });
      // bio gönderilmedi → data'da yok
      const callArg = prismaMock.user.update.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty('bio');
    });

    it('boş dto → boş data (hiçbir alan değişmez)', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 'u1',
        username: 'kanka',
        email: 'k@x.tr',
        avatarUrl: null,
        bio: null,
        dmPolicy: 'FRIENDS',
        isMinor: false,
        verificationStatus: 'NONE',
        createdAt: CREATED_AT,
        emailVerifiedAt: null,
        twoFactorEnabled: false,
        isModerator: false,
        friendCode: 'ABC123',
      });

      await service.updateProfile('u1', {});

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {},
      });
    });
  });

  // ── GET /users/:id/card — erişim kapısı KORUNDU ──────────────────────────────
  describe('getUserCard — erişim kapısı (R7)', () => {
    const CALLER = 'caller-1';
    const TARGET = 'target-1';

    function mockTargetExists(extra: Partial<{ bio: string | null }> = {}) {
      prismaMock.user.findUnique.mockResolvedValue({
        id: TARGET,
        username: 'hedef',
        avatarUrl: null,
        bio: extra.bio ?? null,
        createdAt: CREATED_AT,
      });
    }

    it('hedef yok → 404 USER_NOT_FOUND', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserCard(CALLER, TARGET)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ortak ortam YOK + ilişki YOK + ortak GROUP_DM YOK → 404 (o-beni-engelledi sızmaz)', async () => {
      mockTargetExists();
      // sharedGuild null, sharedGroupDm null, friendship null, callerBlock null, targetBlock null (resetMocks)
      await expect(service.getUserCard(CALLER, TARGET)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ortak GROUP_DM üyeliği tek başına ilişki sayılır → kart döner (404 değil)', async () => {
      mockTargetExists({ bio: 'grup selam' });
      // ortak ortam/arkadaşlık/blok YOK; yalnız ortak GROUP_DM üyeliği var
      prismaMock.channelMember.findFirst.mockResolvedValue({ id: 'cm1' });
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.id).toBe(TARGET);
      expect(card.bio).toBe('grup selam');
      // GROUP_DM kapısı sorgusu doğru tipte
      const cmArg = prismaMock.channelMember.findFirst.mock.calls[0][0];
      expect(cmArg.where.userId).toBe(CALLER);
      expect(cmArg.where.channel.type).toBe('GROUP_DM');
      expect(cmArg.where.channel.members.some.userId).toBe(TARGET);
    });

    it('"o beni engelledi" (targetBlock) tek başına ilişki sayılır AMA selfBlocked sızmaz', async () => {
      mockTargetExists();
      // targetBlock var (target→caller), callerBlock yok
      prismaMock.userBlock.findUnique
        .mockResolvedValueOnce(null) // callerBlock
        .mockResolvedValueOnce({ id: 'blk' }); // targetBlock
      const card = await service.getUserCard(CALLER, TARGET);
      // selfBlocked yalnız callerBlock'u yansıtır → false
      expect(card.selfBlocked).toBe(false);
    });

    it('ortak ortam var → kart döner + genişletilmiş alanlar', async () => {
      mockTargetExists({ bio: 'selam' });
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.id).toBe(TARGET);
      expect(card.bio).toBe('selam');
      expect(card.memberSince).toBe(NOW_ISO);
      expect(card).toHaveProperty('mutualFriends');
      expect(card).toHaveProperty('mutualGuilds');
    });

    it('genişletilmiş alanların hiçbiri minör/yaş taşımaz', async () => {
      mockTargetExists();
      prismaMock.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        status: 'ACCEPTED',
        requesterId: CALLER,
        addresseeId: TARGET,
      });
      const card = await service.getUserCard(CALLER, TARGET);
      expect(card).not.toHaveProperty('isMinor');
      expect(card).not.toHaveProperty('birthDate');
      expect(card).not.toHaveProperty('verificationStatus');
    });

    it('kendi kartı (self) → bio/memberSince döner, mutual listeler boş', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: CALLER,
        username: 'ben',
        avatarUrl: null,
        bio: 'kendi bio',
        createdAt: CREATED_AT,
      });
      const card = await service.getUserCard(CALLER, CALLER);
      expect(card.friendStatus).toBe('self');
      expect(card.bio).toBe('kendi bio');
      expect(card.memberSince).toBe(NOW_ISO);
      expect(card.mutualFriends).toEqual([]);
      expect(card.mutualGuilds).toEqual([]);
    });
  });

  // ── Mutual hesap mantığı ─────────────────────────────────────────────────────
  describe('getUserCard — mutual kesişim', () => {
    const CALLER = 'caller-1';
    const TARGET = 'target-1';

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: TARGET,
        username: 'hedef',
        avatarUrl: null,
        bio: null,
        createdAt: CREATED_AT,
      });
      // erişim kapısı geçsin
      prismaMock.guildMember.findFirst.mockResolvedValue({ id: 'gm1' });
    });

    it('mutualFriends = caller ∩ target ACCEPTED arkadaş kesişimi', async () => {
      // caller arkadaşları: A, B, C   target arkadaşları: B, C, D  → kesişim B, C
      prismaMock.friendship.findMany
        .mockResolvedValueOnce([
          { requesterId: CALLER, addresseeId: 'A' },
          { requesterId: 'B', addresseeId: CALLER },
          { requesterId: CALLER, addresseeId: 'C' },
        ]) // caller
        .mockResolvedValueOnce([
          { requesterId: TARGET, addresseeId: 'B' },
          { requesterId: 'C', addresseeId: TARGET },
          { requesterId: TARGET, addresseeId: 'D' },
        ]); // target
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'B', username: 'b', avatarUrl: null },
        { id: 'C', username: 'c', avatarUrl: null },
      ]);

      const card = await service.getUserCard(CALLER, TARGET);

      // user.findMany çağrısı sadece kesişim id'leriyle yapıldı
      const findManyArg = prismaMock.user.findMany.mock.calls[0][0];
      expect(findManyArg.where.id.in.sort()).toEqual(['B', 'C']);
      expect(card.mutualFriends.map((f) => f.id).sort()).toEqual(['B', 'C']);
    });

    it('kesişim yoksa mutualFriends boş, user.findMany çağrılmaz', async () => {
      prismaMock.friendship.findMany
        .mockResolvedValueOnce([{ requesterId: CALLER, addresseeId: 'A' }])
        .mockResolvedValueOnce([{ requesterId: TARGET, addresseeId: 'D' }]);

      const card = await service.getUserCard(CALLER, TARGET);
      expect(card.mutualFriends).toEqual([]);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('mutualGuilds = caller ve target ORTAK üye olduğu guild (deletedAt null)', async () => {
      prismaMock.guild.findMany.mockResolvedValue([
        { id: 'g1', name: 'Ortam 1', iconUrl: null },
        { id: 'g2', name: 'Ortam 2', iconUrl: 'i.png' },
      ]);
      const card = await service.getUserCard(CALLER, TARGET);

      const guildArg = prismaMock.guild.findMany.mock.calls[0][0];
      expect(guildArg.where.deletedAt).toBeNull();
      expect(guildArg.where.members.some.userId).toBe(CALLER);
      expect(guildArg.where.AND[0].members.some.userId).toBe(TARGET);
      expect(card.mutualGuilds).toEqual([
        { id: 'g1', name: 'Ortam 1', iconUrl: null },
        { id: 'g2', name: 'Ortam 2', iconUrl: 'i.png' },
      ]);
    });
  });
});
