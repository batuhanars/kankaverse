import { AiVideoGrantsService } from './ai-video-grants.service';

function setup(user: unknown) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    aiVideoGrant: {
      upsert: jest.fn().mockImplementation(({ create }) => ({
        ...create,
        id: 'g1',
        revokedAt: null,
        user: { id: create.userId, username: 'kanka' },
        grantedBy: { id: create.grantedById, username: 'admin' },
      })),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiVideoGeneration: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const config = { get: () => undefined }; // kredi = varsayilan 10000 mikro-USD
  return { prisma, service: new AiVideoGrantsService(prisma as any, config as any) };
}

describe('AiVideoGrantsService (C40 admin)', () => {
  it('olusturur: kredi -> mikro-USD, startsAt yeni, audit ai_video.grant', async () => {
    const { prisma, service } = setup({ id: 'u2', isMinor: false, deletedAt: null });
    const row = await service.upsert('admin1', 'u2', { budgetCredits: 50, note: 'IBAN' });
    const args = prisma.aiVideoGrant.upsert.mock.calls[0][0];
    expect(args.create.budgetMicroUsd).toBe(500_000);
    expect(args.update.revokedAt).toBeNull(); // yeniden verme iptali kaldirir
    expect(args.update.startsAt).toBeInstanceOf(Date); // yeni donem
    expect(row.budgetCredits).toBe(50);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin1',
        action: 'ai_video.grant',
        entityId: 'u2',
        metadata: { budgetCredits: 50, expiresAt: null, note: 'IBAN' },
      }),
    });
  });

  it('minor: 403 MINOR_NOT_ALLOWED, kayit yazilmaz', async () => {
    const { prisma, service } = setup({ id: 'u2', isMinor: true, deletedAt: null });
    await expect(service.upsert('a', 'u2', { budgetCredits: 5 })).rejects.toMatchObject({
      status: 403,
      response: { error: 'MINOR_NOT_ALLOWED' },
    });
    expect(prisma.aiVideoGrant.upsert).not.toHaveBeenCalled();
  });

  it('silinmis ya da yok kullanici: 404', async () => {
    await expect(
      setup({ id: 'u2', isMinor: false, deletedAt: new Date() }).service.upsert('a', 'u2', {
        budgetCredits: 5,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(setup(null).service.upsert('a', 'x', { budgetCredits: 5 })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('gecmis bitis tarihi 400', async () => {
    const { service } = setup({ id: 'u2', isMinor: false, deletedAt: null });
    await expect(
      service.upsert('a', 'u2', { budgetCredits: 5, expiresAt: '2020-01-01T00:00:00Z' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('iptal: revokedAt yazar (silmez) + audit ai_video.revoke; kayit yoksa 404', async () => {
    const { prisma, service } = setup(null);
    prisma.aiVideoGrant.findUnique.mockResolvedValue({
      userId: 'u2',
      budgetMicroUsd: 500_000,
      expiresAt: null,
      note: null,
    });
    await service.revoke('admin1', 'u2');
    expect(prisma.aiVideoGrant.update).toHaveBeenCalledWith({
      where: { userId: 'u2' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ai_video.revoke' }),
    });
    prisma.aiVideoGrant.findUnique.mockResolvedValue(null);
    await expect(service.revoke('a', 'u2')).rejects.toMatchObject({ status: 404 });
  });
});
