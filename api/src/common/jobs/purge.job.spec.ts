import { PurgeJob } from './purge.job';

// ── Mock PrismaService ───────────────────────────────────────────────────────
const prismaMock = {
  user: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  session: { deleteMany: jest.fn() },
  pushToken: { deleteMany: jest.fn() },
  notificationPref: { deleteMany: jest.fn() },
  recoveryCode: { deleteMany: jest.fn() },
  recentGame: { deleteMany: jest.fn() },
  externalAccount: { deleteMany: jest.fn() },
  externalLinkState: { deleteMany: jest.fn() },
  streamAnnounceOptIn: { deleteMany: jest.fn() },
  e2eeDevice: { updateMany: jest.fn() },
  e2eeKeyPackage: { deleteMany: jest.fn() },
  e2eeBackup: { deleteMany: jest.fn() },
  e2eeBackupSnapshot: { findMany: jest.fn(), deleteMany: jest.fn() },
  e2eeTransfer: { findMany: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(),
};

const storageMock = { delete: jest.fn() };

// ── Mock ConfigService ───────────────────────────────────────────────────────
const configMock = {
  get: jest.fn(),
};

function makeJob() {
  return new PurgeJob(prismaMock as any, configMock as any, storageMock as any);
}

function resetMocks() {
  jest.resetAllMocks();
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.user.update.mockResolvedValue({});
  prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.pushToken.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.notificationPref.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.recoveryCode.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.recentGame.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.externalAccount.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.externalLinkState.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.streamAnnounceOptIn.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.e2eeDevice.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.e2eeKeyPackage.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.e2eeBackup.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.e2eeBackupSnapshot.findMany.mockResolvedValue([]);
  prismaMock.e2eeBackupSnapshot.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.e2eeTransfer.findMany.mockResolvedValue([]);
  prismaMock.e2eeTransfer.deleteMany.mockResolvedValue({ count: 0 });
  storageMock.delete.mockResolvedValue(undefined);
  // Varsayılan: interaktif transaction, tx = prismaMock'un kendisi
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
  );
}

describe('PurgeJob.run — Sprint R6a §2 asgari kimlik imhası', () => {
  let job: PurgeJob;

  beforeEach(() => {
    resetMocks();
    job = makeJob();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('30 günü dolmamış (aday yok) → hiçbir işlem yapmaz, hiç yazma çağrılmaz', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    configMock.get.mockReturnValue(true);

    await job.run();

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('findMany doğru where ile çağrılır (deletionRequestedAt<=30gün VE deletedAt:null)', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    configMock.get.mockReturnValue(true);

    await job.run();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        deletionRequestedAt: { lte: expect.any(Date) },
        deletedAt: null,
      },
      select: { id: true },
    });
  });

  it('PURGE_ENABLED=false iken adaylar bulunsa bile hiçbir yazma yapılmaz (bugünkü davranış korunur)', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    configMock.get.mockReturnValue(false);

    await job.run();

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.pushToken.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.notificationPref.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.recoveryCode.deleteMany).not.toHaveBeenCalled();
  });

  it('dolmuş kullanıcıda PURGE_ENABLED=true → kimlik alanları temizlenir + ilgili satırlar silinir (tek transaction)', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-123' }]);
    configMock.get.mockReturnValue(true);

    await job.run();

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: expect.objectContaining({
        email: 'deleted-user-123@kankaverse.invalid',
        username: 'silinmis_user-123',
        avatarUrl: null,
        bannerUrl: null,
        bio: null,
        twoFactorEnabled: false,
        totpSecret: null,
        deletedAt: expect.any(Date),
        deletionRequestedAt: null,
      }),
    });
    // passwordHash rastgele üretilir ama alan mutlaka set edilmiş olmalı ve boş olmamalı
    const updateData = prismaMock.user.update.mock.calls[0][0].data;
    expect(typeof updateData.passwordHash).toBe('string');
    expect(updateData.passwordHash.length).toBeGreaterThan(0);

    // E1: E2EE cihazları iptal + KeyPackage silme (aynı transaction)
    expect(prismaMock.e2eeKeyPackage.deleteMany).toHaveBeenCalledWith({
      where: { device: { userId: 'user-123' } },
    });
    expect(prismaMock.e2eeDevice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-123', revokedAt: null } }),
    );
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
    expect(prismaMock.pushToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
    expect(prismaMock.notificationPref.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
    });
    expect(prismaMock.recoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
    });
  });

  it('E5a: hesap imhasi yedek anahtar kaydini, goruntu satirlarini ve nesneleri siler; nesne hatasi imhayi bozmaz', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-123' }]);
    configMock.get.mockReturnValue(true);
    prismaMock.e2eeBackupSnapshot.findMany.mockResolvedValue([
      { objectKey: 'e2ee-backup/user-123/d1/aa' },
      { objectKey: 'e2ee-backup/user-123/d2/bb' },
    ]);
    storageMock.delete.mockRejectedValueOnce(new Error('s3 down'));

    await job.run();

    expect(prismaMock.e2eeBackupSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
    });
    expect(prismaMock.e2eeBackup.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
    expect(storageMock.delete).toHaveBeenCalledTimes(2);
    expect(storageMock.delete).toHaveBeenCalledWith('e2ee-backup/user-123/d2/bb');
  });

  it('E5b: hesap imhasi aktarim satirlarini ve yuk nesnelerini siler', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-123' }]);
    configMock.get.mockReturnValue(true);
    prismaMock.e2eeTransfer.findMany.mockResolvedValue([{ objectKey: 'e2ee-transfer/user-123/t1' }]);

    await job.run();

    expect(prismaMock.e2eeTransfer.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
    expect(storageMock.delete).toHaveBeenCalledWith('e2ee-transfer/user-123/t1');
  });

  it('birden fazla aday → her biri için ayrı transaction, biri başarısız olsa diğeri etkilenmez', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'ok-1' }, { id: 'fail-1' }, { id: 'ok-2' }]);
    configMock.get.mockReturnValue(true);

    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
        // fail-1 kullanıcısının update'i patlasın, diğerleri normal işlesin
        const callArgsSoFar = prismaMock.user.update.mock.calls.length;
        if (callArgsSoFar === 1) {
          // ikinci transaction çağrısı (fail-1) — update reddedilsin
          prismaMock.user.update.mockRejectedValueOnce(new Error('DB hatası'));
        }
        return fn(prismaMock);
      },
    );

    await job.run();

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
  });

  it('ikinci çalıştırmada (imha edilmiş kullanıcı artık aday değil) tekrar iş yapmaz', async () => {
    configMock.get.mockReturnValue(true);

    // 1. çalıştırma: bir aday var, imha edilir
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'user-1' }]);
    await job.run();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    // 2. çalıştırma: deletedAt artık dolu olduğu için findMany boş döner (gerçek DB'de
    // where: { deletedAt: null } bu kullanıcıyı bir daha getirmez) → hiçbir yazma yok
    prismaMock.user.findMany.mockResolvedValueOnce([]);
    await job.run();

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1); // artmadı
  });
});
