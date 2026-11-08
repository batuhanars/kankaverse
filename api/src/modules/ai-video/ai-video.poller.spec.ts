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
    prompt: 'kedi  dans\n eder',
    deletedAt: null,
    ...rowOver,
  };
  const prisma = {
    aiVideoGeneration: {
      findMany: jest.fn().mockResolvedValue([row]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ deletedAt: null }),
    },
  };
  const storage = { putPrivate: jest.fn().mockResolvedValue(undefined) };
  const pika = { getJob: jest.fn(), downloadVideo: jest.fn(), discardPartial: jest.fn() };
  const config = { get: () => true };
  const recovery = { maybeRecover: jest.fn().mockResolvedValue(undefined) };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const poller = new AiVideoPoller(
    prisma as any,
    storage as any,
    pika as any,
    config as any,
    recovery as any,
    notifications as any,
  );
  return { poller, prisma, storage, pika, recovery, notifications };
}
/** Son yazma: `update` ve `updateMany` çağrılarından çağrı sırasına göre sonuncusu. */
const lastUpdate = (p: ReturnType<typeof setup>) => {
  const { update, updateMany } = p.prisma.aiVideoGeneration;
  const all = [
    ...update.mock.calls.map((c: any, i: number) => [
      update.mock.invocationCallOrder[i],
      c[0].data,
    ]),
    ...updateMany.mock.calls.map((c: any, i: number) => [
      updateMany.mock.invocationCallOrder[i],
      c[0].data,
    ]),
  ].sort((a: any, b: any) => a[0] - b[0]);
  return all.at(-1)![1];
};

describe('AiVideoPoller durum esleme', () => {
  it('running -> RUNNING', async () => {
    const s = setup();
    s.pika.getJob.mockResolvedValue({ status: 'running', billing: null });
    await s.poller.tick();
    await s.poller.whenIdle();
    expect(lastUpdate(s)).toEqual({ status: AiVideoStatus.RUNNING });
  });

  it('queued ve satir zaten QUEUED: yazma yok', async () => {
    const s = setup();
    s.pika.getJob.mockResolvedValue({ status: 'queued', billing: null });
    await s.poller.tick();
    await s.poller.whenIdle();
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
    await s.poller.whenIdle();
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
    await s.poller.whenIdle();
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
    await s.poller.whenIdle();
    expect(lastUpdate(s)).not.toHaveProperty('costMicroUsd');

    const t = setup({ status: AiVideoStatus.COMPLETED });
    t.pika.getJob.mockResolvedValue({
      status: 'completed',
      billing: { state: 'settled', chargeMicroUsd: 190_000 },
    });
    await t.poller.tick();
    await t.poller.whenIdle();
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
    await s.poller.whenIdle();
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
    await s.poller.whenIdle();
    expect(s.pika.getJob).not.toHaveBeenCalled();
    s.pika.downloadVideo.mockResolvedValue(Buffer.from('mp4'));
    await s.poller.tick(t0 + 61_000);
    await s.poller.whenIdle();
    expect(lastUpdate(s)).toMatchObject({ status: AiVideoStatus.COMPLETED, errorCode: null });
  });

  it('C14e: indirme uretim kimligiyle anahtarlanir; basari ve vazgecmede kismi tampon atilir', async () => {
    const t0 = Date.now();
    const s = setup({ status: AiVideoStatus.RUNNING });
    s.pika.getJob.mockResolvedValue({ status: 'completed', outputUrl: 'u', billing: null });
    s.pika.downloadVideo.mockResolvedValue(Buffer.from('mp4'));
    await s.poller.tick(t0);
    await s.poller.whenIdle();
    expect(s.pika.downloadVideo).toHaveBeenCalledWith(
      'u',
      expect.any(Number),
      undefined,
      undefined,
      'g1',
    );
    expect(s.pika.discardPartial).toHaveBeenCalledWith('g1');

    const f = setup({
      status: AiVideoStatus.RUNNING,
      providerCompletedAt: new Date(t0 - 24 * 3600_000 - 1),
    });
    await f.poller.tick(t0);
    await f.poller.whenIdle();
    expect(f.pika.discardPartial).toHaveBeenCalledWith('g1');
  });

  describe('C14e arka plan indirme', () => {
    const done = { status: 'completed', outputUrl: 'u', billing: null };
    const hang = () => {
      let release!: (b: Buffer) => void;
      const p = new Promise<Buffer>((r) => (release = r));
      return { p, release };
    };

    it('tur indirme sürerken doner; ikinci tur ayni id icin ikinci indirme baslatmaz', async () => {
      const s = setup({ status: AiVideoStatus.RUNNING });
      s.pika.getJob.mockResolvedValue(done);
      const h = hang();
      s.pika.downloadVideo.mockReturnValue(h.p);
      await s.poller.tick();
      await s.poller.tick();
      expect(s.pika.downloadVideo).toHaveBeenCalledTimes(1);
      expect(s.pika.getJob).toHaveBeenCalledTimes(1);
      expect(s.prisma.aiVideoGeneration.update).not.toHaveBeenCalled();
      h.release(Buffer.from('mp4'));
      await s.poller.whenIdle();
      expect(lastUpdate(s)).toMatchObject({ status: AiVideoStatus.COMPLETED });
    });

    it('indirme sirasinda silinen satir yuklenmez ve COMPLETED olmaz', async () => {
      const s = setup({ status: AiVideoStatus.RUNNING });
      s.pika.getJob.mockResolvedValue(done);
      const h = hang();
      s.pika.downloadVideo.mockReturnValue(h.p);
      await s.poller.tick();
      s.prisma.aiVideoGeneration.findUnique.mockResolvedValue({ deletedAt: new Date() });
      h.release(Buffer.from('mp4'));
      await s.poller.whenIdle();
      expect(s.storage.putPrivate).not.toHaveBeenCalled();
      expect(s.prisma.aiVideoGeneration.update).not.toHaveBeenCalled();
      expect(s.pika.discardPartial).toHaveBeenCalledWith('g1');
    });

    it('satir hic yoksa da yuklenmez; is bitince inFlight temizlenir', async () => {
      const s = setup({ status: AiVideoStatus.RUNNING });
      s.pika.getJob.mockResolvedValue(done);
      s.pika.downloadVideo.mockResolvedValue(Buffer.from('mp4'));
      s.prisma.aiVideoGeneration.findUnique.mockResolvedValue(null);
      await s.poller.tick();
      await s.poller.whenIdle();
      expect(s.storage.putPrivate).not.toHaveBeenCalled();
      await s.poller.tick();
      await s.poller.whenIdle();
      expect(s.pika.downloadVideo).toHaveBeenCalledTimes(2);
    });
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
    await s.poller.whenIdle();
    expect(lastUpdate(s)).toMatchObject({ errorCode: 'AI_VIDEO_DOWNLOAD_PENDING' });

    const f = setup({
      status: AiVideoStatus.RUNNING,
      providerCompletedAt: new Date(t0 - 24 * 3600_000 - 1),
    });
    await f.poller.tick(t0);
    await f.poller.whenIdle();
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
    await ok.poller.whenIdle();
    expect(ok.pika.getJob).toHaveBeenCalled();
    const s = setup({ createdAt: new Date(t0 - 60 * 60_000 - 1) });
    await s.poller.tick(t0);
    await s.poller.whenIdle();
    expect(s.recovery.maybeRecover).toHaveBeenCalledWith(t0);
    expect(lastUpdate(s)).toMatchObject({
      status: AiVideoStatus.FAILED,
      errorCode: 'AI_VIDEO_TIMEOUT',
    });
  });
});

describe('AiVideoPoller C49 bildirim', () => {
  const done = {
    status: 'completed',
    outputUrl: 'u',
    billing: { state: 'settled', chargeMicroUsd: 1 },
  };

  it('basari: AI_VIDEO_READY bir kez, onizleme sadelesir', async () => {
    const s = setup({ status: AiVideoStatus.RUNNING });
    s.pika.getJob.mockResolvedValue(done);
    s.pika.downloadVideo.mockResolvedValue(Buffer.from('mp4'));
    await s.poller.tick();
    await s.poller.whenIdle();
    expect(s.notifications.create).toHaveBeenCalledTimes(1);
    expect(s.notifications.create).toHaveBeenCalledWith('u1', {
      type: 'AI_VIDEO_READY',
      aiVideoId: 'g1',
      preview: 'kedi dans eder',
    });
  });

  it('kurtarilmis satir (RUNNING + DOWNLOAD_PENDING) tamamlaninca READY', async () => {
    const s = setup({
      status: AiVideoStatus.RUNNING,
      errorCode: 'AI_VIDEO_DOWNLOAD_PENDING',
      providerCompletedAt: new Date(),
    });
    s.pika.getJob.mockResolvedValue(done);
    s.pika.downloadVideo.mockResolvedValue(Buffer.from('mp4'));
    await s.poller.tick();
    await s.poller.whenIdle();
    expect(s.notifications.create.mock.calls[0][1].type).toBe('AI_VIDEO_READY');
  });

  it('gecis baska yerde olmus (count 0): bildirim yok', async () => {
    const s = setup({ status: AiVideoStatus.RUNNING });
    s.prisma.aiVideoGeneration.updateMany.mockResolvedValue({ count: 0 });
    s.pika.getJob.mockResolvedValue(done);
    s.pika.downloadVideo.mockResolvedValue(Buffer.from('mp4'));
    await s.poller.tick();
    await s.poller.whenIdle();
    expect(s.notifications.create).not.toHaveBeenCalled();
  });

  it('indirme basarisiz (DOWNLOAD_PENDING): bildirim yok', async () => {
    const s = setup({ status: AiVideoStatus.RUNNING });
    s.pika.getJob.mockResolvedValue(done);
    s.pika.downloadVideo.mockRejectedValue(new Error('net'));
    await s.poller.tick();
    await s.poller.whenIdle();
    expect(s.notifications.create).not.toHaveBeenCalled();
  });

  it('fail: AI_VIDEO_FAILED bir kez', async () => {
    const s = setup();
    s.pika.getJob.mockResolvedValue({
      status: 'failed',
      errorCode: 'provider_error',
      billing: null,
    });
    await s.poller.tick();
    await s.poller.whenIdle();
    expect(s.notifications.create).toHaveBeenCalledTimes(1);
    expect(s.notifications.create.mock.calls[0][1]).toMatchObject({
      type: 'AI_VIDEO_FAILED',
      aiVideoId: 'g1',
    });
  });

  it('bos istem: preview alani yok', async () => {
    const s = setup({ prompt: '   ' });
    s.pika.getJob.mockResolvedValue({
      status: 'failed',
      errorCode: 'provider_error',
      billing: null,
    });
    await s.poller.tick();
    expect(s.notifications.create.mock.calls[0][1]).not.toHaveProperty('preview');
  });

  it('uzun istem 120 karakterde ... ile kesilir', async () => {
    const s = setup({ prompt: 'a'.repeat(300) });
    s.pika.getJob.mockResolvedValue({
      status: 'failed',
      errorCode: 'provider_error',
      billing: null,
    });
    await s.poller.tick();
    const preview = s.notifications.create.mock.calls[0][1].preview as string;
    expect(preview).toHaveLength(120);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('silinmis satir (satirda ya da canli sorguda): bildirim yok', async () => {
    const a = setup({ deletedAt: new Date() });
    a.pika.getJob.mockResolvedValue({
      status: 'failed',
      errorCode: 'provider_error',
      billing: null,
    });
    await a.poller.tick();
    expect(a.notifications.create).not.toHaveBeenCalled();

    const b = setup();
    b.prisma.aiVideoGeneration.findUnique.mockResolvedValue({ deletedAt: new Date() });
    b.pika.getJob.mockResolvedValue({
      status: 'failed',
      errorCode: 'provider_error',
      billing: null,
    });
    await b.poller.tick();
    expect(b.notifications.create).not.toHaveBeenCalled();
  });

  it('bildirim hatasi poller i dusurmez, satir yine terminal yazilir', async () => {
    const s = setup();
    s.notifications.create.mockRejectedValue(new Error('push patladi'));
    s.pika.getJob.mockResolvedValue({
      status: 'failed',
      errorCode: 'provider_error',
      billing: null,
    });
    await expect(s.poller.tick()).resolves.toBeUndefined();
    expect(lastUpdate(s)).toMatchObject({ status: AiVideoStatus.FAILED });
  });
});
