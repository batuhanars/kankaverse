import { ForbiddenException } from '@nestjs/common';
import { E2eeClaimService } from './e2ee-claim.service';
import { toB64 } from './e2ee.util';

const KP = new Uint8Array([5, 6, 7]);

function setup() {
  const prisma = {
    e2eeDevice: { findMany: jest.fn() },
    e2eeKeyPackage: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const channels = {
    requireDmMembers: jest.fn().mockResolvedValue(['u1', 'u2']),
    assertAllEligible: jest.fn(),
  };
  return { prisma, channels, svc: new E2eeClaimService(prisma as never, channels as never) };
}

describe('E2eeClaimService (§2.3, R7)', () => {
  it('çağıran kanal üyesi değil (ortak DM yok) → kapı 403 fırlatır, hiçbir paket tüketilmez', async () => {
    const { prisma, channels, svc } = setup();
    channels.requireDmMembers.mockRejectedValue(new ForbiddenException('NOT_CHANNEL_MEMBER'));
    await expect(svc.claim('x', 'ch', ['d1'])).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('hedef cihaz kanal üyesine ait değil → 403 E2EE_DEVICE_NOT_IN_CHANNEL', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([
      { id: 'd9', userId: 'outsider', revokedAt: null },
    ]);
    await expect(svc.claim('u1', 'ch', ['d9'])).rejects.toMatchObject({
      status: 403,
      response: { error: 'E2EE_DEVICE_NOT_IN_CHANNEL' },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('var olmayan cihaz kimliği de aynı 403 (cihaz varlığı sızdırılmaz)', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([]);
    await expect(svc.claim('u1', 'ch', ['yok'])).rejects.toMatchObject({ status: 403 });
  });

  it('tek kullanımlık paket atomik UPDATE ile alınır; son çare istenmez', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([{ id: 'd1', userId: 'u2', revokedAt: null }]);
    prisma.$queryRaw.mockResolvedValue([{ data: KP }]);
    const res = await svc.claim('u1', 'ch', ['d1']);
    expect(res).toEqual([{ deviceId: 'd1', keyPackage: toB64(KP) }]);
    expect(prisma.e2eeKeyPackage.findFirst).not.toHaveBeenCalled();
    const sql = (prisma.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('UPDATE "E2eeKeyPackage"');
    expect(sql).toContain('"consumedAt" IS NULL');
  });

  it('tek kullanımlık kalmadıysa son çare döner ve TÜKETİLMEZ (UPDATE çağrısı yok)', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([{ id: 'd1', userId: 'u2', revokedAt: null }]);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.e2eeKeyPackage.findFirst.mockResolvedValue({ data: KP });
    const res = await svc.claim('u1', 'ch', ['d1']);
    expect(res).toEqual([{ deviceId: 'd1', keyPackage: toB64(KP) }]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // yalnız tek-kullanımlık deneme
  });

  it('ikisi de yoksa cihaz listede yok; iptal edilmiş cihaz atlanır', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([
      { id: 'd1', userId: 'u2', revokedAt: null },
      { id: 'd2', userId: 'u2', revokedAt: new Date() },
    ]);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.e2eeKeyPackage.findFirst.mockResolvedValue(null);
    await expect(svc.claim('u1', 'ch', ['d1', 'd2'])).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('kanal iki üyeli uygun 1-1 DM değilse (uygunluk) 422 kapısı çağrılır', async () => {
    const { channels, svc, prisma } = setup();
    channels.assertAllEligible.mockImplementation(() => {
      throw new Error('NOT_ELIGIBLE');
    });
    await expect(svc.claim('u1', 'ch', ['d1'])).rejects.toThrow('NOT_ELIGIBLE');
    expect(prisma.e2eeDevice.findMany).not.toHaveBeenCalled();
  });
});
