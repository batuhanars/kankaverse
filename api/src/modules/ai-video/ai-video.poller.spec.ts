import { AiVideoStatus } from '@prisma/client';
import { AiVideoPoller } from './ai-video.poller';

function setup(rowOver: Record<string, unknown> = {}) {
  const row = {
    id: 'g1',
    userId: 'u1',
    status: AiVideoStatus.QUEUED,
    providerJobId: 'media_1',
    costMicroUsd: null,
    createdAt: new Date(),
    providerCompletedAt: null,
    ...rowOver,
  };
  const prisma = {
    aiVideoGeneration: {
      findMany: jest.fn().mockResolvedValue([row]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const storage = { putPrivate: jest.fn().mockResolvedValue(undefined) };
  const pika = { getJob: jest.fn(), downloadVideo: jest.fn() };
  const config = { get: () => true };
  const recovery = { maybeRecover: jest.fn().mockResolvedValue(undefined) };
  const poller = new AiVideoPoller(
    prisma as any,
    storage as any,
    pika as any,
    config as any,
    recovery as any,
  );
  return { poller, prisma, storage, pika, recovery };
}
const lastUpdate = (p: ReturnType<typeof setup>) =>
  p.prisma.aiVideoGeneration.update.mock.calls.at(-1)![0].data;

describe('AiVideoPoller durum esleme', () => {
  it('running -> RUNNING', async () => {
    const s = setup();
    s.pika.getJob.mockResolvedValue({ status: 'running', billing: null });
    await s.poller.tick();
    expect(lastUpdate(s)).toEqual({ status: AiVideoStatus.RUNNING });
  });

  it('queued ve satir zaten QUEUED: yazma yok', async () => {
    const s = setup();
    s.pika.getJob.mockResolvedValue({ status: 'queued', billing: null });
    await s.poller.tick();
    expect(s.prisma.aiVideoGeneration.update).not.toHaveBeenCalled();
  });

  it.each([
    ['content_moderation', 'AI_VIDEO_CONTENT_REJECTED'],
    ['insufficient_balance', 'AI_VIDEO_INSUFFICIENT_BALANCE'],
    ['provider_error', 'AI_VIDEO_PROVIDER_ERROR'],
  ])('failed + %s -> FAILED %s', async (code, ours) => {
    const s = setup();
    s.pika.getJob.mockResolvedValue({ status: 'failed', errorCode: code, billing: null });
    await s.poller.tick();
    expect(lastUpdate(s)).toMatchObject({ status: AiVideoStatus.FAILED, errorCode: ours });
  });

  it('completed + settled: MP4 ozel bucket anahtarina yazilir, maliyet kaydedilir', async () => {
    const s = setup({ status: AiVideoStatus.RUNNING });
    s.pika.getJob.mockResolvedValue({
      status: 'completed',
      outputUrl: 'https://cdn/x.mp4',
      billing: { state: 'settled', chargeMicroUsd: 200_000 },
    });
    s.pika.downloadVideo.mockResolvedValue(Buffer.from('mp4'));
    await s.poller.tick();
    expect(s.storage.putPrivate).toHaveBeenCalledWith(
      'ai-video/u1/g1.mp4',
      expect.any(Buffer),
      'video/mp4',
    );
    expect(lastUpdate(s)).toMatchObject({
      status: AiVideoStatus.COMPLETED,
      outputKey: 'ai-video/u1/g1.mp4',
      costMicroUsd: 200_000,
    });
  });

  it('completed + pending: maliyet yazilmaz; sonraki tur settled okur', async () => {
    const s = setup({ status: AiVideoStatus.RUNNING });
    s.pika.getJob.mockResolvedValue({
      status: 'completed',
      outputUrl: 'u',
      billing: { state: 'pending' },
    });
    s.pika.downloadVideo.mockResolvedValue(Buffer.from('mp4'));
    await s.poller.tick();
    expect(lastUpdate(s)).not.toHaveProperty('costMicroUsd');

    const t = setup({ status: AiVideoStatus.COMPLETED });
    t.pika.getJob.mockResolvedValue({
      status: 'completed',
      billing: { state: 'settled', chargeMicroUsd: 190_000 },
    });
    await t.poller.tick();
    expect(lastUpdate(t)).toEqual({ costMicroUsd: 190_000 });
  });

  it('indirme basarisiz: FAILED degil, RUNNING + DOWNLOAD_PENDING, maliyet yazilir, aralik artar', async () => {
    const s = setup({ status: AiVideoStatus.RUNNING });
    s.pika.getJob.mockResolvedValue({
      status: 'completed',
      outputUrl: 'u',
      billing: { state: 'settled', chargeMicroUsd: 200_000 },
    });
    s.pika.downloadVideo.mockRejectedValue(new Error('net'));
    const t0 = Date.now();
    await s.poller.tick(t0);
    expect(lastUpdate(s)).toMatchObject({
      status: AiVideoStatus.RUNNING,
      errorCode: 'AI_VIDEO_DOWNLOAD_PENDING',
      costMicroUsd: 200_000,
    });
    expect(lastUpdate(s).providerCompletedAt).toBeInstanceOf(Date);
    const pending = {
      id: 'g1',
      userId: 'u1',
      status: AiVideoStatus.RUNNING,
      providerJobId: 'media_1',
      costMicroUsd: 200_000,
      createdAt: new Date(t0),
      providerCompletedAt: new Date(t0),
    };
    (s.prisma.aiVideoGeneration.findMany as jest.Mock).mockResolvedValue([pending]);
    s.pika.getJob.mockClear();
    await s.poller.tick(t0 + 30_000);
    expect(s.pika.getJob).not.toHaveBeenCalled();
    s.pika.downloadVideo.mockResolvedValue(Buffer.from('mp4'));
    await s.poller.tick(t0 + 61_000);
    expect(lastUpdate(s)).toMatchObject({ status: AiVideoStatus.COMPLETED, errorCode: null });
  });

  it('indirme asamasinda is zaman asimi islemez; completed + 24 saat: DOWNLOAD_FAILED', async () => {
    const t0 = Date.now();
    const s = setup({
      status: AiVideoStatus.RUNNING,
      createdAt: new Date(t0 - 3 * 3600_000),
      providerCompletedAt: new Date(t0 - 3 * 3600_000),
    });
    s.pika.getJob.mockResolvedValue({ status: 'completed', outputUrl: 'u', billing: null });
    s.pika.downloadVideo.mockRejectedValue(new Error('net'));
    await s.poller.tick(t0);
    expect(lastUpdate(s)).toMatchObject({ errorCode: 'AI_VIDEO_DOWNLOAD_PENDING' });

    const f = setup({
      status: AiVideoStatus.RUNNING,
      providerCompletedAt: new Date(t0 - 24 * 3600_000 - 1),
    });
    await f.poller.tick(t0);
    expect(lastUpdate(f)).toMatchObject({
      status: AiVideoStatus.FAILED,
      errorCode: 'AI_VIDEO_DOWNLOAD_FAILED',
    });
  });

  it('60 dakikayi gecen is (createdAt): FAILED AI_VIDEO_TIMEOUT; 59 dk hala yoklanir', async () => {
    const t0 = Date.now();
    const ok = setup({ createdAt: new Date(t0 - 59 * 60_000) });
    ok.pika.getJob.mockResolvedValue({ status: 'running', billing: null });
    await ok.poller.tick(t0);
    expect(ok.pika.getJob).toHaveBeenCalled();
    const s = setup({ createdAt: new Date(t0 - 60 * 60_000 - 1) });
    await s.poller.tick(t0);
    expect(s.recovery.maybeRecover).toHaveBeenCalledWith(t0);
    expect(lastUpdate(s)).toMatchObject({
      status: AiVideoStatus.FAILED,
      errorCode: 'AI_VIDEO_TIMEOUT',
    });
  });
});
