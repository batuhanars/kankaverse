/**
 * C69 park/iptal SQL anlamı GERÇEK Postgres'e karşı (NULL tokenFamily + `<>` tuzağı). Varsayılan KAPALI:
 *   E2EE_DB_TESTS=1 npx jest src/modules/e2ee/e2ee-park.db.spec.ts
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { E2eeRevocationService } from './e2ee-revocation.service';

const run = process.env.E2EE_DB_TESTS === '1' ? describe : describe.skip;

run('C69 gerçek DB: park + kullanıcı kapsamlı iptal', () => {
  const tag = randomBytes(4).toString('hex');
  const prisma = new PrismaService();
  const svc = new E2eeRevocationService(prisma, { devicesChanged: jest.fn() } as never);
  let userId = '';

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: {
        username: `park_${tag}`,
        email: `park_${tag}@test.invalid`,
        passwordHash: 'x',
        birthDate: new Date('1990-01-01'),
        isMinor: false,
        friendCode: `P${tag}`,
      },
    });
    userId = u.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('logout park eder (iptal değil); parola değişimi kapsamı park cihazı da iptal eder, mevcut zinciri korur', async () => {
    const mk = (family: string | null) =>
      prisma.e2eeDevice.create({
        data: { userId, tokenFamily: family, platform: 'web', signatureKey: randomBytes(32) },
      });
    const out = await mk(`fam_${tag}_out`);
    const keep = await mk(`fam_${tag}_keep`);
    const other = await mk(`fam_${tag}_other`);

    await prisma.$transaction(svc.parkOps(`fam_${tag}_out`));
    const parked = await prisma.e2eeDevice.findUniqueOrThrow({ where: { id: out.id } });
    expect(parked.tokenFamily).toBeNull();
    expect(parked.parkedAt).toBeInstanceOf(Date);
    expect(parked.revokedAt).toBeNull();

    const sess = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash: 'h',
        tokenFamily: `fam_${tag}_keep`,
      },
    });
    await prisma.$transaction(await svc.revokeOps({ userId, exceptSessionId: sess.id }));
    const rows = await prisma.e2eeDevice.findMany({
      where: { id: { in: [out.id, keep.id, other.id] } },
    });
    const by = Object.fromEntries(rows.map((r) => [r.id, r.revokedAt !== null]));
    expect(by[out.id]).toBe(true); // park iptal edildi
    expect(by[other.id]).toBe(true);
    expect(by[keep.id]).toBe(false); // mevcut oturumun zinciri korundu
    await prisma.session.deleteMany({ where: { userId } });
  });
});
