import { E2eeMembershipService } from './e2ee-membership.service';

/** E2 §2.2/§2.4 — grup üyeliği değişiminin E2EE tarafı. */
function setup(opts: { group?: boolean; eligible?: boolean } = {}) {
  const { group = true, eligible = true } = opts;
  const prisma = {
    e2eeGroup: { findUnique: jest.fn().mockResolvedValue(group ? { channelId: 'g1' } : null) },
    e2eeDevice: { findMany: jest.fn().mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]) },
    e2eeFormerMember: {
      deleteMany: jest.fn().mockReturnValue('deleteFormer'),
      upsert: jest.fn().mockReturnValue('upsertFormer'),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    e2eeWelcome: { deleteMany: jest.fn().mockReturnValue('deleteWelcomes') },
  };
  const calls: string[] = [];
  const flag = { isEligible: jest.fn().mockReturnValue(eligible) };
  const notify = {
    deviceChangedInChannel: jest.fn(() => calls.push('devices-changed')),
  };
  const realtime = {
    removeUserFromRoom: jest.fn(() => calls.push('leave-room')),
  };
  const svc = new E2eeMembershipService(
    prisma as never,
    flag as never,
    notify as never,
    realtime as never,
  );
  return { prisma, flag, notify, realtime, svc, calls };
}

describe('E2eeMembershipService.assertMemberAddable (§2.2)', () => {
  it('şifreli grup + uygun olmayan hedef → 422 E2EE_MEMBER_NOT_ELIGIBLE', async () => {
    const { svc } = setup({ group: true, eligible: false });
    await expect(svc.assertMemberAddable('g1', 'u9')).rejects.toMatchObject({
      status: 422,
      response: { error: 'E2EE_MEMBER_NOT_ELIGIBLE' },
    });
  });

  it('şifreli grup + uygun ama cihazsız hedef → eklenir (cihaz sorgusu hiç yapılmaz)', async () => {
    const { svc, prisma } = setup({ group: true, eligible: true });
    await expect(svc.assertMemberAddable('g1', 'u9')).resolves.toBeUndefined();
    expect(prisma.e2eeDevice.findMany).not.toHaveBeenCalled();
  });

  it('şifresiz grup → uygunluğa bakılmaz (düz grup herkese açık kalır)', async () => {
    const { svc, flag } = setup({ group: false, eligible: false });
    await expect(svc.assertMemberAddable('g1', 'u9')).resolves.toBeUndefined();
    expect(flag.isEligible).not.toHaveBeenCalled();
  });
});

describe('E2eeMembershipService.addOps / afterAdd (§2.1, §2.4)', () => {
  it('yeniden eklenen üyenin eski-üye kaydı silinir', () => {
    const { svc, prisma } = setup();
    expect(svc.addOps('g1', 'u3')).toEqual(['deleteFormer']);
    expect(prisma.e2eeFormerMember.deleteMany).toHaveBeenCalledWith({
      where: { channelId: 'g1', userId: 'u3' },
    });
  });

  it('commit sonrası: grup varsa kanal odasına e2ee:devices-changed (hedef kullanıcıyla)', async () => {
    const { svc, notify } = setup({ group: true });
    await svc.afterAdd('g1', 'u3');
    expect(notify.deviceChangedInChannel).toHaveBeenCalledWith('g1', 'u3');
  });

  it('grup yoksa olay yok', async () => {
    const { svc, notify } = setup({ group: false });
    await svc.afterAdd('g1', 'u3');
    expect(notify.deviceChangedInChannel).not.toHaveBeenCalled();
  });
});

describe('E2eeMembershipService.departureOps (§2.1, §2.4)', () => {
  it('grup varsa: eski-üye upsert (leftAt güncellenir) + kullanıcının cihazlarına BEKLEYEN Welcome silme', async () => {
    const { svc, prisma } = setup({ group: true });
    const ops = await svc.departureOps('g1', 'u2');

    expect(ops).toEqual(['upsertFormer', 'deleteWelcomes']);
    expect(prisma.e2eeFormerMember.upsert).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: 'g1', userId: 'u2' } },
      create: { channelId: 'g1', userId: 'u2' },
      update: { leftAt: expect.any(Date) },
    });
    expect(prisma.e2eeDevice.findMany).toHaveBeenCalledWith({
      where: { userId: 'u2' },
      select: { id: true },
    });
    expect(prisma.e2eeWelcome.deleteMany).toHaveBeenCalledWith({
      where: { channelId: 'g1', deliveredAt: null, targetDeviceId: { in: ['d1', 'd2'] } },
    });
  });

  it('şifreli grup yoksa hiçbir E2EE satırına dokunulmaz', async () => {
    const { svc, prisma } = setup({ group: false });
    await expect(svc.departureOps('g1', 'u2')).resolves.toEqual([]);
    expect(prisma.e2eeFormerMember.upsert).not.toHaveBeenCalled();
    expect(prisma.e2eeWelcome.deleteMany).not.toHaveBeenCalled();
  });
});

describe('E2eeMembershipService.afterDeparture (§2.4 soket odası)', () => {
  it('🔴 soket ODADAN ÇIKARILIR ve bu, e2ee:devices-changed yayınından ÖNCE olur (çıkan olayı da almasın)', async () => {
    const { svc, realtime, notify, calls } = setup({ group: true });
    await svc.afterDeparture('g1', 'u2', false);

    expect(realtime.removeUserFromRoom).toHaveBeenCalledWith('u2', 'g1');
    expect(notify.deviceChangedInChannel).toHaveBeenCalledWith('g1', 'u2');
    expect(calls).toEqual(['leave-room', 'devices-changed']);
  });

  it('şifresiz grupta da soket odadan çıkarılır, olay yok', async () => {
    const { svc, realtime, notify } = setup({ group: false });
    await svc.afterDeparture('g1', 'u2', false);
    expect(realtime.removeUserFromRoom).toHaveBeenCalledWith('u2', 'g1');
    expect(notify.deviceChangedInChannel).not.toHaveBeenCalled();
  });

  it('kanal silindiyse (kalan < 2) olay yok ve E2EE satırlarına dokunulmaz; soket yine çıkar', async () => {
    const { svc, realtime, notify, prisma } = setup({ group: true });
    await svc.afterDeparture('g1', 'u2', true);
    expect(realtime.removeUserFromRoom).toHaveBeenCalled();
    expect(notify.deviceChangedInChannel).not.toHaveBeenCalled();
    expect(prisma.e2eeFormerMember.createMany).not.toHaveBeenCalled();
  });

  it('yarış güvencesi: tx sırasında grup yoktu, sonradan kurulduysa eski-üye kaydı tamamlanır (kopya yazmaz)', async () => {
    const { svc, prisma } = setup({ group: true });
    await svc.afterDeparture('g1', 'u2', false);
    expect(prisma.e2eeFormerMember.createMany).toHaveBeenCalledWith({
      data: [{ channelId: 'g1', userId: 'u2' }],
      skipDuplicates: true,
    });
  });

  it('oda çıkarma hata verse de yayın devam eder; hiçbiri çağırana fırlatmaz', async () => {
    const { svc, realtime, notify } = setup({ group: true });
    realtime.removeUserFromRoom.mockImplementation(() => {
      throw new Error('redis');
    });
    await expect(svc.afterDeparture('g1', 'u2', false)).resolves.toBeUndefined();
    expect(notify.deviceChangedInChannel).toHaveBeenCalled();
  });
});
