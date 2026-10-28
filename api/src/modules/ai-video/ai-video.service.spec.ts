import { AiVideoStatus } from '@prisma/client';
import { AiVideoService } from './ai-video.service';
import { PikaError } from './pika.client';
import { sumSpentMicro } from './ai-video.mapper';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

function setup(rowOver: Record<string, unknown> = {}, spentRows: unknown[] = []) {
  const row = {
    id: 'g1',
    userId: 'u1',
    model: 'pika/pika-2.5/text-to-video',
    prompt: 'kedi',
    inputKey: null,
    resolution: '720p',
    durationS: 5,
    quoteMicroUsd: 200_000,
    costMicroUsd: null,
    providerJobId: null,
    status: AiVideoStatus.QUOTED,
    errorCode: null,
    outputKey: null,
    createdAt: new Date(),
    completedAt: null,
    ...rowOver,
  };
  const prisma = {
    aiVideoGeneration: {
      create: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue(spentRows),
      findFirst: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockImplementation(({ data }) => ({ ...row, ...data })),
    },
  };
  const storage = {
    headSize: jest.fn().mockResolvedValue(1000),
    getBuffer: jest.fn().mockResolvedValue(Buffer.from('img')),
    presignGet: jest.fn().mockResolvedValue('https://signed'),
    presignPut: jest.fn(),
  };
  const values: Record<string, unknown> = {
    'aiVideo.model': 'pika/pika-2.5',
    'aiVideo.resolution': '720p',
    'aiVideo.dailyCapUsd': 3,
  };
  const config = { get: (k: string) => values[k] };
  const pika = {
    quote: jest.fn().mockResolvedValue(200_000),
    submit: jest.fn().mockResolvedValue({ id: 'media_1', status: 'queued' }),
    createUpload: jest
      .fn()
      .mockResolvedValue({ uploadUrl: 'https://up', headers: {}, url: 'https://pika/img' }),
    putUpload: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AiVideoService(prisma as any, storage as any, config as any, pika as any);
  jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
  return { service, prisma, storage, pika };
}

describe('AiVideoService.quote', () => {
  it('metinden uretim: text-to-video teklifi, QUOTED satir', async () => {
    const { service, pika, prisma } = setup();
    const res = await service.quote('u1', 'kedi');
    expect(pika.quote).toHaveBeenCalledWith('pika/pika-2.5/text-to-video', {
      prompt: 'kedi',
      resolution: '720p',
      duration_s: 5,
    });
    expect(prisma.aiVideoGeneration.create).toHaveBeenCalled();
    expect(res).toEqual({ generationId: 'g1', quoteUsd: 0.2, todaySpentUsd: 0, dailyCapUsd: 3 });
  });

  it('baska kullanicinin inputKey degeri reddedilir, Pika cagrilmaz', async () => {
    const { service, pika } = setup();
    await expect(service.quote('u1', '', `ai-input/u2/${UUID}.png`)).rejects.toMatchObject({
      response: { error: 'INVALID_STORAGE_KEY' },
    });
    expect(pika.quote).not.toHaveBeenCalled();
  });

  it('yol atlatma ve bos istem reddedilir', async () => {
    const { service } = setup();
    await expect(service.quote('u1', '', `ai-input/u1/../x/${UUID}.png`)).rejects.toBeDefined();
    await expect(service.quote('u1', '')).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_PROMPT_REQUIRED' },
    });
  });

  it('gorselden uretim: image-to-video, prompt bos olabilir, kullanici gorseli teklife gitmez', async () => {
    const { service, pika } = setup();
    await service.quote('u1', '', `ai-input/u1/${UUID}.png`);
    const [apiId, body] = pika.quote.mock.calls[0];
    expect(apiId).toBe('pika/pika-2.5/image-to-video');
    expect(body.prompt).toBeUndefined();
    expect(body.image).toContain('example.com');
  });

  it('tavan asimi: AI_VIDEO_DAILY_CAP, satir acilmaz', async () => {
    const { service, prisma } = setup({}, [
      { status: AiVideoStatus.COMPLETED, costMicroUsd: 2_900_000, quoteMicroUsd: 200_000 },
    ]);
    await expect(service.quote('u1', 'kedi')).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_DAILY_CAP' },
    });
    expect(prisma.aiVideoGeneration.create).not.toHaveBeenCalled();
  });
});

describe('AiVideoService.submit', () => {
  it('teklif suresi (30 dk) dolmus: AI_VIDEO_QUOTE_EXPIRED', async () => {
    const { service, pika } = setup({ createdAt: new Date(Date.now() - 31 * 60_000) });
    await expect(service.submit('u1', 'g1')).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_QUOTE_EXPIRED' },
    });
    expect(pika.submit).not.toHaveBeenCalled();
  });

  it('QUOTED olmayan satir: 409', async () => {
    const { service } = setup({ status: AiVideoStatus.QUEUED });
    await expect(service.submit('u1', 'g1')).rejects.toMatchObject({ status: 409 });
  });

  it('gonderimde tavan yeniden denetlenir', async () => {
    const { service, pika } = setup({}, [
      { status: AiVideoStatus.RUNNING, costMicroUsd: null, quoteMicroUsd: 2_900_000 },
    ]);
    await expect(service.submit('u1', 'g1')).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_DAILY_CAP' },
    });
    expect(pika.submit).not.toHaveBeenCalled();
  });

  it('basari: Idempotency-Key satir id, providerJobId yazilir', async () => {
    const { service, pika, prisma } = setup();
    await service.submit('u1', 'g1');
    expect(pika.submit).toHaveBeenCalledWith(
      'pika/pika-2.5/text-to-video',
      { prompt: 'kedi', resolution: '720p', duration_s: 5 },
      'g1',
    );
    expect(prisma.aiVideoGeneration.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { providerJobId: 'media_1' },
    });
  });

  it('gorselli gonderim: ozel bucket okunur, Pika yuklemesinden donen adres image olur', async () => {
    const { service, pika, storage } = setup({
      model: 'pika/pika-2.5/image-to-video',
      inputKey: `ai-input/u1/${UUID}.png`,
    });
    await service.submit('u1', 'g1');
    expect(storage.getBuffer).toHaveBeenCalled();
    expect(pika.createUpload).toHaveBeenCalledWith('image/png', 3);
    expect(pika.submit.mock.calls[0][1].image).toBe('https://pika/img');
  });

  it.each([
    ['insufficient_balance', 'AI_VIDEO_INSUFFICIENT_BALANCE'],
    ['content_moderation', 'AI_VIDEO_CONTENT_REJECTED'],
    ['rate_limited', 'AI_VIDEO_PROVIDER_ERROR'],
  ])('Pika aninda reddederse (%s) satir FAILED + kod %s', async (pikaCode, ours) => {
    const { service, pika, prisma } = setup();
    pika.submit.mockResolvedValue({ id: 'media_9', status: 'failed', errorCode: pikaCode });
    await expect(service.submit('u1', 'g1')).rejects.toMatchObject({ response: { error: ours } });
    expect(prisma.aiVideoGeneration.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { status: AiVideoStatus.FAILED, errorCode: ours, providerJobId: 'media_9' },
    });
  });

  it('Pika ag hatasi: satir FAILED PROVIDER_ERROR', async () => {
    const { service, pika } = setup();
    pika.submit.mockRejectedValue(new Error('Pika 500'));
    await expect(service.submit('u1', 'g1')).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_PROVIDER_ERROR' },
    });
  });
});

describe('AiVideoService.submit yeniden deneme', () => {
  it('ilk cagri ag hatasi, ikincisi is doner: QUEUED + providerJobId, ayni anahtar', async () => {
    const { service, pika, prisma } = setup();
    pika.submit
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ id: 'media_2', status: 'queued' });
    await service.submit('u1', 'g1');
    expect(pika.submit).toHaveBeenCalledTimes(2);
    expect(pika.submit.mock.calls.map((c) => c[2])).toEqual(['g1', 'g1']);
    expect(prisma.aiVideoGeneration.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { providerJobId: 'media_2' },
    });
  });

  it('uc ag hatasi: FAILED PROVIDER_ERROR', async () => {
    const { service, pika, prisma } = setup();
    pika.submit.mockRejectedValue(new Error('timeout'));
    await expect(service.submit('u1', 'g1')).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_PROVIDER_ERROR' },
    });
    expect(pika.submit).toHaveBeenCalledTimes(3);
    expect(prisma.aiVideoGeneration.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { status: AiVideoStatus.FAILED, errorCode: 'AI_VIDEO_PROVIDER_ERROR' },
    });
  });

  it('5xx duz hata yeniden denenir', async () => {
    const { service, pika } = setup();
    pika.submit
      .mockRejectedValueOnce(new PikaError(502, 'Pika 502'))
      .mockResolvedValueOnce({ id: 'media_3', status: 'queued' });
    await service.submit('u1', 'g1');
    expect(pika.submit).toHaveBeenCalledTimes(2);
  });

  it('422 duz hata: tek cagri, FAILED', async () => {
    const { service, pika, prisma } = setup();
    pika.submit.mockRejectedValue(new PikaError(422, 'Pika 422'));
    await expect(service.submit('u1', 'g1')).rejects.toBeDefined();
    expect(pika.submit).toHaveBeenCalledTimes(1);
    expect(prisma.aiVideoGeneration.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { status: AiVideoStatus.FAILED, errorCode: 'AI_VIDEO_PROVIDER_ERROR' },
    });
  });
});

describe('AiVideoService.get / sumSpentMicro', () => {
  it('COMPLETED satir presigned videoUrl tasir, digerleri tasimaz', async () => {
    const done = setup({ status: AiVideoStatus.COMPLETED, outputKey: 'ai-video/u1/g1.mp4' });
    expect(await done.service.get('u1', 'g1')).toMatchObject({ videoUrl: 'https://signed' });
    const queued = setup({ status: AiVideoStatus.RUNNING });
    expect(await queued.service.get('u1', 'g1')).not.toHaveProperty('videoUrl');
  });

  it('harcama: kesin ucret onceliklidir; FAILED ve QUOTED sayilmaz', () => {
    expect(
      sumSpentMicro([
        { status: AiVideoStatus.COMPLETED, costMicroUsd: 190_000, quoteMicroUsd: 200_000 },
        { status: AiVideoStatus.COMPLETED, costMicroUsd: null, quoteMicroUsd: 200_000 },
        { status: AiVideoStatus.RUNNING, costMicroUsd: null, quoteMicroUsd: 200_000 },
        { status: AiVideoStatus.FAILED, costMicroUsd: null, quoteMicroUsd: 200_000 },
        { status: AiVideoStatus.QUOTED, costMicroUsd: null, quoteMicroUsd: 200_000 },
      ]),
    ).toBe(590_000);
  });
});
