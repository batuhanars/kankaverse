import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { GuildJoinService } from '../../shared/guild-join/guild-join.service';

// ── Mock PrismaService ───────────────────────────────────────────────────────
const prismaMock = {
  invite: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  guildMember: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  guildBan: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Mock MembershipService ───────────────────────────────────────────────────
const membershipMock = {
  requireGuildMembership: jest.fn(),
};

const permissionsMock = {
  hasGuildPermission: jest.fn().mockResolvedValue(true),
  requireMemberHierarchy: jest.fn().mockResolvedValue(undefined),
  requireRoleHierarchy: jest.fn().mockResolvedValue(undefined),
};

const realtimeMock = { emitToUser: jest.fn(), emitToUsers: jest.fn(), emitToRoom: jest.fn() };

function makeService() {
  // GuildJoinService gerçek örnek — Sprint 7A gate'i tek kaynaktan paylaşılır (duplike değil).
  // Aynı prismaMock + realtimeMock ile wire edilir; mevcut kapı testleri aynen geçer.
  const guildJoin = new GuildJoinService(prismaMock as any, realtimeMock as any);
  return new InvitesService(prismaMock as any, membershipMock as any, permissionsMock as any, guildJoin);
}

function resetMocks() {
  jest.resetAllMocks();
  permissionsMock.hasGuildPermission.mockResolvedValue(true);
  permissionsMock.requireMemberHierarchy.mockResolvedValue(undefined);
  permissionsMock.requireRoleHierarchy.mockResolvedValue(undefined);
  // Varsayılan: kullanıcı yasaklı değil (join testlerinin çoğu için)
  prismaMock.guildBan.findUnique.mockResolvedValue(null);
}

// ── Fixture helpers ──────────────────────────────────────────────────────────
const GUILD_NORMAL = { id: 'guild1', name: 'Oyun Klanı', ownerId: 'owner1', adultsOnly: false, iconUrl: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
const GUILD_ADULTS = { ...GUILD_NORMAL, id: 'guild2', adultsOnly: true };

function makeInvite(overrides: Partial<{
  id: string; code: string; guildId: string; guild: typeof GUILD_NORMAL;
  maxUses: number | null; uses: number; expiresAt: Date | null; deletedAt: Date | null; createdAt: Date;
}> = {}) {
  return {
    id: 'inv1',
    code: 'ABCD1234',
    guildId: GUILD_NORMAL.id,
    guild: GUILD_NORMAL,
    maxUses: null,
    uses: 0,
    expiresAt: null,
    deletedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── createInvite ─────────────────────────────────────────────────────────────
describe('InvitesService.createInvite', () => {
  let service: InvitesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('OWNER → davet oluşturur', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_NORMAL,
      membership: { role: 'OWNER' },
    });
    prismaMock.invite.findUnique.mockResolvedValue(null); // kod çakışması yok
    const inv = makeInvite();
    prismaMock.invite.create.mockResolvedValue(inv);

    const result = await service.createInvite('owner1', GUILD_NORMAL.id, {});
    expect(result.code).toBe('ABCD1234');
    expect(result.guildId).toBe(GUILD_NORMAL.id);
  });

  it('ADMIN → davet oluşturur', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_NORMAL,
      membership: { role: 'ADMIN' },
    });
    prismaMock.invite.findUnique.mockResolvedValue(null);
    const inv = makeInvite();
    prismaMock.invite.create.mockResolvedValue(inv);

    const result = await service.createInvite('admin1', GUILD_NORMAL.id, {});
    expect(result.code).toBeDefined();
  });

  it('MEMBER rolüyle → 403 FORBIDDEN', async () => {
    membershipMock.requireGuildMembership.mockResolvedValue({
      guild: GUILD_NORMAL,
      membership: { role: 'MEMBER' },
    });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.createInvite('member1', GUILD_NORMAL.id, {}))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ── joinByInvite ─────────────────────────────────────────────────────────────
describe('InvitesService.joinByInvite — [R7] kapı sırası', () => {
  let service: InvitesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // 1. Geçersiz davet → INVITE_INVALID
  it('davet bulunamadı → 404 INVITE_INVALID', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(null);

    await expect(service.joinByInvite('user1', 'BADCODE'))
      .rejects.toBeInstanceOf(NotFoundException);

    try {
      await service.joinByInvite('user1', 'BADCODE');
    } catch (e: any) {
      expect(e.response?.error).toBe('INVITE_INVALID');
    }
  });

  it('iptal edilmiş davet (deletedAt!=null) → 404 INVITE_INVALID', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(
      makeInvite({ deletedAt: new Date() }),
    );

    await expect(service.joinByInvite('user1', 'ABCD1234'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('süresi dolmuş davet → 404 INVITE_INVALID', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(
      makeInvite({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(service.joinByInvite('user1', 'ABCD1234'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('maxUses dolmuş davet → 404 INVITE_INVALID', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(
      makeInvite({ maxUses: 5, uses: 5 }),
    );

    await expect(service.joinByInvite('user1', 'ABCD1234'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  // 2. [R7 KRİTİK] adultsOnly + minör → AGE_RESTRICTED
  it('[R7] adultsOnly ortam + minör kullanıcı → 403 AGE_RESTRICTED', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(
      makeInvite({ guild: GUILD_ADULTS, guildId: GUILD_ADULTS.id }),
    );
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

    await expect(service.joinByInvite('minor1', 'ABCD1234'))
      .rejects.toBeInstanceOf(ForbiddenException);

    try {
      prismaMock.invite.findUnique.mockResolvedValue(
        makeInvite({ guild: GUILD_ADULTS, guildId: GUILD_ADULTS.id }),
      );
      prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });
      await service.joinByInvite('minor1', 'ABCD1234');
    } catch (e: any) {
      expect(e.response?.error).toBe('AGE_RESTRICTED');
    }
  });

  it('[ban] yasaklı kullanıcı davetle giremez → 403 GUILD_BANNED', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(makeInvite());
    prismaMock.guildBan.findUnique.mockResolvedValue({
      guildId: GUILD_NORMAL.id, userId: 'user1', bannedById: 'owner1', reason: null,
    });
    await expect(service.joinByInvite('user1', 'ABCD1234'))
      .rejects.toMatchObject({ response: { error: 'GUILD_BANNED' } });
  });

  it('[R7] adultsOnly ortam + minör → isMinor sızdırılmaz (sadece AGE_RESTRICTED)', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(
      makeInvite({ guild: GUILD_ADULTS, guildId: GUILD_ADULTS.id }),
    );
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

    try {
      await service.joinByInvite('minor1', 'ABCD1234');
    } catch (e: any) {
      // Yanıtta isMinor bilgisi OLMAMALI — sadece jenerik hata kodu
      expect(e.response?.isMinor).toBeUndefined();
      expect(e.response?.error).toBe('AGE_RESTRICTED');
    }
  });

  it('[R7] adultsOnly ortam + yetişkin kullanıcı → devam eder (ALREADY_MEMBER kontrolüne geçer)', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(
      makeInvite({ guild: GUILD_ADULTS, guildId: GUILD_ADULTS.id }),
    );
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    prismaMock.guildMember.findUnique.mockResolvedValue({ id: 'gm1' }); // zaten üye

    await expect(service.joinByInvite('adult1', 'ABCD1234'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('normal ortam (non-adultsOnly) + minör → yaş kontrolü yapılmaz, devam eder', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(makeInvite());
    prismaMock.guildMember.findUnique.mockResolvedValue({ id: 'gm1' }); // zaten üye

    // user.findUnique çağrılMAMALI (adultsOnly=false)
    await expect(service.joinByInvite('minor1', 'ABCD1234'))
      .rejects.toBeInstanceOf(ConflictException);

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  // 3. Zaten üye → ALREADY_MEMBER
  it('zaten üye → 409 ALREADY_MEMBER', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(makeInvite());
    prismaMock.guildMember.findUnique.mockResolvedValue({ id: 'gm1' });

    await expect(service.joinByInvite('user1', 'ABCD1234'))
      .rejects.toBeInstanceOf(ConflictException);

    try {
      prismaMock.invite.findUnique.mockResolvedValue(makeInvite());
      prismaMock.guildMember.findUnique.mockResolvedValue({ id: 'gm1' });
      await service.joinByInvite('user1', 'ABCD1234');
    } catch (e: any) {
      expect(e.response?.error).toBe('ALREADY_MEMBER');
    }
  });

  // 4. Geçerli — üyelik oluşur + uses artar
  it('geçerli davet + yeni üye → GuildDto döner, transaction çalışır', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(makeInvite());
    prismaMock.guildMember.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockResolvedValue([
      { id: 'gm-new' },
      { ...makeInvite(), uses: 1 },
    ]);

    const result = await service.joinByInvite('newuser', 'ABCD1234');
    expect(result.id).toBe(GUILD_NORMAL.id);
    expect(result.name).toBe(GUILD_NORMAL.name);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ── revokeInvite ─────────────────────────────────────────────────────────────
describe('InvitesService.revokeInvite', () => {
  let service: InvitesService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('davet bulunamadı → 404 INVITE_INVALID', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(null);

    await expect(service.revokeInvite('owner1', 'BADCODE'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('zaten iptal edilmiş → 404 INVITE_INVALID', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(
      makeInvite({ deletedAt: new Date() }),
    );

    await expect(service.revokeInvite('owner1', 'ABCD1234'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('MEMBER rolüyle → 403 FORBIDDEN', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(makeInvite());
    membershipMock.requireGuildMembership.mockResolvedValue({ guild: GUILD_NORMAL, membership: { role: 'MEMBER' } });
    permissionsMock.hasGuildPermission.mockResolvedValue(false);

    await expect(service.revokeInvite('member1', 'ABCD1234'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('OWNER → başarıyla iptal eder, null döner', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(makeInvite());
    prismaMock.guildMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    prismaMock.invite.update.mockResolvedValue({ ...makeInvite(), deletedAt: new Date() });

    const result = await service.revokeInvite('owner1', 'ABCD1234');
    expect(result).toBeNull();
  });
});
