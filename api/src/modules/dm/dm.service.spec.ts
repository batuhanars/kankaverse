import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DmService, readReceiptDecision, groupReadReceiptDecision } from './dm.service';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  channel: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  channelMember: {
    update: jest.fn(),
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
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  message: {
    findFirst: jest.fn(),
  },
  groupDmPastPeriod: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockReturnValue('period-op'),
    deleteMany: jest.fn().mockReturnValue('period-del'),
  },
  groupDmEvent: { create: jest.fn().mockReturnValue('event-op') },
  groupDmDeparture: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  e2eeWelcome: { deleteMany: jest.fn() },
  $transaction: jest.fn(),
};

const dmPermissionMock = {
  canDm: jest.fn(),
};

const realtimeMock = {
  emitToUser: jest.fn(),
};

// C75: istek sonuçlanınca mesaj isteği bildirimi okundu işaretlenir
const notificationsMock = { markMessageRequestActioned: jest.fn() };

function makeService() {
  return new DmService(
    prismaMock as any,
    dmPermissionMock as any,
    realtimeMock as any,
    undefined,
    undefined,
    undefined,
    notificationsMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  // C12: `toDmChannelDto` üyeleri artık `findMany` ile çekiyor. Bu sorguyu umursamayan bloklarda
  // mock `undefined` dönüp `.find` patlıyordu; boş dizi güvenli varsayılan (üye bulunamaz → alanlar
  // null/false). Okundu bilgisini SINAYAN testler kendi verisini vererek bunu ezer.
  prismaMock.channelMember.findMany.mockResolvedValue([]);
  // C62: eski-üye (departure) listesi varsayılan boş
  prismaMock.groupDmDeparture.findMany.mockResolvedValue([]);
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const CREATOR_ID = 'creator-1';
const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';
const GROUP_ID = 'group-ch-1';

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
      service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A, MEMBER_B], name: 'Grup' }),
    ).rejects.toThrow(ForbiddenException);

    try {
      await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A, MEMBER_B], name: 'Grup' });
    } catch (e) {
      const resp = (e as ForbiddenException).getResponse() as { error: string };
      expect(resp.error).toBe('GROUP_MINOR_FORBIDDEN');
    }
  });

  it('[R7] creator minör → üye sorgusu YAPILMAZ', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });

    try {
      await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A, MEMBER_B] });
    } catch {
      // beklenen — minör guard fırlatıyor, burada yalnız yan-etkiyi (findMany çağrılmadı) doğruluyoruz
    }

    // user.findMany (members sorgusu) çağrılmamalı
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: member minör → 400 NOT_FRIEND (G1: statü sızdırılmaz; non-friend ile ayırt edilemez)
  // ─────────────────────────────────────────────────────────────────────────
  it('[R7][G1] member minör → BadRequestException NOT_FRIEND (statü sızıntısı yok)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false }); // creator yetişkin
    prismaMock.user.findMany.mockResolvedValue([MINOR_USER, ADULT_MEMBER_A]);
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f1' }); // arkadaş olsa bile NOT_FRIEND döner

    // D49: tek üyeli istek artık DM'e yönlenir → grup kapısını sınamak için 2 üye (toplam 3 kişi)
    await expect(
      service.createGroupDm(CREATOR_ID, { memberIds: [MINOR_USER.id, MEMBER_A] }),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.createGroupDm(CREATOR_ID, { memberIds: [MINOR_USER.id, MEMBER_A] });
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
    prismaMock.user.findMany.mockResolvedValue([ADULT_MEMBER_A, ADULT_MEMBER_B]);
    prismaMock.friendship.findFirst.mockResolvedValue(null); // arkadaş değil

    // D49: tek üyeli istek artık DM'e yönlenir → grup kapısını sınamak için 2 üye (toplam 3 kişi)
    await expect(
      service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A, MEMBER_B] }),
    ).rejects.toThrow(BadRequestException);

    try {
      await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A, MEMBER_B] });
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

    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
        prismaMock.channel.create.mockResolvedValue(createdChannel);
        prismaMock.channelMember.createMany.mockResolvedValue({ count: 3 });
        return fn(prismaMock);
      },
    );

    prismaMock.channelMember.findMany.mockResolvedValue([
      { user: { id: CREATOR_ID, username: 'creator', avatarUrl: null } },
      { user: { id: MEMBER_A, username: 'memberA', avatarUrl: null } },
      { user: { id: MEMBER_B, username: 'memberB', avatarUrl: null } },
    ]);

    const result = await service.createGroupDm(CREATOR_ID, {
      memberIds: [MEMBER_A, MEMBER_B],
      name: 'Test',
    });

    // D49 sonrası dönüş tipi union (GROUP_DM | DM) — daraltmadan alan okunamaz
    if (result.type !== 'GROUP_DM') throw new Error('GROUP_DM bekleniyordu');
    expect(result.ownerId).toBe(CREATOR_ID);
    expect(result.members).toHaveLength(3);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ── D49: iki kişilik grup → 1-1 DM'e yönlendirme ─────────────────────────────

describe("DmService.createGroupDm — D49 iki kişilik grup DM'e yönlenir", () => {
  let service: DmService;

  const TARGET_USER = { id: MEMBER_A, username: 'memberA', avatarUrl: null };
  const DM_CH = 'dm-ch-1';

  /** toDmChannelDto'nun yan sorgularını nötrle (blok yok, mesaj yok, istek yok). */
  function stubToDmChannelDto() {
    // C12: iki üyelik tek `findMany` ile geliyor; `readReceipts` varsayılan açık (şema default).
    prismaMock.channelMember.findMany.mockResolvedValue([
      { userId: CREATOR_ID, lastReadAt: null, clearedAt: null, user: { readReceipts: true } },
      { userId: MEMBER_A, lastReadAt: null, clearedAt: null, user: { readReceipts: true } },
    ]);
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm', lastReadAt: null });
    prismaMock.message.findFirst.mockResolvedValue(null);
    prismaMock.userBlock.findUnique.mockResolvedValue(null);
    prismaMock.channel.findUnique.mockResolvedValue({
      dmRequestStatus: null,
      dmRequesterId: null,
    });
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
  });

  it('tek üye (toplam 2 kişi) → DM döner, GRUP OLUŞMAZ', async () => {
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
    prismaMock.user.findUnique.mockResolvedValue(TARGET_USER);
    prismaMock.channelMember.findFirst.mockResolvedValue(null); // mevcut DM yok
    prismaMock.channel.create.mockResolvedValue({ id: DM_CH });
    prismaMock.channelMember.createMany.mockResolvedValue({ count: 2 });
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
    );
    stubToDmChannelDto();

    const result = await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A], name: 'Grup' });

    expect(result.type).toBe('DM');
    expect(result.id).toBe(DM_CH);
    // Grup kapıları (creator minör / üye sorgusu) hiç çalıştırılmadı
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    // Oluşturulan kanal DM; GROUP_DM oluşturulmadı ve grup adı kullanılmadı
    const createArg = prismaMock.channel.create.mock.calls[0][0];
    expect(createArg.data.type).toBe('DM');
    expect(createArg.data.name).toBeUndefined();
  });

  it('mevcut DM varsa AYNI kanal döner (yeni kanal açılmaz)', async () => {
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
    prismaMock.user.findUnique.mockResolvedValue(TARGET_USER);
    prismaMock.channelMember.findFirst.mockResolvedValue({
      channel: { id: DM_CH, type: 'DM', deletedAt: null },
    });
    stubToDmChannelDto();

    const result = await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A] });

    expect(result.type).toBe('DM');
    expect(result.id).toBe(DM_CH);
    expect(prismaMock.channel.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('kendisi listeye girmişse (memberIds içinde creator) yine tek üye sayılır → DM', async () => {
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true });
    prismaMock.user.findUnique.mockResolvedValue(TARGET_USER);
    prismaMock.channelMember.findFirst.mockResolvedValue({
      channel: { id: DM_CH, type: 'DM', deletedAt: null },
    });
    stubToDmChannelDto();

    const result = await service.createGroupDm(CREATOR_ID, {
      memberIds: [MEMBER_A, CREATOR_ID, MEMBER_A],
    });

    expect(result.type).toBe('DM');
    expect(dmPermissionMock.canDm).toHaveBeenCalledWith(CREATOR_ID, MEMBER_A);
  });

  it('[R7] canDm reddederse jenerik DM_NOT_ALLOWED döner (ayrı "grup" metni yok)', async () => {
    dmPermissionMock.canDm.mockResolvedValue({ allowed: false, reason: 'BLOCKED' });

    await expect(service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A] })).rejects.toThrow(
      ForbiddenException,
    );

    try {
      await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A] });
    } catch (e) {
      const resp = (e as ForbiddenException).getResponse() as { error: string; message: string };
      expect(resp.error).toBe('DM_NOT_ALLOWED');
      expect(resp.message).toBe('Bu kullanıcıya mesaj gönderemezsiniz.');
    }
  });

  it('regresyon: iki üye (toplam 3 kişi) → eskisi gibi GRUP oluşur, canDm çağrılmaz', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    prismaMock.user.findMany.mockResolvedValue([ADULT_MEMBER_A, ADULT_MEMBER_B]);
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f1' });
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
        prismaMock.channel.create.mockResolvedValue({
          id: GROUP_ID,
          type: 'GROUP_DM',
          name: null,
          ownerId: CREATOR_ID,
          members: [],
        });
        prismaMock.channelMember.createMany.mockResolvedValue({ count: 3 });
        return fn(prismaMock);
      },
    );
    prismaMock.channelMember.findMany.mockResolvedValue([
      { user: { id: CREATOR_ID, username: 'creator', avatarUrl: null } },
      { user: { id: MEMBER_A, username: 'memberA', avatarUrl: null } },
      { user: { id: MEMBER_B, username: 'memberB', avatarUrl: null } },
    ]);

    const result = await service.createGroupDm(CREATOR_ID, { memberIds: [MEMBER_A, MEMBER_B] });

    expect(result.type).toBe('GROUP_DM');
    expect(dmPermissionMock.canDm).not.toHaveBeenCalled();
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
    prismaMock.channelMember.findUnique.mockImplementation(
      ({ where }: { where: { channelId_userId?: { userId: string } } }) => {
        if (where.channelId_userId?.userId === CREATOR_ID) return Promise.resolve({ id: 'cm-1' });
        return Promise.resolve(null);
      },
    );
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
    prismaMock.channelMember.findUnique.mockImplementation(
      ({ where }: { where: { channelId_userId?: { userId: string } } }) => {
        if (where.channelId_userId?.userId === CREATOR_ID) return Promise.resolve({ id: 'cm-1' });
        return Promise.resolve(null);
      },
    );

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

// ── removeGroupMember ─────────────────────────────────────────────────────────

describe('DmService.removeGroupMember', () => {
  let service: DmService;

  const TARGET_ID = 'target-user-1';
  const ADMIN_ID = 'admin-1';
  const ADMIN_2 = 'admin-2';

  /** Üyelik satırları: userId → isAdmin. Listede yoksa üye değil (null). */
  function members(rows: Record<string, boolean>) {
    prismaMock.channelMember.findUnique.mockImplementation(
      ({ where }: { where: { channelId_userId: { userId: string } } }) => {
        const uid = where.channelId_userId.userId;
        return Promise.resolve(uid in rows ? { id: `cm-${uid}`, isAdmin: rows[uid] } : null);
      },
    );
  }

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
    prismaMock.channelMember.delete.mockResolvedValue({});
    prismaMock.channelMember.count.mockResolvedValue(2);
  });

  async function errorOf(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (e) {
      return ((e as ForbiddenException).getResponse() as { error: string }).error;
    }
    return 'NO_ERROR';
  }

  it('kurucu hedef üyeyi çıkarır → üye silindi, null döner', async () => {
    members({ [CREATOR_ID]: false, [TARGET_ID]: false });

    const result = await service.removeGroupMember(CREATOR_ID, GROUP_ID, TARGET_ID);

    expect(prismaMock.channelMember.delete).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('kurucu yöneticiyi de çıkarabilir', async () => {
    members({ [CREATOR_ID]: false, [ADMIN_ID]: true });
    await service.removeGroupMember(CREATOR_ID, GROUP_ID, ADMIN_ID);
    expect(prismaMock.channelMember.delete).toHaveBeenCalledTimes(1);
  });

  it('normal üye başkasını çıkaramaz → FORBIDDEN', async () => {
    members({ 'non-owner': false, [TARGET_ID]: false });
    expect(await errorOf(service.removeGroupMember('non-owner', GROUP_ID, TARGET_ID))).toBe(
      'FORBIDDEN',
    );
    expect(prismaMock.channelMember.delete).not.toHaveBeenCalled();
  });

  it('üye olmayan çağıran → NOT_CHANNEL_MEMBER', async () => {
    members({ [TARGET_ID]: false });
    expect(await errorOf(service.removeGroupMember('outsider', GROUP_ID, TARGET_ID))).toBe(
      'NOT_CHANNEL_MEMBER',
    );
  });

  it('yönetici normal üyeyi çıkarır', async () => {
    members({ [ADMIN_ID]: true, [TARGET_ID]: false });
    await service.removeGroupMember(ADMIN_ID, GROUP_ID, TARGET_ID);
    expect(prismaMock.channelMember.delete).toHaveBeenCalledTimes(1);
  });

  it('yönetici başka yöneticiyi ya da kurucuyu çıkaramaz → FORBIDDEN', async () => {
    members({ [ADMIN_ID]: true, [ADMIN_2]: true, [CREATOR_ID]: false });
    expect(await errorOf(service.removeGroupMember(ADMIN_ID, GROUP_ID, ADMIN_2))).toBe('FORBIDDEN');
    expect(await errorOf(service.removeGroupMember(ADMIN_ID, GROUP_ID, CREATOR_ID))).toBe(
      'FORBIDDEN',
    );
    expect(prismaMock.channelMember.delete).not.toHaveBeenCalled();
  });

  it('kendini çıkarmaya çalışır → BadRequestException CANNOT_REMOVE_SELF', async () => {
    await expect(service.removeGroupMember(CREATOR_ID, GROUP_ID, CREATOR_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(await errorOf(service.removeGroupMember(CREATOR_ID, GROUP_ID, CREATOR_ID))).toBe(
      'CANNOT_REMOVE_SELF',
    );
  });

  it('hedef grup üyesi değil → NotFoundException MEMBER_NOT_FOUND', async () => {
    members({ [CREATOR_ID]: false });

    await expect(service.removeGroupMember(CREATOR_ID, GROUP_ID, TARGET_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(await errorOf(service.removeGroupMember(CREATOR_ID, GROUP_ID, TARGET_ID))).toBe(
      'MEMBER_NOT_FOUND',
    );
  });

  it('üye çıkınca kalan < 2 → kanal soft-delete', async () => {
    members({ [CREATOR_ID]: false, [TARGET_ID]: false });
    prismaMock.channelMember.count.mockResolvedValue(1);
    prismaMock.channel.update.mockResolvedValue({});

    await service.removeGroupMember(CREATOR_ID, GROUP_ID, TARGET_ID);

    expect(prismaMock.channel.update).toHaveBeenCalledWith({
      where: { id: GROUP_ID },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

describe('[R7] DmService.setGroupAdmin + renameGroupDm (yönetici)', () => {
  let service: DmService;
  const TARGET_ID = 'target-user-1';

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
  });

  it('kurucu üyeyi yönetici yapar', async () => {
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm-t', isAdmin: false });
    prismaMock.channelMember.update.mockResolvedValue({});

    const res = await service.setGroupAdmin(CREATOR_ID, GROUP_ID, TARGET_ID, true);

    expect(prismaMock.channelMember.update).toHaveBeenCalledWith({
      where: { id: 'cm-t' },
      data: { isAdmin: true },
    });
    expect(res).toEqual({ userId: TARGET_ID, isAdmin: true });
  });

  it('kurucu olmayan (yönetici dahil) yönetici atayamaz → FORBIDDEN', async () => {
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm-a', isAdmin: true });
    await expect(service.setGroupAdmin('admin-1', GROUP_ID, TARGET_ID, true)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.channelMember.update).not.toHaveBeenCalled();
  });

  it('kurucu kendine yöneticilik veremez → CANNOT_CHANGE_OWNER', async () => {
    await expect(service.setGroupAdmin(CREATOR_ID, GROUP_ID, CREATOR_ID, true)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('üye olmayana yöneticilik verilemez → MEMBER_NOT_FOUND', async () => {
    prismaMock.channelMember.findUnique.mockResolvedValue(null);
    await expect(service.setGroupAdmin(CREATOR_ID, GROUP_ID, TARGET_ID, true)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('yönetici grubu yeniden adlandırabilir', async () => {
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm-a', isAdmin: true });
    prismaMock.channel.update.mockResolvedValue({ id: GROUP_ID, name: 'Yeni' });

    const res = await service.renameGroupDm('admin-1', GROUP_ID, { name: 'Yeni' });

    expect(res).toEqual({ id: GROUP_ID, name: 'Yeni' });
  });

  it('normal üye grubu yeniden adlandıramaz → FORBIDDEN', async () => {
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm-m', isAdmin: false });
    await expect(service.renameGroupDm('member-x', GROUP_ID, { name: 'Yeni' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.channel.update).not.toHaveBeenCalled();
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

// ── C20: markRead → read:self ─────────────────────────────────────────────────
describe('DmService.markRead — C20 read:self', () => {
  beforeEach(() => resetMocks());

  it('read:self YALNIZ okuyana gider; karşı tarafa hiçbir olay gitmez', async () => {
    const service = makeService();
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'm-1' });
    prismaMock.channelMember.update.mockResolvedValue({});

    await service.markRead('u-reader', 'ch-1');

    const selfCalls = realtimeMock.emitToUser.mock.calls.filter((c) => c[1] === 'read:self');
    expect(selfCalls).toHaveLength(1);
    expect(selfCalls[0][0]).toBe('u-reader');
    expect(selfCalls[0][2]).toEqual(
      expect.objectContaining({ channelId: 'ch-1', guildId: null, readAt: expect.any(String) }),
    );
    // Başka kullanıcıya read:self yok
    expect(
      realtimeMock.emitToUser.mock.calls.every((c) => c[1] !== 'read:self' || c[0] === 'u-reader'),
    ).toBe(true);
  });

  it('üye değilse read:self yayınlanmaz', async () => {
    const service = makeService();
    prismaMock.channelMember.findUnique.mockResolvedValue(null);

    await expect(service.markRead('u-x', 'ch-1')).rejects.toThrow();
    expect(realtimeMock.emitToUser).not.toHaveBeenCalled();
  });
});

// ── C9: Mesaj İstekleri ─────────────────────────────────────────────────────
describe('DmService — C9 Mesaj İstekleri', () => {
  const SENDER = 'sender-1';
  const TARGET = 'target-1';
  const CH = 'ch-req-1';

  /** toDmChannelDto'nun ihtiyaç duyduğu yan sorguları nötrle (blok yok, mesaj yok). */
  function stubToDmChannelDto(status: 'PENDING' | 'ACCEPTED' | null, requesterId: string | null) {
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm', lastReadAt: null });
    prismaMock.message.findFirst.mockResolvedValue(null);
    prismaMock.userBlock.findUnique.mockResolvedValue(null);
    prismaMock.channel.findUnique.mockResolvedValue({
      dmRequestStatus: status,
      dmRequesterId: requesterId,
    });
  }

  it('getOrCreateDmChannel: canDm asRequest → PENDING kanal + dmRequesterId (direkt DM değil)', async () => {
    resetMocks();
    const service = makeService();
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true, asRequest: true });
    prismaMock.user.findUnique.mockResolvedValue({
      id: TARGET,
      username: 'hedef',
      avatarUrl: null,
    });
    prismaMock.channelMember.findFirst.mockResolvedValue(null); // mevcut kanal yok
    prismaMock.channel.create.mockResolvedValue({ id: CH });
    prismaMock.channelMember.createMany.mockResolvedValue({ count: 2 });
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
    );
    stubToDmChannelDto('PENDING', SENDER);

    await service.getOrCreateDmChannel(SENDER, { userId: TARGET });

    expect(prismaMock.channel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'DM',
          dmRequestStatus: 'PENDING',
          dmRequesterId: SENDER,
        }),
      }),
    );
  });

  it('getOrCreateDmChannel: canDm allowed ama asRequest yok → normal DM (dmRequestStatus set edilmez)', async () => {
    resetMocks();
    const service = makeService();
    dmPermissionMock.canDm.mockResolvedValue({ allowed: true }); // arkadaş → direkt
    prismaMock.user.findUnique.mockResolvedValue({
      id: TARGET,
      username: 'hedef',
      avatarUrl: null,
    });
    prismaMock.channelMember.findFirst.mockResolvedValue(null);
    prismaMock.channel.create.mockResolvedValue({ id: CH });
    prismaMock.channelMember.createMany.mockResolvedValue({ count: 2 });
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
    );
    stubToDmChannelDto(null, null);

    await service.getOrCreateDmChannel(SENDER, { userId: TARGET });

    const callArg = prismaMock.channel.create.mock.calls[0][0];
    expect(callArg.data.dmRequestStatus).toBeUndefined();
    expect(callArg.data.dmRequesterId).toBeUndefined();
  });

  it('acceptMessageRequest: alıcı kabul → ACCEPTED', async () => {
    resetMocks();
    const service = makeService();
    // requirePendingRequestForRecipient: PENDING, requester = TARGET (alıcı = SENDER değil)
    prismaMock.channel.findUnique.mockResolvedValue({
      id: CH,
      type: 'DM',
      dmRequestStatus: 'PENDING',
      dmRequesterId: TARGET,
    });
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm', lastReadAt: null });
    prismaMock.channel.update.mockResolvedValue({ id: CH });
    prismaMock.user.findUnique.mockResolvedValue({
      id: TARGET,
      username: 'isteyen',
      avatarUrl: null,
    });
    prismaMock.message.findFirst.mockResolvedValue(null);
    prismaMock.userBlock.findUnique.mockResolvedValue(null);

    await service.acceptMessageRequest(SENDER, CH);

    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CH }, data: { dmRequestStatus: 'ACCEPTED' } }),
    );
    // C75: alıcının MESSAGE_REQUEST bildirimi okundu işaretlenir
    expect(notificationsMock.markMessageRequestActioned).toHaveBeenCalledWith(SENDER, CH);
    // C75 §2.6: istek sahibine (TARGET) durum senkron olayı gider
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(TARGET, 'dm.request_accepted', {
      channelId: CH,
    });
    // C75 §2.7: alıcıya (SENDER) diğer cihazları için çözüldü olayı
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(SENDER, 'dm.request_resolved', {
      channelId: CH,
      outcome: 'accepted',
    });
  });

  it('acceptMessageRequest: istek SAHİBİ kendi isteğini kabul edemez → FORBIDDEN', async () => {
    resetMocks();
    const service = makeService();
    // requester = SENDER (işlemi yapan) → yasak
    prismaMock.channel.findUnique.mockResolvedValue({
      id: CH,
      type: 'DM',
      dmRequestStatus: 'PENDING',
      dmRequesterId: SENDER,
    });
    await expect(service.acceptMessageRequest(SENDER, CH)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prismaMock.channel.update).not.toHaveBeenCalled();
  });

  it('acceptMessageRequest: PENDING değilse → REQUEST_NOT_FOUND', async () => {
    resetMocks();
    const service = makeService();
    prismaMock.channel.findUnique.mockResolvedValue({
      id: CH,
      type: 'DM',
      dmRequestStatus: 'ACCEPTED',
      dmRequesterId: TARGET,
    });
    await expect(service.acceptMessageRequest(SENDER, CH)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejectMessageRequest block=true: kanal soft-delete + istek sahibini engelle', async () => {
    resetMocks();
    const service = makeService();
    prismaMock.channel.findUnique.mockResolvedValue({
      id: CH,
      type: 'DM',
      dmRequestStatus: 'PENDING',
      dmRequesterId: TARGET,
    });
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm' });
    prismaMock.channel.update.mockResolvedValue({ id: CH });
    prismaMock.userBlock.upsert.mockResolvedValue({ id: 'blk' });
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
    );

    await service.rejectMessageRequest(SENDER, CH, true);

    expect(prismaMock.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CH },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(prismaMock.userBlock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { blockerId: SENDER, blockedId: TARGET } }),
    );
    // C75 §2.7: alıcının diğer cihazları için çözüldü olayı
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(SENDER, 'dm.request_resolved', {
      channelId: CH,
      outcome: 'rejected',
    });
  });

  it('rejectMessageRequest block=false: kanal soft-delete, engelleme YOK', async () => {
    resetMocks();
    const service = makeService();
    prismaMock.channel.findUnique.mockResolvedValue({
      id: CH,
      type: 'DM',
      dmRequestStatus: 'PENDING',
      dmRequesterId: TARGET,
    });
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'cm' });
    prismaMock.channel.update.mockResolvedValue({ id: CH });
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
    );

    await service.rejectMessageRequest(SENDER, CH, false);
    // C75 §2.6: ret için olay YOK
    expect(realtimeMock.emitToUser).not.toHaveBeenCalledWith(
      expect.anything(),
      'dm.request_accepted',
      expect.anything(),
    );
    // C75: reddedilen isteğin bildirimi de okundu işaretlenir
    expect(notificationsMock.markMessageRequestActioned).toHaveBeenCalledWith(SENDER, CH);

    expect(prismaMock.channel.update).toHaveBeenCalled();
    // C77 §1: istek kurulurken alıcının cihazlarına bırakılan teslim edilmemiş Welcome'lar aynı tx'te silinir
    expect(prismaMock.e2eeWelcome.deleteMany).toHaveBeenCalledWith({
      where: { channelId: CH, deliveredAt: null },
    });
    expect(prismaMock.userBlock.upsert).not.toHaveBeenCalled();
  });

  it('getMessageRequests: ek-yalnız istek önizlemesi eklerden üretilir', async () => {
    resetMocks();
    const service = makeService();
    const now = new Date('2026-07-06T10:00:00.000Z');
    prismaMock.channel.findMany.mockResolvedValue([
      {
        id: CH,
        createdAt: now,
        dmRequester: { id: TARGET, username: 'isteyen', avatarUrl: null },
        messages: [{ content: '', createdAt: now, attachments: [{ contentType: 'audio/mp4' }] }],
      },
    ]);

    const res = await service.getMessageRequests(SENDER);

    expect(res[0].preview).toBe('🎤 Sesli mesaj');
  });

  it('getMessageRequests: şifreli ilk mesajda encrypted:true döner, şifresizde alan yoktur (E1)', async () => {
    resetMocks();
    const service = makeService();
    const now = new Date('2026-07-06T10:00:00.000Z');
    const base = {
      createdAt: now,
      dmRequester: { id: TARGET, username: 'isteyen', avatarUrl: null },
    };
    prismaMock.channel.findMany.mockResolvedValue([
      { id: 'c-enc', ...base, messages: [{ content: '', encrypted: true, createdAt: now }] },
      {
        id: 'c-plain',
        ...base,
        messages: [{ content: 'selam', encrypted: false, createdAt: now }],
      },
    ]);

    const res = await service.getMessageRequests(SENDER);

    expect(res[0]).toMatchObject({ channelId: 'c-enc', preview: '', encrypted: true });
    expect(res[1]).not.toHaveProperty('encrypted');
  });

  it('getDmChannels: ek-yalnız son mesaj içeriği eklerden üretilir (grup DM)', async () => {
    resetMocks();
    const service = makeService();
    const now = new Date('2026-07-06T10:00:00.000Z');
    prismaMock.channelMember.findMany.mockResolvedValue([
      {
        lastReadAt: null,
        clearedAt: null,
        channel: {
          id: CH,
          type: 'GROUP_DM',
          deletedAt: null,
          name: 'g',
          createdAt: now,
          ownerId: SENDER,
          members: [],
          messages: [
            {
              id: 'm1',
              channelId: CH,
              content: '',
              replyToId: null,
              createdAt: now,
              author: { id: TARGET, username: 'x', avatarUrl: null },
              attachments: [{ contentType: 'image/png' }],
            },
          ],
        },
      },
    ]);
    prismaMock.userBlock.findMany.mockResolvedValue([]);

    const res = await service.getDmChannels(SENDER);

    expect((res[0] as any).lastMessage.content).toBe('📷 Görsel');
  });

  it('getDmChannels: lastReaction dolu ve unread true; engelli aktörde ve okunmuşta null (C46 §4b)', async () => {
    const msgAt = new Date('2026-11-01T09:00:00.000Z');
    const reaction = {
      actorId: TARGET,
      actorUsername: 'x',
      emoji: '👍',
      messageId: 'm1',
      at: '2026-11-01T10:00:00.000Z',
    };
    const row = (lastReadAt: Date | null) => ({
      lastReadAt,
      clearedAt: null,
      lastReaction: reaction,
      channel: {
        id: CH,
        type: 'GROUP_DM',
        deletedAt: null,
        name: 'g',
        createdAt: msgAt,
        ownerId: SENDER,
        members: [
          {
            userId: TARGET,
            lastReadAt: null,
            user: {
              id: TARGET,
              username: 'x',
              avatarUrl: null,
              avatarAnimatedUrl: null,
              readReceipts: false,
            },
          },
        ],
        messages: [
          {
            id: 'm1',
            channelId: CH,
            content: 'a',
            replyToId: null,
            createdAt: msgAt,
            author: { id: SENDER, username: 's', avatarUrl: null },
            attachments: [],
          },
        ],
      },
    });

    resetMocks();
    prismaMock.channelMember.findMany.mockResolvedValue([
      row(new Date('2026-11-01T09:30:00.000Z')),
    ]);
    prismaMock.userBlock.findMany.mockResolvedValue([]);
    let res = (await makeService().getDmChannels(SENDER)) as any[];
    expect(res[0].lastReaction).toEqual(reaction);
    expect(res[0].unread).toBe(true);

    // okunmuş (lastReadAt sonra)
    resetMocks();
    prismaMock.channelMember.findMany.mockResolvedValue([
      row(new Date('2026-11-01T10:30:00.000Z')),
    ]);
    prismaMock.userBlock.findMany.mockResolvedValue([]);
    res = (await makeService().getDmChannels(SENDER)) as any[];
    expect(res[0].lastReaction).toBeNull();

    // aktör engelli (benim engelim)
    resetMocks();
    prismaMock.channelMember.findMany.mockResolvedValue([row(null)]);
    prismaMock.userBlock.findMany
      .mockResolvedValueOnce([{ blockedId: TARGET }])
      .mockResolvedValueOnce([]);
    res = (await makeService().getDmChannels(SENDER)) as any[];
    expect(res[0].lastReaction).toBeNull();
  });

  describe('getDmChannels: okundu alanları (liste ucu, sahip bulgusu 2026-10-29)', () => {
    const now = new Date('2026-10-29T10:00:00.000Z');
    const readAt = new Date('2026-10-29T10:05:00.000Z');
    const dmRow = (selfReceipts: boolean, otherReceipts: boolean) => ({
      lastReadAt: null,
      clearedAt: null,
      channel: {
        id: CH,
        type: 'DM',
        deletedAt: null,
        dmRequestStatus: null,
        createdAt: now,
        members: [
          {
            userId: SENDER,
            lastReadAt: null,
            user: {
              id: SENDER,
              username: 's',
              avatarUrl: null,
              avatarAnimatedUrl: null,
              readReceipts: selfReceipts,
            },
          },
          {
            userId: TARGET,
            lastReadAt: readAt,
            user: {
              id: TARGET,
              username: 't',
              avatarUrl: null,
              avatarAnimatedUrl: null,
              readReceipts: otherReceipts,
            },
          },
        ],
        messages: [],
      },
    });

    it('iki taraf da açıksa receiptsEnabled + otherReadAt döner', async () => {
      resetMocks();
      const service = makeService();
      prismaMock.channelMember.findMany.mockResolvedValue([dmRow(true, true)]);
      prismaMock.userBlock.findMany.mockResolvedValue([]);
      const res = (await service.getDmChannels(SENDER)) as any[];
      expect(res[0].receiptsEnabled).toBe(true);
      expect(res[0].otherReadAt).toBe(readAt.toISOString());
      expect(res[0].otherUser.readReceipts).toBeUndefined();
    });

    it('karşı taraf kapattıysa tik yok ve okuma anı sızmaz', async () => {
      resetMocks();
      const service = makeService();
      prismaMock.channelMember.findMany.mockResolvedValue([dmRow(true, false)]);
      prismaMock.userBlock.findMany.mockResolvedValue([]);
      const res = (await service.getDmChannels(SENDER)) as any[];
      expect(res[0].receiptsEnabled).toBe(false);
      expect(res[0].otherReadAt).toBeNull();
    });

    it('engel varsa tik yok', async () => {
      resetMocks();
      const service = makeService();
      prismaMock.channelMember.findMany.mockResolvedValue([dmRow(true, true)]);
      prismaMock.userBlock.findMany
        .mockResolvedValueOnce([{ blockedId: TARGET }])
        .mockResolvedValueOnce([]);
      const res = (await service.getDmChannels(SENDER)) as any[];
      expect(res[0].receiptsEnabled).toBe(false);
      expect(res[0].otherReadAt).toBeNull();
    });
  });

  it('getMessageRequests: bana gelen PENDING istekleri gönderen + önizleme ile döner', async () => {
    resetMocks();
    const service = makeService();
    const now = new Date('2026-07-06T10:00:00.000Z');
    prismaMock.channel.findMany.mockResolvedValue([
      {
        id: CH,
        createdAt: now,
        dmRequester: { id: TARGET, username: 'isteyen', avatarUrl: null },
        messages: [{ content: 'selam olur mu', createdAt: now }],
      },
    ]);

    const res = await service.getMessageRequests(SENDER);

    expect(res).toEqual([
      {
        channelId: CH,
        requester: { id: TARGET, username: 'isteyen', avatarUrl: null },
        preview: 'selam olur mu',
        createdAt: now.toISOString(),
      },
    ]);
    // Yalnız bana gelen (dmRequesterId != me) + PENDING sorgulanmalı
    expect(prismaMock.channel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dmRequestStatus: 'PENDING',
          dmRequesterId: { not: SENDER },
        }),
      }),
    );
  });

  it('getMessageRequests: mesajsız PENDING kanal görünmez (C75 K1), sorgu silinmemiş mesaj şartı taşır', async () => {
    resetMocks();
    const service = makeService();
    prismaMock.channel.findMany.mockResolvedValue([]);

    await service.getMessageRequests(SENDER);

    expect(prismaMock.channel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ messages: { some: { deletedAt: null } } }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C12 §3.2 — okundu bilgisi görünürlük kararı (R7). Her madde ayrı sınanır:
// bu fonksiyon iki yerden çağrılıyor (DTO + `dm:read` yayını) ve bir maddenin
// sessizce düşmesi, kapalı bir gizlilik anahtarının sızması demek.
// ─────────────────────────────────────────────────────────────────────────────
describe('readReceiptDecision — C12 §3.2 (R7)', () => {
  const READ_AT = new Date('2026-08-11T18:00:00.000Z');

  /** Her şeyin açık olduğu taban; her test yalnız sınadığı maddeyi bozar. */
  const base = {
    isDm: true,
    requestPending: false,
    blockedEitherWay: false,
    viewerReadReceipts: true,
    otherReadReceipts: true,
    otherLastReadAt: READ_AT,
  };

  it('hepsi uygunsa görünür + okuma anını döner', () => {
    expect(readReceiptDecision(base)).toEqual({ visible: true, readAt: READ_AT });
  });

  // 🔴 İlk sürümün kusuru (sahip bulgusu 2026-08-11): "hiç okumamış" ile "gizlilik kapalı" aynı
  // sonuca düşüyordu ve karşı taraf sohbeti bir kez bile açmadıysa tik HİÇ çizilmiyordu. Yani
  // ilk mesajda "İletildi" asla görünmüyordu. Bu test o kusurun geri gelmesini engelliyor.
  it('karşı taraf hiç okumamışsa GÖRÜNÜR kalır, yalnız readAt null olur (tek tik)', () => {
    expect(readReceiptDecision({ ...base, otherLastReadAt: null })).toEqual({
      visible: true,
      readAt: null,
    });
  });

  it('grup DM → görünmez (karşı taraf tanımsız, C12c)', () => {
    expect(readReceiptDecision({ ...base, isDm: false }).visible).toBe(false);
  });

  it('bekleyen mesaj isteği → görünmez (C9 süzgeci delinmesin)', () => {
    expect(readReceiptDecision({ ...base, requestPending: true })).toEqual({
      visible: false,
      readAt: null,
    });
  });

  it('taraflardan biri engellemiş → görünmez', () => {
    expect(readReceiptDecision({ ...base, blockedEitherWay: true })).toEqual({
      visible: false,
      readAt: null,
    });
  });

  it('karşı taraf okundu bilgisini kapatmış → görünmez', () => {
    expect(readReceiptDecision({ ...base, otherReadReceipts: false })).toEqual({
      visible: false,
      readAt: null,
    });
  });

  it('KENDİM kapatmışsam → görünmez (karşılıklılık; paylaşmayan göremez)', () => {
    expect(readReceiptDecision({ ...base, viewerReadReceipts: false })).toEqual({
      visible: false,
      readAt: null,
    });
  });

  it('iki tercih de kapalıysa → görünmez (tek maddeye bağlı kalmasın)', () => {
    expect(
      readReceiptDecision({ ...base, viewerReadReceipts: false, otherReadReceipts: false }).visible,
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C34 §1 — GRUP DM okundu kararı (R7). Bireysel lastReadAt yanıta asla çıkmaz.
// ─────────────────────────────────────────────────────────────────────────────
describe('groupReadReceiptDecision — C34 §1 (R7)', () => {
  const T1 = new Date('2026-10-29T10:00:00.000Z');
  const T2 = new Date('2026-10-29T10:05:00.000Z');
  const T3 = new Date('2026-10-29T10:09:00.000Z');
  const m = (
    lastReadAt: Date | null,
    over: Partial<{ readReceipts: boolean; blockedEitherWay: boolean }> = {},
  ) => ({
    readReceipts: true,
    blockedEitherWay: false,
    lastReadAt,
    ...over,
  });

  it('herkes okuduysa all = en küçük', () => {
    expect(
      groupReadReceiptDecision({ viewerReadReceipts: true, members: [m(T2), m(T1), m(T3)] }),
    ).toEqual({ visible: true, allReadAt: T1 });
  });

  it('hiç okumayan üye varken all null, some okuyanların en büyüğü', () => {
    expect(
      groupReadReceiptDecision({ viewerReadReceipts: true, members: [m(T2), m(null)] }),
    ).toEqual({ visible: true, allReadAt: null });
  });

  it('kimse okumadıysa ikisi de null ama görünür (gri tek tik değil, bekleyen)', () => {
    expect(
      groupReadReceiptDecision({ viewerReadReceipts: true, members: [m(null), m(null)] }),
    ).toEqual({ visible: true, allReadAt: null });
  });

  it('ayarı kapalı üye hesaba katılmaz (ne all bekler ne some olur)', () => {
    expect(
      groupReadReceiptDecision({
        viewerReadReceipts: true,
        members: [m(T3), m(null, { readReceipts: false })],
      }),
    ).toEqual({ visible: true, allReadAt: T3 });
  });

  it('engelli üye hesaba katılmaz', () => {
    expect(
      groupReadReceiptDecision({
        viewerReadReceipts: true,
        members: [m(T2), m(T1, { blockedEitherWay: true })],
      }),
    ).toEqual({ visible: true, allReadAt: T2 });
  });

  it('izleyicinin kendi ayarı kapalıysa görünmez ve zaman sızmaz', () => {
    expect(groupReadReceiptDecision({ viewerReadReceipts: false, members: [m(T1)] })).toEqual({
      visible: false,
      allReadAt: null,
    });
  });

  it('uygun üye yoksa görünmez', () => {
    expect(
      groupReadReceiptDecision({
        viewerReadReceipts: true,
        members: [m(T1, { readReceipts: false }), m(T2, { blockedEitherWay: true })],
      }),
    ).toEqual({ visible: false, allReadAt: null });
    expect(groupReadReceiptDecision({ viewerReadReceipts: true, members: [] }).visible).toBe(false);
  });

  it('çıktıda bireysel okuma anı alanı yok (yalnız iki anahtar)', () => {
    const out = groupReadReceiptDecision({ viewerReadReceipts: true, members: [m(T1), m(T2)] });
    expect(Object.keys(out).sort()).toEqual(['allReadAt', 'visible']);
  });
});

describe('DmService — C34 grup okundu: liste ucu ve canlı yayın', () => {
  const U = 'u-viewer';
  const A = 'u-a';
  const B = 'u-b';
  const GCH = 'g-1';
  const t = (s: string) => new Date(`2026-10-29T${s}.000Z`);
  const mem = (userId: string, lastReadAt: Date | null, readReceipts = true) => ({
    userId,
    lastReadAt,
    user: { id: userId, username: userId, avatarUrl: null, avatarAnimatedUrl: null, readReceipts },
  });
  const groupRow = (members: any[]) => ({
    lastReadAt: null,
    clearedAt: null,
    channel: {
      id: GCH,
      type: 'GROUP_DM',
      name: 'g',
      ownerId: U,
      deletedAt: null,
      dmRequestStatus: null,
      createdAt: t('10:00:00'),
      members,
      messages: [],
    },
  });

  it('liste: grup satırı toplu iki zaman taşır, bireysel okuma anı yok', async () => {
    resetMocks();
    const service = makeService();
    prismaMock.channelMember.findMany.mockResolvedValue([
      groupRow([mem(U, null), mem(A, t('10:05:00')), mem(B, t('10:08:00'))]),
    ]);
    prismaMock.userBlock.findMany.mockResolvedValue([]);
    const res = (await service.getDmChannels(U)) as any[];
    expect(res[0].receiptsEnabled).toBe(true);
    expect(res[0].groupAllReadAt).toBe(t('10:05:00').toISOString());
    expect(res[0].groupSomeReadAt).toBeUndefined();
    expect(res[0].members[0].lastReadAt).toBeUndefined();
    expect(res[0].members.every((x: any) => x.readReceipts === undefined)).toBe(true);
  });

  it('liste: engelli üye ve kapalı üye sayılmaz, izleyici kapalıysa receiptsEnabled false', async () => {
    resetMocks();
    const service = makeService();
    prismaMock.channelMember.findMany.mockResolvedValue([
      groupRow([mem(U, null), mem(A, t('10:05:00')), mem(B, t('10:08:00'), false)]),
    ]);
    prismaMock.userBlock.findMany
      .mockResolvedValueOnce([{ blockedId: A }])
      .mockResolvedValueOnce([]);
    const res = (await service.getDmChannels(U)) as any[];
    // A engelli, B kapalı: uygun üye kalmadı
    expect(res[0].receiptsEnabled).toBe(false);
    expect(res[0].groupAllReadAt).toBeNull();
    expect(res[0].groupSomeReadAt).toBeUndefined();

    resetMocks();
    prismaMock.channelMember.findMany.mockResolvedValue([
      groupRow([mem(U, null, false), mem(A, t('10:05:00'))]),
    ]);
    prismaMock.userBlock.findMany.mockResolvedValue([]);
    const res2 = (await makeService().getDmChannels(U)) as any[];
    expect(res2[0].receiptsEnabled).toBe(false);
  });

  it('markRead grupta: diğer her üyeye kendi gözünden dm:groupRead, okuyana değil, kimlik/bireysel an yok', async () => {
    resetMocks();
    const service = makeService();
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'm-1' });
    prismaMock.channelMember.update.mockResolvedValue({});
    prismaMock.channel.findUnique.mockResolvedValue({
      type: 'GROUP_DM',
      dmRequestStatus: null,
      members: [],
    });
    prismaMock.channelMember.findMany.mockResolvedValue([
      mem(U, t('10:09:00')),
      mem(A, t('10:05:00')),
      mem(B, null, false),
    ]);
    prismaMock.userBlock.findMany.mockResolvedValue([]);

    await service.markRead(U, GCH);

    const calls = realtimeMock.emitToUser.mock.calls.filter((c) => c[1] === 'dm:groupRead');
    expect(calls.map((c) => c[0]).sort()).toEqual([A, B].sort());
    // A'nın gözünden: uygun üye yalnız U (B kapalı) → all = some = U'nun okuması
    const toA = calls.find((c) => c[0] === A)![2];
    expect(toA).toEqual({
      channelId: GCH,
      receiptsEnabled: true,
      groupAllReadAt: t('10:09:00').toISOString(),
    });
    // B kendi ayarını kapattı: görmez
    const toB = calls.find((c) => c[0] === B)![2];
    expect(toB.receiptsEnabled).toBe(false);
    expect(toB.groupAllReadAt).toBeNull();
    expect(toB.groupSomeReadAt).toBeUndefined();
    // 1-1 olayı grupta gitmez
    expect(realtimeMock.emitToUser.mock.calls.some((c) => c[1] === 'dm:read')).toBe(false);
  });
});

// ── C50 §2.4: markRead → kapalı telefondaki v2 bildirimini sil ──────────────────
describe('DmService.markRead — C50 okundu push', () => {
  beforeEach(() => resetMocks());

  it('PushService.notifyRead(okuyan, [kanal]) çağrılır', async () => {
    const push = { notifyRead: jest.fn().mockResolvedValue(undefined) };
    const service = new DmService(
      prismaMock as any,
      dmPermissionMock as any,
      realtimeMock as any,
      push as any,
    );
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'm-1' });
    prismaMock.channelMember.update.mockResolvedValue({});

    await service.markRead('u-reader', 'ch-1');

    expect(push.notifyRead).toHaveBeenCalledWith('u-reader', ['ch-1']);
  });

  it('notifyRead reddederse okuma bozulmaz', async () => {
    const push = { notifyRead: jest.fn().mockRejectedValue(new Error('x')) };
    const service = new DmService(
      prismaMock as any,
      dmPermissionMock as any,
      realtimeMock as any,
      push as any,
    );
    prismaMock.channelMember.findUnique.mockResolvedValue({ id: 'm-1' });
    prismaMock.channelMember.update.mockResolvedValue({});

    await expect(service.markRead('u-reader', 'ch-1')).resolves.toBeNull();
  });
});
