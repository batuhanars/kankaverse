import { SESSION_DEAD_AFTER_DAYS, SessionSweepJob } from './session-sweep.job';

const DAY = 24 * 60 * 60 * 1000;

function setup(batches: { tokenFamily: string }[][]) {
  const groupBy = jest.fn();
  for (const b of batches) groupBy.mockResolvedValueOnce(b);
  groupBy.mockResolvedValue([]);
  const prisma = {
    session: { groupBy, updateMany: jest.fn().mockReturnValue('session-op') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const e2ee = {
    revokeOps: jest.fn().mockResolvedValue(['device-op']),
    announce: jest.fn().mockResolvedValue(undefined),
  };
  return { prisma, e2ee, job: new SessionSweepJob(prisma as never, e2ee as never) };
}

describe('C79 §2.3 — ölü oturum temizliği (R7)', () => {
  it('son yenilemesi 31 günden eski aileler bulunur: oturum + cihaz iptali AYNI transaction, ardından yayın', async () => {
    const { prisma, e2ee, job } = setup([[{ tokenFamily: 'fa' }, { tokenFamily: 'fb' }]]);
    const now = new Date('2026-11-26T04:00:00Z');

    await expect(job.sweep(now)).resolves.toBe(2);

    const q = prisma.session.groupBy.mock.calls[0][0];
    expect(q.where).toEqual({ revokedAt: null });
    expect(q.having.lastActiveAt._max.lt).toEqual(
      new Date(now.getTime() - SESSION_DEAD_AFTER_DAYS * DAY),
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { tokenFamily: { in: ['fa', 'fb'] }, revokedAt: null },
      data: { revokedAt: now },
    });
    expect(e2ee.revokeOps).toHaveBeenCalledWith({ families: ['fa', 'fb'] });
    expect(prisma.$transaction).toHaveBeenCalledWith(['session-op', 'device-op']);
    expect(e2ee.announce).toHaveBeenCalledWith({ families: ['fa', 'fb'] });
  });

  it('ölü aile yoksa hiçbir şey yazılmaz', async () => {
    const { prisma, e2ee, job } = setup([]);
    await expect(job.sweep(new Date())).resolves.toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(e2ee.revokeOps).not.toHaveBeenCalled();
  });

  it('dolu parti (200) gelirse bir sonraki parti de istenir', async () => {
    const full = Array.from({ length: 200 }, (_, i) => ({ tokenFamily: `f${i}` }));
    const { prisma, job } = setup([full, [{ tokenFamily: 'son' }]]);
    await expect(job.sweep(new Date())).resolves.toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
