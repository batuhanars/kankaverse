import { E2eeRevocationService, revokeUserDevicesInTx } from './e2ee-revocation.service';

function setup() {
  const prisma = {
    session: { findUnique: jest.fn() },
    e2eeDevice: { updateMany: jest.fn().mockReturnValue('UPD'), findMany: jest.fn() },
    e2eeKeyPackage: { deleteMany: jest.fn().mockReturnValue('DEL') },
  };
  const notify = { devicesChanged: jest.fn().mockResolvedValue(undefined) };
  return { prisma, notify, svc: new E2eeRevocationService(prisma as never, notify as never) };
}

describe('E2eeRevocationService (§2.6, R7)', () => {
  it('families kapsamı: önce KeyPackage silme sonra cihaz revokedAt (revokedAt:null koşullu)', async () => {
    const { prisma, svc } = setup();
    const ops = await svc.revokeOps({ families: ['f1', 'f2'] });
    expect(ops).toEqual(['DEL', 'UPD']);
    expect(prisma.e2eeKeyPackage.deleteMany).toHaveBeenCalledWith({
      where: { device: { tokenFamily: { in: ['f1', 'f2'] } } },
    });
    const upd = prisma.e2eeDevice.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ tokenFamily: { in: ['f1', 'f2'] }, revokedAt: null });
    expect(upd.data.revokedAt).toBeInstanceOf(Date);
  });

  it('sessionId kapsamı oturumun zincirine çevrilir', async () => {
    const { prisma, svc } = setup();
    prisma.session.findUnique.mockResolvedValue({ tokenFamily: 'fam-x' });
    await svc.revokeOps({ sessionId: 's1' });
    expect(prisma.e2eeDevice.updateMany.mock.calls[0][0].where.tokenFamily).toEqual({
      in: ['fam-x'],
    });
  });

  it('bilinmeyen oturum → hiçbir cihaz eşleşmez (boş in listesi)', async () => {
    const { prisma, svc } = setup();
    prisma.session.findUnique.mockResolvedValue(null);
    await svc.revokeOps({ sessionId: 'yok' });
    expect(prisma.e2eeDevice.updateMany.mock.calls[0][0].where.tokenFamily).toEqual({ in: [] });
  });

  it('userId + exceptSessionId: kullanıcının tüm zincirleri, mevcut oturumun zinciri HARİÇ', async () => {
    const { prisma, svc } = setup();
    prisma.session.findUnique.mockResolvedValue({ tokenFamily: 'keep' });
    await svc.revokeOps({ userId: 'u1', exceptSessionId: 's-now' });
    expect(prisma.e2eeDevice.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      tokenFamily: { not: 'keep' },
      revokedAt: null,
    });
  });

  it('userId kapsamı (istisnasız: parola sıfırlama, hesap silme): kullanıcının hepsi', async () => {
    const { prisma, svc } = setup();
    await svc.revokeOps({ userId: 'u1' });
    expect(prisma.e2eeDevice.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      revokedAt: null,
    });
  });

  it('announce: etkilenen her kullanıcı için devices-changed; hata çağıranı bozmaz', async () => {
    const { prisma, notify, svc } = setup();
    prisma.e2eeDevice.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    await svc.announce({ families: ['f1'] });
    expect(notify.devicesChanged).toHaveBeenCalledWith('u1');
    expect(notify.devicesChanged).toHaveBeenCalledWith('u2');

    prisma.e2eeDevice.findMany.mockRejectedValue(new Error('db'));
    await expect(svc.announce({ families: ['f1'] })).resolves.toBeUndefined();
  });

  it('revokeUserDevicesInTx (temizlik işi): etkileşimli transaction istemcisinde paket sil + cihaz iptal', async () => {
    const tx = {
      e2eeKeyPackage: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      e2eeDevice: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    await revokeUserDevicesInTx(tx as never, 'u1');
    expect(tx.e2eeKeyPackage.deleteMany).toHaveBeenCalledWith({
      where: { device: { userId: 'u1' } },
    });
    expect(tx.e2eeDevice.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      revokedAt: null,
    });
  });
});
