import { ForbiddenException } from '@nestjs/common';
import { DmService } from './dm.service';

/**
 * E2 §2.2/§2.4/§2.5: grup DM üyelik yollarının E2EE bağlantısı ve liste süzgeci.
 * E2EE servisi enjekte edilmeden (eski davranış) testler dm.service.spec.ts'te kalır.
 */
const OWNER = 'owner-1';
const TARGET = 'target-1';
const GROUP = 'group-1';
const GROUP_CHANNEL = {
  id: GROUP,
  type: 'GROUP_DM',
  name: 'G',
  ownerId: OWNER,
  guildId: null,
  deletedAt: null,
};

function setup() {
  const prisma = {
    channel: { findUnique: jest.fn(), update: jest.fn() },
    channelMember: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockReturnValue('create-op'),
      delete: jest.fn().mockReturnValue('delete-op'),
      count: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    friendship: { findFirst: jest.fn() },
    message: { findFirst: jest.fn() },
    userBlock: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const e2ee = {
    assertMemberAddable: jest.fn().mockResolvedValue(undefined),
    addOps: jest.fn().mockReturnValue(['former-delete-op']),
    departureOps: jest.fn().mockResolvedValue(['former-upsert-op', 'welcome-delete-op']),
    afterAdd: jest.fn().mockResolvedValue(undefined),
    afterDeparture: jest.fn().mockResolvedValue(undefined),
  };
  const service = new DmService(
    prisma as never,
    { canDm: jest.fn() } as never,
    { emitToUser: jest.fn() } as never,
    undefined,
    e2ee as never,
  );
  prisma.channel.findUnique.mockResolvedValue(GROUP_CHANNEL);
  return { prisma, e2ee, service };
}

describe('DmService.addGroupMember: E2EE bağlantısı (§2.2/§2.4)', () => {
  function ready(prisma: ReturnType<typeof setup>['prisma']) {
    prisma.channelMember.findUnique.mockImplementation(
      ({ where }: { where: { channelId_userId: { userId: string } } }) =>
        Promise.resolve(where.channelId_userId.userId === OWNER ? { id: 'cm-owner' } : null),
    );
    prisma.user.findUnique.mockResolvedValue({
      id: TARGET,
      isMinor: false,
      username: 't',
      avatarUrl: null,
    });
    prisma.friendship.findFirst.mockResolvedValue({ id: 'f1' });
  }

  it('üyelik + eski-üye kaydı silme TEK transaction; commit sonrası afterAdd', async () => {
    const { prisma, e2ee, service } = setup();
    ready(prisma);
    await service.addGroupMember(OWNER, GROUP, { userId: TARGET });

    expect(e2ee.assertMemberAddable).toHaveBeenCalledWith(GROUP, TARGET);
    expect(prisma.$transaction).toHaveBeenCalledWith(['create-op', 'former-delete-op']);
    expect(e2ee.afterAdd).toHaveBeenCalledWith(GROUP, TARGET);
  });

  it('şifreli gruba uygun olmayan üye: 422 fırlar, üyelik YAZILMAZ, olay yok', async () => {
    const { prisma, e2ee, service } = setup();
    ready(prisma);
    e2ee.assertMemberAddable.mockRejectedValue(Object.assign(new Error('x'), { status: 422 }));
    await expect(service.addGroupMember(OWNER, GROUP, { userId: TARGET })).rejects.toMatchObject({
      status: 422,
    });
    expect(prisma.channelMember.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(e2ee.afterAdd).not.toHaveBeenCalled();
  });
});

describe('DmService.leaveGroupDm / removeGroupMember: E2EE bağlantısı (§2.4)', () => {
  it('ayrılma: üyelik silme + eski-üye upsert + bekleyen Welcome silme TEK transaction; sonra afterDeparture(kanal silinmedi)', async () => {
    const { prisma, e2ee, service } = setup();
    prisma.channelMember.findUnique.mockResolvedValue({ id: 'cm-1' });
    prisma.channelMember.count.mockResolvedValue(2);

    await service.leaveGroupDm(TARGET, GROUP);

    expect(e2ee.departureOps).toHaveBeenCalledWith(GROUP, TARGET);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      'delete-op',
      'former-upsert-op',
      'welcome-delete-op',
    ]);
    expect(prisma.channel.update).not.toHaveBeenCalled();
    expect(e2ee.afterDeparture).toHaveBeenCalledWith(GROUP, TARGET, false);
  });

  it('çıkarma: hedef kullanıcı için aynı akış (çağıran için değil)', async () => {
    const { prisma, e2ee, service } = setup();
    prisma.channelMember.findUnique.mockImplementation(
      ({ where }: { where: { channelId_userId: { userId: string } } }) =>
        Promise.resolve({ id: `cm-${where.channelId_userId.userId}`, isAdmin: false }),
    );
    prisma.channelMember.count.mockResolvedValue(3);

    await service.removeGroupMember(OWNER, GROUP, TARGET);

    expect(e2ee.departureOps).toHaveBeenCalledWith(GROUP, TARGET);
    expect(prisma.channelMember.delete).toHaveBeenCalledWith({ where: { id: `cm-${TARGET}` } });
    expect(e2ee.afterDeparture).toHaveBeenCalledWith(GROUP, TARGET, false);
  });

  it('kalan < 2: kanal soft-delete, afterDeparture(channelDeleted=true)', async () => {
    const { prisma, e2ee, service } = setup();
    prisma.channelMember.findUnique.mockResolvedValue({ id: 'cm-1' });
    prisma.channelMember.count.mockResolvedValue(1);

    await service.leaveGroupDm(TARGET, GROUP);

    expect(prisma.channel.update).toHaveBeenCalled();
    expect(e2ee.afterDeparture).toHaveBeenCalledWith(GROUP, TARGET, true);
  });

  it('şifreli grup yoksa (departureOps boş) tek sorgu, transaction yok (bugünkü davranış)', async () => {
    const { prisma, e2ee, service } = setup();
    e2ee.departureOps.mockResolvedValue([]);
    prisma.channelMember.findUnique.mockResolvedValue({ id: 'cm-1' });
    prisma.channelMember.count.mockResolvedValue(2);

    await service.leaveGroupDm(TARGET, GROUP);

    expect(prisma.channelMember.delete).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(e2ee.afterDeparture).toHaveBeenCalledWith(GROUP, TARGET, false);
  });

  it('üye olmayan ayrılamaz: 403, E2EE işlemi yok', async () => {
    const { prisma, e2ee, service } = setup();
    prisma.channelMember.findUnique.mockResolvedValue(null);
    await expect(service.leaveGroupDm('x', GROUP)).rejects.toBeInstanceOf(ForbiddenException);
    expect(e2ee.departureOps).not.toHaveBeenCalled();
    expect(e2ee.afterDeparture).not.toHaveBeenCalled();
  });
});

describe('DmService.getDmChannels: katılım öncesi şifreli mesaj listede/okunmamışta yok (§2.5)', () => {
  const JOINED = new Date('2026-11-10T12:00:00Z');
  const OLD = new Date('2026-11-09T12:00:00Z');

  function membership(messages: unknown[]) {
    return {
      userId: 'new-user',
      channelId: GROUP,
      lastReadAt: null,
      clearedAt: null,
      lastReaction: null,
      createdAt: JOINED,
      channel: {
        id: GROUP,
        type: 'GROUP_DM',
        deletedAt: null,
        name: 'G',
        ownerId: OWNER,
        createdAt: OLD,
        dmRequestStatus: null,
        members: [
          {
            userId: 'new-user',
            isAdmin: false,
            lastReadAt: null,
            user: {
              id: 'new-user',
              username: 'n',
              avatarUrl: null,
              avatarAnimatedUrl: null,
              readReceipts: true,
            },
          },
        ],
        messages,
      },
    };
  }
  const lastMsg = (id: string, encrypted: boolean, createdAt: Date) => ({
    id,
    channelId: GROUP,
    content: encrypted ? '' : 'düz',
    replyToId: null,
    encrypted,
    createdAt,
    author: { id: 'a', username: 'a', avatarUrl: null },
    attachments: [],
  });

  it('en yeni mesaj katılım öncesi şifreliyse: lastMessage süzgeçle yeniden seçilir; hiç yoksa null ve okunmamış YOK', async () => {
    const { prisma, service } = setup();
    prisma.channelMember.findMany.mockResolvedValue([membership([lastMsg('old-enc', true, OLD)])]);
    prisma.message.findFirst.mockResolvedValue(null);

    const [row] = await service.getDmChannels('new-user');

    expect(prisma.message.findFirst.mock.calls[0][0].where).toEqual({
      channelId: GROUP,
      deletedAt: null,
      NOT: { encrypted: true, createdAt: { lt: JOINED } },
    });
    expect(row.lastMessage).toBeNull();
    expect(row.unread).toBe(false);
  });

  it('süzgeç sonrası eski DÜZ mesaj kalıyorsa o görünür (şifreleme öncesi geçmiş bugünkü gibi)', async () => {
    const { prisma, service } = setup();
    prisma.channelMember.findMany.mockResolvedValue([membership([lastMsg('old-enc', true, OLD)])]);
    prisma.message.findFirst.mockResolvedValue(lastMsg('old-plain', false, new Date('2026-11-08')));

    const [row] = await service.getDmChannels('new-user');
    expect((row.lastMessage as { id: string }).id).toBe('old-plain');
  });

  it('en yeni mesaj katılım SONRASI şifreliyse ek sorgu yok, normal görünür', async () => {
    const { prisma, service } = setup();
    prisma.channelMember.findMany.mockResolvedValue([
      membership([lastMsg('new-enc', true, new Date('2026-11-10T13:00:00Z'))]),
    ]);

    const [row] = await service.getDmChannels('new-user');

    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(row.unread).toBe(true);
    expect(row.lastMessage).toMatchObject({ id: 'new-enc', encrypted: true });
  });
});
