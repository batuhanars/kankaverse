import { AiVideoStatus } from '@prisma/client';
import { AiVideoRecoveryService } from './ai-video-recovery.service';

function setup(jobs: Record<string, unknown>) {
  const rows = Object.keys(jobs).map((id) => ({ id, providerJobId: `m_${id}` }));
  const prisma = {
    aiVideoGeneration: {
      findMany: jest.fn().mockResolvedValue(rows),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const pika = {
    getJob: jest.fn().mockImplementation((j: string) => {
      const v = jobs[j.slice(2)];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
    }),
  };
  return { s: new AiVideoRecoveryService(prisma as any, pika as any), prisma };
}

describe('AiVideoRecoveryService', () => {
  it('completed olan FAILED satir RUNNING+DOWNLOAD_PENDING olur, maliyet yazilir; digerleri dokunulmaz', async () => {
    const { s, prisma } = setup({
      a: { status: 'completed', billing: { state: 'settled', chargeMicroUsd: 200_000 } },
      b: { status: 'failed' },
      c: new Error('ag'),
    });
    await expect(s.recover(1000)).resolves.toBe(1);
    const q = prisma.aiVideoGeneration.findMany.mock.calls[0][0].where;
    expect(q).toMatchObject({
      status: AiVideoStatus.FAILED,
      errorCode: { in: ['AI_VIDEO_PROVIDER_ERROR', 'AI_VIDEO_TIMEOUT'] },
      outputKey: null,
    });
    expect(prisma.aiVideoGeneration.update).toHaveBeenCalledTimes(1);
    expect(prisma.aiVideoGeneration.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'a' },
      data: {
        status: AiVideoStatus.RUNNING,
        errorCode: 'AI_VIDEO_DOWNLOAD_PENDING',
        costMicroUsd: 200_000,
      },
    });
  });

  it('TIMEOUT adayi sorguda; Pika completed ise kurtarilir (aday seti TIMEOUT satirini kapsar)', async () => {
    const { s, prisma } = setup({ t: { status: 'completed', billing: null } });
    await s.recover(1000);
    expect(prisma.aiVideoGeneration.update.mock.calls[0][0].data).toMatchObject({
      status: AiVideoStatus.RUNNING,
      errorCode: 'AI_VIDEO_DOWNLOAD_PENDING',
    });
  });

  it('maybeRecover: ilk cagri calisir, saat dolmadan calismaz, saat dolunca tekrar', async () => {
    const { s, prisma } = setup({});
    await s.maybeRecover(1_000);
    await s.maybeRecover(1_000 + 59 * 60_000);
    expect(prisma.aiVideoGeneration.findMany).toHaveBeenCalledTimes(1);
    await s.maybeRecover(1_000 + 60 * 60_000);
    expect(prisma.aiVideoGeneration.findMany).toHaveBeenCalledTimes(2);
  });

  it('maybeRecover hatayi yutar (yoklayici turu dusmez)', async () => {
    const { s, prisma } = setup({});
    prisma.aiVideoGeneration.findMany.mockRejectedValue(new Error('db'));
    await expect(s.maybeRecover(5)).resolves.toBeUndefined();
  });
});
