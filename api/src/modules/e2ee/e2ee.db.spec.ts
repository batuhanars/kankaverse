/**
 * E1 yarış/atomiklik testleri GERÇEK Postgres'e karşı. Varsayılan KAPALI (CI'da DB yok):
 *   E2EE_DB_TESTS=1 npx jest src/modules/e2ee/e2ee.db.spec.ts
 * Yerel geliştirme DB'sine yazar, kendi satırlarını (rastgele ek) temizler.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { E2eeClaimService } from './e2ee-claim.service';
import { E2eeDevicesService } from './e2ee-devices.service';
import { E2eeGroupsService } from './e2ee-groups.service';
import { E2eeRevocationService } from './e2ee-revocation.service';
import { toB64 } from './e2ee.util';

const run = process.env.E2EE_DB_TESTS === '1' ? describe : describe.skip;

run('E2EE gerçek DB: atomiklik ve yarışlar', () => {
  const tag = randomBytes(4).toString('hex');
  const prisma = new PrismaService();
  const notify = { welcome: jest.fn(), commit: jest.fn(), devicesChanged: jest.fn() };
  const devicesSvc = new E2eeDevicesService(prisma, notify as never);
  const userIds: string[] = [];
  const channelIds: string[] = [];

  async function makeUser(name: string) {
    const u = await prisma.user.create({
      data: {
        username: `e2ee_${tag}_${name}`,
        email: `e2ee_${tag}_${name}@test.invalid`,
        passwordHash: 'x',
        birthDate: new Date('1990-01-01'),
        isMinor: false,
        friendCode: `E${tag}${name}`,
      },
    });
    userIds.push(u.id);
    return u;
  }

  async function makeDevice(userId: string, family: string, keyPackages: number) {
    const dev = await prisma.e2eeDevice.create({
      data: { userId, tokenFamily: family, platform: 'web', signatureKey: randomBytes(32) },
    });
    for (let i = 0; i < keyPackages; i++) {
      await prisma.e2eeKeyPackage.create({ data: { deviceId: dev.id, data: randomBytes(16) } });
    }
    return dev;
  }

  const channel = () => {
    const id = `ch_${tag}_${channelIds.length}`;
    channelIds.push(id);
    return id;
  };

  afterAll(async () => {
    await prisma.e2eeWelcome.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.e2eeHandshake.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.e2eeGroup.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // cihaz + paket cascade
    await prisma.$disconnect();
  });

  it('KeyPackage claim: 8 eşzamanlı claim, tek tüketilebilir paket → paket YALNIZ bir kez döner', async () => {
    const [a, b] = [await makeUser('a1'), await makeUser('b1')];
    const target = await makeDevice(b.id, `fam_${tag}_t1`, 1);
    const lastResort = await prisma.e2eeKeyPackage.create({
      data: { deviceId: target.id, data: randomBytes(16), lastResort: true },
    });
    const single = await prisma.e2eeKeyPackage.findFirstOrThrow({
      where: { deviceId: target.id, lastResort: false },
    });
    const channels = {
      requireDmMembers: () => Promise.resolve([a.id, b.id]),
      assertAllEligible: () => {},
    };
    const claim = new E2eeClaimService(prisma, channels as never);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => claim.claim(a.id, 'any', [target.id])),
    );
    const returned = results.map((r) => r[0].keyPackage);
    const singleB64 = toB64(single.data);
    expect(returned.filter((k) => k === singleB64)).toHaveLength(1);
    expect(returned.filter((k) => k === toB64(lastResort.data))).toHaveLength(7);

    const consumed = await prisma.e2eeKeyPackage.findMany({
      where: { deviceId: target.id, consumedAt: { not: null } },
    });
    expect(consumed.map((c) => c.id)).toEqual([single.id]); // son çare tüketilmedi
  });

  it('KeyPackage claim: N paket, N eşzamanlı claim → hepsi FARKLI paket', async () => {
    const [a, b] = [await makeUser('a2'), await makeUser('b2')];
    const target = await makeDevice(b.id, `fam_${tag}_t2`, 6);
    const channels = {
      requireDmMembers: () => Promise.resolve([a.id, b.id]),
      assertAllEligible: () => {},
    };
    const claim = new E2eeClaimService(prisma, channels as never);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => claim.claim(a.id, 'any', [target.id])),
    );
    const keys = results.map((r) => r[0].keyPackage);
    expect(new Set(keys).size).toBe(6);
  });

  async function groupFixture(name: string) {
    const [a, b] = [await makeUser(`ga${name}`), await makeUser(`gb${name}`)];
    const da = await makeDevice(a.id, `fam_${tag}_ga${name}`, 0);
    const db = await makeDevice(b.id, `fam_${tag}_gb${name}`, 0);
    const channels = {
      requireDmMembers: () => Promise.resolve([a.id, b.id]),
      assertAllEligible: () => {},
      access: () => Promise.resolve({ isOneToOneDm: true, memberIds: [a.id, b.id] }),
    };
    const groups = new E2eeGroupsService(prisma, channels as never, devicesSvc, notify as never);
    const userA = { id: a.id, username: 'a', sessionId: 's', tokenFamily: `fam_${tag}_ga${name}` };
    return { groups, userA, da, db };
  }
  const blob = () => toB64(randomBytes(8));

  it('grup kurma yarışı: 4 eşzamanlı kurucu → biri kazanır, diğerleri 409 E2EE_GROUP_EXISTS', async () => {
    const { groups, userA, db } = await groupFixture('1');
    const ch = channel();
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        groups.createGroup(userA as never, ch, {
          groupId: toB64(randomBytes(32)),
          commit: blob(),
          welcomes: [{ deviceId: db.id, welcome: blob() }],
        }),
      ),
    );
    const ok = attempts.filter((r) => r.status === 'fulfilled');
    const failed = attempts.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed.every((f) => f.reason.response?.error === 'E2EE_GROUP_EXISTS')).toBe(true);
    expect(await prisma.e2eeGroup.count({ where: { channelId: ch } })).toBe(1);
    expect(await prisma.e2eeHandshake.count({ where: { channelId: ch } })).toBe(1);
    expect(await prisma.e2eeWelcome.count({ where: { channelId: ch } })).toBe(1);
  });

  it('epoch yarışı: aynı epoch ile 6 eşzamanlı commit → tam biri kabul, diğerleri 409 + currentEpoch', async () => {
    const { groups, userA } = await groupFixture('2');
    const ch = channel();
    await prisma.e2eeGroup.create({
      data: { channelId: ch, groupId: randomBytes(32), epoch: 1, createdById: 'x' },
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        groups.postCommit(userA as never, ch, { epoch: 1, commit: blob() }),
      ),
    );
    const ok = attempts.filter((r) => r.status === 'fulfilled');
    const failed = attempts.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(5);
    for (const f of failed) {
      expect(f.reason.response).toMatchObject({ error: 'E2EE_EPOCH_CONFLICT', currentEpoch: 2 });
    }
    expect((await prisma.e2eeGroup.findUniqueOrThrow({ where: { channelId: ch } })).epoch).toBe(2);
    expect(await prisma.e2eeHandshake.count({ where: { channelId: ch, epoch: 1 } })).toBe(1);
  });

  it('iptal: aynı transaction cihazı iptal eder + KeyPackage siler; başka zincir etkilenmez; sonra /e2ee kapısı reddeder', async () => {
    const u = await makeUser('rv');
    const d1 = await makeDevice(u.id, `fam_${tag}_rv1`, 3);
    const d2 = await makeDevice(u.id, `fam_${tag}_rv2`, 2);
    const svc = new E2eeRevocationService(prisma, notify as never);

    // Rotasyon senaryosu: oturum satırı değişir, zincir aynı → cihaz hâlâ etkin (iptal çağrılmadı)
    await expect(
      devicesSvc.requireActiveDevice({ id: u.id, tokenFamily: `fam_${tag}_rv1` }),
    ).resolves.toMatchObject({ id: d1.id });

    await prisma.$transaction(await svc.revokeOps({ families: [`fam_${tag}_rv1`] }));

    const r1 = await prisma.e2eeDevice.findUniqueOrThrow({ where: { id: d1.id } });
    const r2 = await prisma.e2eeDevice.findUniqueOrThrow({ where: { id: d2.id } });
    expect(r1.revokedAt).not.toBeNull();
    expect(r2.revokedAt).toBeNull();
    expect(await prisma.e2eeKeyPackage.count({ where: { deviceId: d1.id } })).toBe(0);
    expect(await prisma.e2eeKeyPackage.count({ where: { deviceId: d2.id } })).toBe(2);
    await expect(
      devicesSvc.requireActiveDevice({ id: u.id, tokenFamily: `fam_${tag}_rv1` }),
    ).rejects.toMatchObject({ status: 403 });

    // kullanıcı kapsamı + istisna: mevcut zincir (rv2) hariç hiçbir şey kalmadı; rv2 korunur
    const d3 = await makeDevice(u.id, `fam_${tag}_rv3`, 1);
    const sess = await prisma.session.create({
      data: { userId: u.id, refreshTokenHash: 'x', tokenFamily: `fam_${tag}_rv2` },
    });
    await prisma.$transaction(await svc.revokeOps({ userId: u.id, exceptSessionId: sess.id }));
    expect(
      (await prisma.e2eeDevice.findUniqueOrThrow({ where: { id: d3.id } })).revokedAt,
    ).not.toBeNull();
    expect(
      (await prisma.e2eeDevice.findUniqueOrThrow({ where: { id: d2.id } })).revokedAt,
    ).toBeNull();
    await prisma.session.delete({ where: { id: sess.id } });
  });
});
