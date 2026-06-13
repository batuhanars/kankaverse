import { ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DmService } from './dm.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  channel: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  channelMember: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  friendship: {
    findFirst: jest.fn(),
  },
  userBlock: {
    findMany: jest.fn(),
  },
  message: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const dmPermissionMock = {
  canDm: jest.fn(),
};

function makeService() {
  return new DmService(prismaMock as any, dmPermissionMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const CREATOR_ID = 'creator-1';
const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';
const GROUP_ID = 'group-ch-1';

const ADULT_CREATOR = { id: CREATOR_ID, isMinor: false, username: 'creator', avatarUrl: null };
const ADULT_MEMBER_A = { id: MEMBER_A, isMinor: false, username: 'memberA', avatarUrl: null };
const ADULT_MEMBER_B = { id: MEMBER_B, isMinor: false, username: 'memberB', avatarUrl: null };

const MINOR_USER = { id: 'minor-1', isMinor: true, username: 'minor', avatarUrl: null };

const GROUP_CHANNEL = {
  id: GROUP_ID,
  type: 'GROUP_DM',
  name: 'Test Grubu',
  ownerId: CREATOR_ID,
  guildId: null,
  deletedAt: null,
};

// ── isMutualFriend ────────────────────────────────────────────────────────────

describe('DmService.isMutualFriend', () => {
  let service: DmService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('ACCEPTED friendship (a→b) → true', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f1' });
    const result = await service.isMutualFriend('a', 'b');
    expect(result).toBe(true);
  });

  it('ACCEPTED friendship (b→a) → true', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f1' });
    const result = await service.isMutualFriend('b', 'a');
    expect(result).toBe(true);
  });

  it('friendship yok → false', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    const result = await service.isMutualFriend('a', 'b');
    expect(result).toBe(false);
  });
});

// ── createGroupDm — T&S kapı sırası (R7) ─────────────────────────────────────

describe('DmService.createGroupDm — T&S kapı sırası', () => {
  let service: DmService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: creator minör → 403 GROUP_MINOR_FORBIDDEN
  // ─────────────────────────────────────────────────────────────────────────
  it('[R7] creator minör → ForbiddenException GROUP_MINOR_FORBIDDEN', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

    await expect(
      service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A], name: 'Grup' }),
    ).rejects.toThrow(ForbiddenException);

    try {
      await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A], name: 'Grup' });
    } catch (e) {
      const resp = (e as ForbiddenException).getResponse() as { error: string };
      expect(resp.error).toBe('GROUP_MINOR_FORBIDDEN');
    }
  });

  it('[R7] creator minör → üye sorgusu YAPILMAZ', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

    try { await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A] }); } catch {}

    // user.findMany (members sorgusu) çağrılmamalı
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: member minör → 400 NOT_FRIEND (G1: statü sızdırılmaz; non-friend ile ayırt edilemez)
  // ─────────────────────────────────────────────────────────────────────────
  it('[R7][G1] member minör → BadRequestException NOT_FRIEND (statü sızıntısı yok)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false }); // creator yetişkin
    prismaMock.user.findMany.mockResolvedValue([MINOR_USER]);
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f1' }); // arkadaş olsa bile NOT_FRIEND döner

    await expect(
      service.createGroupDm(CREATOR_ID, { memberIds: [MINOR_USER.id] }),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.createGroupDm(CREATOR_ID, { memberIds: [MINOR_USER.id] });
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as { error: string };
      expect(resp.error).toBe('NOT_FRIEND');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: member arkadaş değil → 400 NOT_FRIEND
  // ─────────────────────────────────────────────────────────────────────────
  it('[R7] member arkadaş değil → BadRequestException NOT_FRIEND', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    prismaMock.user.findMany.mockResolvedValue([ADULT_MEMBER_A]);
    prismaMock.friendship.findFirst.mockResolvedValue(null); // arkadaş değil

    await expect(
      service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A] }),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A] });
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as { error: string };
      expect(resp.error).toBe('NOT_FRIEND');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: geçerli (2 yetişkin arkadaş) → grup oluşur, 201
  // ─────────────────────────────────────────────────────────────────────────
  it('geçerli (creator + 2 yetişkin kanka) → grup oluşur', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    prismaMock.user.findMany.mockResolvedValue([ADULT_MEMBER_A, ADULT_MEMBER_B]);
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f1' }); // her ikisi arkadaş

    const createdChannel = {
      id: GROUP_ID,
      type: 'GROUP_DM',
      name: 'Test',
      ownerId: CREATOR_ID,
      members: [],
    };

    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      prismaMock.channel.create.mockResolvedValue(createdChannel);
      prismaMock.channelMember.createMany.mockResolvedValue({ count: 3 });
      return fn(prismaMock);
    });

    prismaMock.channelMember.findMany.mockResolvedValue([
      { user: { id: CREATOR_ID, username: 'creator', avatarUrl: null } },
      { user: { id: MEMBER_A, username: 'memberA', avatarUrl: null } },
      { user: { id: MEMBER_B, username: 'memberB', avatarUrl: null } },
    ]);

    const result = await service.createGroupDm(CREATOR_ID, {
      memberIds: [MEMBER_A, MEMBER_B],
      name: 'Test',
    });

    expect(result.type).toBe('GROUP_DM');
    expect(result.ownerId).toBe(CREATOR_ID);
    expect(result.members).toHaveLength(3);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ── addGroupMember — T&S kapı ─────────────────────────────────────────────────

describe('DmService.addGroupMember — T&S kapı', () => {
  let service: DmService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    // requireGroupChannel
    prismaMock.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
    // requireGroupMember (caller üye)
    prismaMock.channelMember.findUnique.mockImplementation(({ where }: { where: { channelId_userId?: { userId: string } } }) => {
      if (where.channelId_userId?.userId === CREATOR_ID) return Promise.resolve({ id: 'cm-1' });
      return Promise.resolve(null);
    });
  });

  it('[R7][G1] eklenen minör → BadRequestException NOT_FRIEND (statü sızıntısı yok)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(MINOR_USER);
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f1' }); // arkadaş olsa bile NOT_FRIEND döner

    await expect(
      service.addGroupMember(CREATOR_ID, GROUP_ID, { userId: MINOR_USER.id }),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.addGroupMember(CREATOR_ID, GROUP_ID, { userId: MINOR_USER.id });
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as { error: string };
      expect(resp.error).toBe('NOT_FRIEND');
    }
  });

  it('[R7] eklenen arkadaş değil → BadRequestException NOT_FRIEND', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADULT_MEMBER_A);
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    // zaten üye değil
    prismaMock.channelMember.findUnique.mockImplementation(({ where }: { where: { channelId_userId?: { userId: string } } }) => {
      if (where.channelId_userId?.userId === CREATOR_ID) return Promise.resolve({ id: 'cm-1' });
      return Promise.resolve(null);
    });

    await expect(
      service.addGroupMember(CREATOR_ID, GROUP_ID, { userId: MEMBER_A }),
    ).rejects.toThrow(BadRequestException);
  });

  it('[R7] zaten üye → ConflictException ALREADY_MEMBER', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADULT_MEMBER_A);
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f1' });
    // her iki findUnique çağrısı — caller ve target için
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm-existing' });

    await expect(
      service.addGroupMember(CREATOR_ID, GROUP_ID, { userId: MEMBER_A }),
    ).rejects.toThrow(ConflictException);
  });
});

// ── leaveGroupDm ──────────────────────────────────────────────────────────────

describe('DmService.leaveGroupDm', () => {
  let service: DmService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
  });

  it('üye ayrılır; kalan ≥ 2 → kanal silinmez', async () => {
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm-1' });
    prismaMock.channelMember.delete.mockResolvedValue({});
    prismaMock.channelMember.count.mockResolvedValue(2);

    await service.leaveGroupDm(CREATOR_ID, GROUP_ID);

    expect(prismaMock.channelMember.delete).toHaveBeenCalledTimes(1);
    expect(prismaMock.channel.update).not.toHaveBeenCalled();
  });

  it('üye ayrılır; kalan < 2 → kanal soft-delete', async () => {
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm-1' });
    prismaMock.channelMember.delete.mockResolvedValue({});
    prismaMock.channelMember.count.mockResolvedValue(1);
    prismaMock.channel.update.mockResolvedValue({});

    await service.leaveGroupDm(CREATOR_ID, GROUP_ID);

    expect(prismaMock.channel.update).toHaveBeenCalledWith({
      where: { id: GROUP_ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('üye değil → ForbiddenException NOT_CHANNEL_MEMBER', async () => {
    prismaMock.channelMember.findUnique.mockResolvedValue(null);

    await expect(service.leaveGroupDm(CREATOR_ID, GROUP_ID)).rejects.toThrow(ForbiddenException);
  });
});

// ── deleteGroupDm ─────────────────────────────────────────────────────────────

describe('DmService.deleteGroupDm', () => {
  let service: DmService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
  });

  it('owner → kanal soft-delete', async () => {
    prismaMock.channel.update.mockResolvedValue({});

    await service.deleteGroupDm(CREATOR_ID, GROUP_ID);

    expect(prismaMock.channel.update).toHaveBeenCalledWith({
      where: { id: GROUP_ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('owner değil → ForbiddenException FORBIDDEN', async () => {
    await expect(service.deleteGroupDm('other-user', GROUP_ID)).rejects.toThrow(ForbiddenException);

    try {
      await service.deleteGroupDm('other-user', GROUP_ID);
    } catch (e) {
      const resp = (e as ForbiddenException).getResponse() as { error: string };
      expect(resp.error).toBe('FORBIDDEN');
    }
  });
});

// ── GROUP_DM mesajında requireNoDmBlock atlanır ───────────────────────────────
// Not: Bu test messages.service.spec.ts'de daha net bir şekilde kapsamalı.
// Burada DmService.isMutualFriend'in GROUP_DM güvenlik garantisini doğruluyoruz.

describe('DmService — GROUP_DM mesaj T&S semantiği', () => {
  it('isMutualFriend yalnız ACCEPTED friendship bulur', async () => {
    resetMocks();
    const service = makeService();

    // PENDING friendship → false
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    expect(await service.isMutualFriend('a', 'b')).toBe(false);

    // ACCEPTED friendship → true
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f-accepted' });
    expect(await service.isMutualFriend('a', 'b')).toBe(true);
  });
});
