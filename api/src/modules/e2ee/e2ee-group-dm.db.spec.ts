/**
 * E2 §2.4/§2.5 gerçek Postgres'e karşı (grup DM üyelik transaction'ı + katılım öncesi süzgeç). Varsayılan KAPALI:
 *   E2EE_DB_TESTS=1 npx jest src/modules/e2ee/e2ee-group-dm.db.spec.ts
 * Yerel geliştirme DB'sine yazar, kendi satırlarını (rastgele ek) temizler.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { DmService } from '../dm/dm.service';
import { MessagesService } from '../messages/messages.service';
import { E2eeMembershipService } from './e2ee-membership.service';

const run = process.env.E2EE_DB_TESTS === '1' ? describe : describe.skip;

run('E2EE grup DM gerçek DB', () => {
  const tag = randomBytes(4).toString('hex');
  const prisma = new PrismaService();
  const userIds: string[] = [];
  const channelIds: string[] = [];

  const flag = { isEligible: jest.fn().mockReturnValue(true) };
  const notify = { deviceChangedInChannel: jest.fn() };
  const realtime = { removeUserFromRoom: jest.fn(), emitToUser: jest.fn() };
  const membershipSvc = new E2eeMembershipService(
    prisma,
    flag as never,
    notify as never,
    realtime as never,
  );
  const dm = new DmService(
    prisma,
    { canDm: jest.fn() } as never,
    realtime as never,
    undefined,
    membershipSvc,
  );

  async function makeUser(name: string) {
    const u = await prisma.user.create({
      data: {
        username: `g2_${tag}_${name}`,
        email: `g2_${tag}_${name}@test.invalid`,
        passwordHash: 'x',
        birthDate: new Date('1990-01-01'),
        isMinor: false,
        friendCode: `G${tag}${name}`,
      },
    });
    userIds.push(u.id);
    return u;
  }

  /** 3 üyeli GROUP_DM; üyelik satırlarının createdAt'i verilen zamana çekilir. */
  async function makeGroup(name: string, joined: Date) {
    const [owner, b, c] = [
      await makeUser(`o${name}`),
      await makeUser(`b${name}`),
      await makeUser(`c${name}`),
    ];
    const ch = await prisma.channel.create({
      data: { type: 'GROUP_DM', ownerId: owner.id, name: `g${name}` },
    });
    channelIds.push(ch.id);
    await prisma.channelMember.createMany({
      data: [owner, b, c].map((u) => ({ channelId: ch.id, userId: u.id, createdAt: joined })),
    });
    return { ch, owner, b, c };
  }

  async function makeDevice(userId: string, family: string) {
    return prisma.e2eeDevice.create({
      data: { userId, tokenFamily: family, platform: 'web', signatureKey: randomBytes(32) },
    });
  }

  afterAll(async () => {
    await prisma.e2eeWelcome.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.e2eeFormerMember.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.e2eeGroup.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.message.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.channelMember.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.channel.deleteMany({ where: { id: { in: channelIds } } });
    await prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // cihaz + paket cascade
    await prisma.$disconnect();
  });

  beforeEach(() => jest.clearAllMocks());

  it('çıkarma: üyelik + eski-üye kaydı + BEKLEYEN Welcome silme tek transaction; teslim edilmiş Welcome kalır; soket odadan çıkar; olay yayılır', async () => {
    const { ch, owner, b } = await makeGroup('1', new Date('2026-11-01'));
    await prisma.e2eeGroup.create({
      data: { channelId: ch.id, groupId: randomBytes(32), epoch: 3, createdById: 'x' },
    });
    const dev = await makeDevice(b.id, `fam_${tag}_b1`);
    await prisma.e2eeWelcome.create({
      data: { channelId: ch.id, epoch: 2, targetDeviceId: dev.id, welcome: randomBytes(4) },
    });
    await prisma.e2eeWelcome.create({
      data: {
        channelId: ch.id,
        epoch: 1,
        targetDeviceId: dev.id,
        welcome: randomBytes(4),
        deliveredAt: new Date(),
      },
    });

    await dm.removeGroupMember(owner.id, ch.id, b.id);

    expect(await prisma.channelMember.count({ where: { channelId: ch.id, userId: b.id } })).toBe(0);
    const former = await prisma.e2eeFormerMember.findMany({ where: { channelId: ch.id } });
    expect(former.map((f) => f.userId)).toEqual([b.id]);
    const welcomes = await prisma.e2eeWelcome.findMany({ where: { channelId: ch.id } });
    expect(welcomes).toHaveLength(1);
    expect(welcomes[0].deliveredAt).not.toBeNull();
    expect(realtime.removeUserFromRoom).toHaveBeenCalledWith(b.id, ch.id);
    expect(notify.deviceChangedInChannel).toHaveBeenCalledWith(ch.id, b.id);
  });

  it('tekrar ayrılma leftAt günceller; yeniden ekleme (addOps ile) kaydı siler', async () => {
    const { ch, owner, b } = await makeGroup('2', new Date('2026-11-01'));
    await prisma.e2eeGroup.create({
      data: { channelId: ch.id, groupId: randomBytes(32), epoch: 2, createdById: 'x' },
    });
    await dm.removeGroupMember(owner.id, ch.id, b.id);
    const first = await prisma.e2eeFormerMember.findFirstOrThrow({ where: { channelId: ch.id } });

    // yeniden ekle: ChannelMember.create + addOps (DmService.addGroupMember'ın yazdığı transaction)
    await prisma.$transaction([
      prisma.channelMember.create({ data: { channelId: ch.id, userId: b.id } }),
      ...membershipSvc.addOps(ch.id, b.id),
    ]);
    expect(await prisma.e2eeFormerMember.count({ where: { channelId: ch.id } })).toBe(0);

    // tekrar çık: yeni satır, leftAt ilkinden sonra
    await dm.removeGroupMember(owner.id, ch.id, b.id);
    const second = await prisma.e2eeFormerMember.findFirstOrThrow({ where: { channelId: ch.id } });
    expect(second.leftAt.getTime()).toBeGreaterThanOrEqual(first.leftAt.getTime());
  });

  it('şifreli grup YOKKEN çıkarma E2EE tablolarına dokunmaz ve olay yayınlamaz (soket yine çıkar)', async () => {
    const { ch, owner, b } = await makeGroup('3', new Date('2026-11-01'));
    await dm.removeGroupMember(owner.id, ch.id, b.id);
    expect(await prisma.e2eeFormerMember.count({ where: { channelId: ch.id } })).toBe(0);
    expect(notify.deviceChangedInChannel).not.toHaveBeenCalled();
    expect(realtime.removeUserFromRoom).toHaveBeenCalledWith(b.id, ch.id);
  });

  it('katılım öncesi şifreli mesaj: liste, sayfalama, DM listesi lastMessage ve okunmamış; düz eski mesaj görünür', async () => {
    const joined = new Date('2026-11-10T12:00:00Z');
    const { ch, owner, b } = await makeGroup('4', new Date('2026-11-01'));
    // b'nin katılımı sonradan: üyelik satırını yeniden yaz
    await prisma.channelMember.update({
      where: { channelId_userId: { channelId: ch.id, userId: b.id } },
      data: { createdAt: joined },
    });
    const mk = (content: string, encrypted: boolean, at: string) =>
      prisma.message.create({
        data: {
          channelId: ch.id,
          authorId: owner.id,
          content,
          encrypted,
          ciphertext: encrypted ? randomBytes(8) : null,
          createdAt: new Date(at),
        },
      });
    await mk('eski düz', false, '2026-11-09T10:00:00Z');
    await mk('', true, '2026-11-10T10:00:00Z'); // katılım öncesi şifreli: gizli
    await mk('', true, '2026-11-10T13:00:00Z'); // katılım sonrası şifreli: görünür

    const membership = {
      requireChannelAccess: () => Promise.resolve({ id: ch.id, type: 'GROUP_DM', guildId: null }),
    };
    const messages = new MessagesService(
      prisma,
      membership as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    const forNew = await messages.findMessages(b.id, ch.id);
    expect(forNew.map((m) => [m.content, m.createdAt])).toEqual([
      ['', '2026-11-10T13:00:00.000Z'],
      ['eski düz', '2026-11-09T10:00:00.000Z'],
    ]);
    // eski üye (owner) hepsini görür
    expect(await messages.findMessages(owner.id, ch.id)).toHaveLength(3);

    // yalnız katılım sonrası şifreli mesaj kalmasın: onu sil, önizleme eski düz mesaja düşer
    await prisma.message.updateMany({
      where: { channelId: ch.id, encrypted: true, createdAt: { gt: joined } },
      data: { deletedAt: new Date() },
    });
    const list = (await dm.getDmChannels(b.id)) as Array<{
      id: string;
      lastMessage: { content: string } | null;
    }>;
    expect(list.find((c) => c.id === ch.id)?.lastMessage?.content).toBe('eski düz');
  });

  it('yalnız katılım öncesi şifreli mesaj varsa: lastMessage null, okunmamış YOK', async () => {
    const joined = new Date('2026-11-10T12:00:00Z');
    const { ch, owner, b } = await makeGroup('5', new Date('2026-11-01'));
    await prisma.channelMember.update({
      where: { channelId_userId: { channelId: ch.id, userId: b.id } },
      data: { createdAt: joined },
    });
    await prisma.message.create({
      data: {
        channelId: ch.id,
        authorId: owner.id,
        content: '',
        encrypted: true,
        ciphertext: randomBytes(8),
        createdAt: new Date('2026-11-10T10:00:00Z'),
      },
    });
    const list = (await dm.getDmChannels(b.id)) as Array<{
      id: string;
      lastMessage: unknown;
      unread: boolean;
    }>;
    const row = list.find((c) => c.id === ch.id)!;
    expect(row.lastMessage).toBeNull();
    expect(row.unread).toBe(false);
    // kurucuda (katılım öncesi) görünür ve okunmamış
    const ownerRow = (
      (await dm.getDmChannels(owner.id)) as Array<{ id: string; unread: boolean }>
    ).find((c) => c.id === ch.id)!;
    expect(ownerRow.unread).toBe(true);
  });
});
