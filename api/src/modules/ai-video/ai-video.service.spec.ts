import { AiVideoStatus } from '@prisma/client';
import { AiVideoService } from './ai-video.service';
import { AiVideoInputService } from './ai-video-input.service';
import { PikaError } from './pika.client';
import { sumSpentMicro, toCredits } from './ai-video.mapper';

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
    aspectRatio: null,
    quoteMicroUsd: 200_000,
    costMicroUsd: null,
    providerJobId: null,
    status: AiVideoStatus.QUEUED,
    errorCode: null,
    outputKey: null,
    createdAt: new Date(),
    completedAt: null,
    ...rowOver,
  };
  const prisma = {
    aiVideoGrant: { findUnique: jest.fn().mockResolvedValue(null) },
    aiVideoGeneration: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ ...row, ...data, inputKey: data.inputKey ?? null })),
      findMany: jest.fn().mockResolvedValue(spentRows),
      findFirst: jest.fn().mockResolvedValue(row),
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
    'aiVideo.models': ['pika-2.5', 'wan-3.0', 'kling-3.0-turbo'],
    'aiVideo.dailyCapUsd': 3,
    'aiVideo.userIds': ['u1'],
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
  const input = new AiVideoInputService(storage as any, pika as any);
  const service = new AiVideoService(
    prisma as any,
    storage as any,
    config as any,
    pika as any,
    input,
  );
  jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
  return { service, prisma, storage, pika, values };
}

const dto = (over: Record<string, unknown> = {}) => ({
  model: 'pika-2.5',
  resolution: '720p',
  durationS: 5,
  prompt: 'kedi',
  ...over,
});

describe('AiVideoService.create (teklif + tavan + gonderim)', () => {
  it('metinden uretim: text-to-video teklifi, tek cagrida QUEUED satir + gonderim', async () => {
    const { service, pika, prisma } = setup();
    await service.create('u1', dto());
    expect(pika.quote).toHaveBeenCalledWith('pika/pika-2.5/text-to-video', {
      prompt: 'kedi',
      resolution: '720p',
      duration_s: 5,
    });
    expect(prisma.aiVideoGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        model: 'pika/pika-2.5/text-to-video',
        status: AiVideoStatus.QUEUED,
        durationS: 5,
        resolution: '720p',
        quoteMicroUsd: 200_000,
      }),
    });
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

  it.each([
    ['pika-2.5', 'pika/pika-2.5/text-to-video', 10, '480p', { duration_s: 10 }, 'image'],
    [
      'wan-3.0',
      'alibaba/wan3.0-video/text-to-video',
      10,
      '480p',
      { duration: 10, watermark: false },
      'first_frame_url',
    ],
    [
      'kling-3.0-turbo',
      'kling/kling-3.0-turbo/text-to-video',
      15,
      '720p',
      { duration: 15 },
      'image_url',
    ],
  ])(
    '%s: govde alan adlari tablodan (metin + gorsel)',
    async (key, apiId, d, res, extra, imgField) => {
      const text = setup();
      await text.service.create('u1', dto({ model: key, durationS: d, resolution: res }));
      expect(text.pika.submit.mock.calls[0][0]).toBe(apiId);
      expect(text.pika.submit.mock.calls[0][1]).toEqual({
        prompt: 'kedi',
        resolution: res,
        ...extra,
      });

      const inputKey = `ai-input/u1/${UUID}.png`;
      const img = setup({ inputKey });
      await img.service.create(
        'u1',
        dto({ model: key, durationS: d, resolution: res, prompt: '', inputKey }),
      );
      expect(img.pika.submit.mock.calls[0][0]).toBe(
        apiId.replace('text-to-video', 'image-to-video'),
      );
      const body = img.pika.submit.mock.calls[0][1];
      expect(body[imgField]).toBe('https://pika/img');
      expect(body.prompt).toBeUndefined();
      expect(img.pika.quote.mock.calls[0][1][imgField]).toContain('example.com');
    },
  );

  it.each([
    ['bilinmeyen model', { model: 'sora' }],
    ['modelde olmayan sure', { model: 'kling-3.0-turbo', durationS: 7 }],
    ['modelde olmayan cozunurluk', { model: 'kling-3.0-turbo', resolution: '480p' }],
    ['1080p yok', { resolution: '1080p' }],
  ])('gecersiz secenek (%s): 400 AI_VIDEO_INVALID_OPTION, Pika cagrilmaz', async (_n, over) => {
    const { service, pika, prisma } = setup();
    await expect(service.create('u1', dto(over))).rejects.toMatchObject({
      status: 400,
      response: { error: 'AI_VIDEO_INVALID_OPTION' },
    });
    expect(pika.quote).not.toHaveBeenCalled();
    expect(prisma.aiVideoGeneration.create).not.toHaveBeenCalled();
  });

  it('env ile kapali model secilemez', async () => {
    const { service, values } = setup();
    values['aiVideo.models'] = ['pika-2.5'];
    await expect(service.create('u1', dto({ model: 'wan-3.0' }))).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_INVALID_OPTION' },
    });
  });

  it('baska kullanicinin inputKey degeri reddedilir, Pika cagrilmaz', async () => {
    const { service, pika } = setup();
    await expect(
      service.create('u1', dto({ prompt: '', inputKey: `ai-input/u2/${UUID}.png` })),
    ).rejects.toMatchObject({ response: { error: 'INVALID_STORAGE_KEY' } });
    expect(pika.quote).not.toHaveBeenCalled();
  });

  it('yol atlatma ve bos istem reddedilir', async () => {
    const { service } = setup();
    await expect(
      service.create('u1', dto({ prompt: '', inputKey: `ai-input/u1/../x/${UUID}.png` })),
    ).rejects.toBeDefined();
    await expect(service.create('u1', dto({ prompt: '' }))).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_PROMPT_REQUIRED' },
    });
  });

  it('tavan asimi: AI_VIDEO_DAILY_CAP, satir acilmaz, gonderilmez', async () => {
    const { service, prisma, pika } = setup({}, [
      { status: AiVideoStatus.COMPLETED, costMicroUsd: 2_900_000, quoteMicroUsd: 200_000 },
    ]);
    await expect(service.create('u1', dto())).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_DAILY_CAP' },
    });
    expect(prisma.aiVideoGeneration.create).not.toHaveBeenCalled();
    expect(pika.submit).not.toHaveBeenCalled();
  });

  it('gorselli gonderim: ozel bucket okunur, Pika yuklemesine gider', async () => {
    const inputKey = `ai-input/u1/${UUID}.png`;
    const { service, pika, storage } = setup({ inputKey });
    await service.create('u1', dto({ prompt: '', inputKey }));
    expect(storage.getBuffer).toHaveBeenCalled();
    expect(pika.createUpload).toHaveBeenCalledWith('image/png', 3);
  });

  it('olcu: govdeye modelin alan adiyla girer, Otomatik ve onbellek anahtari', async () => {
    const { service, pika, prisma } = setup({ aspectRatio: '9:16' });
    await service.create('u1', dto({ aspectRatio: '9:16' }));
    expect(pika.quote).toHaveBeenCalledWith(
      'pika/pika-2.5/text-to-video',
      expect.objectContaining({ aspect_ratio: '9:16' }),
    );
    expect(prisma.aiVideoGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ aspectRatio: '9:16' }),
    });
    expect(pika.submit.mock.calls[0][1]).toMatchObject({ aspect_ratio: '9:16' });

    const auto = setup();
    await auto.service.create('u1', dto());
    expect(auto.pika.submit.mock.calls[0][1]).not.toHaveProperty('aspect_ratio');
    expect(auto.pika.submit.mock.calls[0][1]).not.toHaveProperty('ratio');
  });

  it('olcu: Wan ratio alanini kullanir, 25 sn kabul', async () => {
    const { service, pika } = setup({ aspectRatio: '3:4' });
    await service.create('u1', dto({ model: 'wan-3.0', durationS: 25, aspectRatio: '3:4' }));
    expect(pika.submit.mock.calls[0][1]).toMatchObject({ ratio: '3:4', duration: 25 });
  });

  it.each([
    ['modelde olmayan olcu', { aspectRatio: '3:4' }],
    [
      'Kling 4:3 yok',
      { model: 'kling-3.0-turbo', durationS: 5, resolution: '720p', aspectRatio: '4:3' },
    ],
    [
      'Pika gorselli uretimde olcu yok',
      { aspectRatio: '16:9', prompt: '', inputKey: `ai-input/u1/${UUID}.png` },
    ],
  ])('gecersiz olcu (%s): 400, Pika cagrilmaz', async (_n, over) => {
    const { service, pika } = setup();
    await expect(service.create('u1', dto(over))).rejects.toMatchObject({
      status: 400,
      response: { error: 'AI_VIDEO_INVALID_OPTION' },
    });
    expect(pika.quote).not.toHaveBeenCalled();
  });

  it.each([
    ['insufficient_balance', 'AI_VIDEO_INSUFFICIENT_BALANCE'],
    ['content_moderation', 'AI_VIDEO_CONTENT_REJECTED'],
    ['rate_limited', 'AI_VIDEO_PROVIDER_ERROR'],
  ])('Pika aninda reddederse (%s) satir FAILED + kod %s', async (pikaCode, ours) => {
    const { service, pika, prisma } = setup();
    pika.submit.mockResolvedValue({ id: 'media_9', status: 'failed', errorCode: pikaCode });
    await expect(service.create('u1', dto())).rejects.toMatchObject({ response: { error: ours } });
    expect(prisma.aiVideoGeneration.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { status: AiVideoStatus.FAILED, errorCode: ours, providerJobId: 'media_9' },
    });
  });

  it('Pika ag hatasi: satir FAILED PROVIDER_ERROR', async () => {
    const { service, pika } = setup();
    pika.submit.mockRejectedValue(new Error('Pika 500'));
    await expect(service.create('u1', dto())).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_PROVIDER_ERROR' },
    });
  });
});

describe('AiVideoService.estimate / options', () => {
  it('satir olusturmaz, onbellekler, withImage ayri anahtar', async () => {
    const { service, pika, prisma } = setup();
    const q = { model: 'pika-2.5', resolution: '720p', durationS: 5, withImage: false };
    expect(await service.estimate(q)).toEqual({ quoteUsd: 0.2, estimateCredits: 20 });
    await service.estimate(q);
    expect(pika.quote).toHaveBeenCalledTimes(1);
    expect(pika.quote).toHaveBeenCalledWith('pika/pika-2.5/text-to-video', {
      prompt: 'x',
      resolution: '720p',
      duration_s: 5,
    });
    await service.estimate({ ...q, withImage: true });
    expect(pika.quote).toHaveBeenCalledTimes(2);
    expect(pika.quote.mock.calls[1][0]).toBe('pika/pika-2.5/image-to-video');
    expect(prisma.aiVideoGeneration.create).not.toHaveBeenCalled();
  });

  it('gecersiz secenek 400', async () => {
    const { service } = setup();
    await expect(
      service.estimate({
        model: 'kling-3.0-turbo',
        resolution: '480p',
        durationS: 5,
        withImage: false,
      }),
    ).rejects.toMatchObject({ response: { error: 'AI_VIDEO_INVALID_OPTION' } });
  });

  it('options: acik modeller + tavan + bugunku harcama', async () => {
    const { service } = setup({}, [
      { status: AiVideoStatus.RUNNING, costMicroUsd: null, quoteMicroUsd: 400_000 },
    ]);
    const res = await service.options('u1');
    expect(res.models.map((m) => m.key)).toEqual(['pika-2.5', 'wan-3.0', 'kling-3.0-turbo']);
    expect(res.models[2]).toMatchObject({ durations: [5, 10, 15], resolutions: ['720p'] });
    expect(res).toMatchObject({
      dailyCapUsd: 3,
      todaySpentUsd: 0.4,
      dailyCapCredits: 300,
      spentTodayCredits: 40,
    });
  });
});

describe('AiVideoService.create yeniden deneme', () => {
  it('ilk cagri ag hatasi, ikincisi is doner: QUEUED + providerJobId, ayni anahtar', async () => {
    const { service, pika, prisma } = setup();
    pika.submit
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ id: 'media_2', status: 'queued' });
    await service.create('u1', dto());
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
    await expect(service.create('u1', dto())).rejects.toMatchObject({
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
    await service.create('u1', dto());
    expect(pika.submit).toHaveBeenCalledTimes(2);
  });

  it('422 duz hata: tek cagri, FAILED', async () => {
    const { service, pika, prisma } = setup();
    pika.submit.mockRejectedValue(new PikaError(422, 'Pika 422'));
    await expect(service.create('u1', dto())).rejects.toBeDefined();
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
    expect(await done.service.get('u1', 'g1')).toMatchObject({
      videoUrl: 'https://signed',
      downloadUrl: 'https://signed',
      model: 'pika-2.5',
      resolution: '720p',
      durationS: 5,
    });
    expect(done.storage.presignGet).toHaveBeenCalledWith('ai-video/u1/g1.mp4', {
      expiresIn: 900,
      downloadFilename: 'kankaverse-yz-g1.mp4',
    });
    const queued = setup({ status: AiVideoStatus.RUNNING });
    expect(await queued.service.get('u1', 'g1')).not.toHaveProperty('downloadUrl');
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

describe('AiVideoService C14c', () => {
  it('options: kilitli (allowed=false): tutarlar 0, modeller gelir, Pika cagrilmaz', async () => {
    const { service, pika } = setup({}, [
      { status: AiVideoStatus.RUNNING, costMicroUsd: null, quoteMicroUsd: 400_000 },
    ]);
    const res = await service.options('u1', false);
    expect(res.models.length).toBeGreaterThan(0);
    expect(res).toMatchObject({
      dailyCapUsd: 0,
      todaySpentUsd: 0,
      dailyCapCredits: 0,
      spentTodayCredits: 0,
    });
    expect(pika.quote).not.toHaveBeenCalled();
    expect(res.accessInviteCode).toBeNull(); // kod yapilandirilmamis
  });

  it('options: kod yalniz kilitli kullaniciya doner', async () => {
    const s = setup();
    (s.service as unknown as { config: { get: (k: string) => unknown } }).config.get = (k) =>
      k === 'aiVideo.accessInviteCode'
        ? 'ABC123'
        : k === 'aiVideo.models'
          ? ['pika-2.5']
          : undefined;
    expect((await s.service.options('u1', false)).accessInviteCode).toBe('ABC123');
    expect((await s.service.options('u1', true)).accessInviteCode).toBeNull();
  });

  it('options: modelde audio doner', async () => {
    const s = setup();
    const o = await s.service.options('u1');
    expect(o.models.map((m) => [m.key, m.audio])).toEqual([
      ['pika-2.5', 'none'],
      ['wan-3.0', 'default'],
      ['kling-3.0-turbo', 'always'],
    ]);
  });

  it('liste ve tek okuma silinmisleri suzer; todaySpent suzmez (silinmis harcama sayilir)', async () => {
    const s = setup();
    await s.service.list('u1');
    expect(s.prisma.aiVideoGeneration.findMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: null,
    });
    await s.service.get('u1', 'g1');
    expect(s.prisma.aiVideoGeneration.findFirst.mock.calls.at(-1)![0].where).toMatchObject({
      deletedAt: null,
    });
    s.prisma.aiVideoGeneration.findMany.mockClear();
    await s.service.options('u1');
    expect(s.prisma.aiVideoGeneration.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'deletedAt',
    );
  });
});

describe('toCredits (C33 kredi donusturucu)', () => {
  it('1 kredi = 10000 mikro-USD; yukari yuvarlar', () => {
    expect(toCredits(0, 10_000)).toBe(0);
    expect(toCredits(450_000, 10_000)).toBe(45);
    expect(toCredits(450_001, 10_000)).toBe(46);
    expect(toCredits(1, 10_000)).toBe(1);
    expect(toCredits(3_000_000, 10_000)).toBe(300);
  });
});

describe('C40 butce kapisi ve hak ozeti', () => {
  const grantRow = (over: Record<string, unknown> = {}) => ({
    userId: 'u2',
    budgetMicroUsd: 500_000,
    startsAt: new Date('2026-10-01T00:00:00Z'),
    expiresAt: null,
    revokedAt: null,
    ...over,
  });
  function grantSetup(grant: unknown, spentRows: unknown[] = []) {
    const t = setup({}, spentRows);
    t.prisma.aiVideoGrant.findUnique.mockResolvedValue(grant);
    return t;
  }

  it('env listesindeki kullanici: butce kapisi yok, grant null', async () => {
    const { service, prisma } = setup();
    await service.create('u1', dto());
    expect(prisma.aiVideoGrant.findUnique).not.toHaveBeenCalled();
    expect((await service.options('u1')).grant).toBeNull();
  });

  it('hak yeterli: uretim gecer; options kalan kredi ve butce doner, not donmez', async () => {
    const { service } = grantSetup({ ...grantRow(), note: 'IBAN 120 TL' }, []);
    await expect(service.create('u2', dto())).resolves.toBeDefined();
    const o = await service.options('u2');
    expect(o.grant).toEqual({ remainingCredits: 50, budgetCredits: 50, expiresAt: null });
    expect(JSON.stringify(o)).not.toContain('IBAN');
  });

  it('tahmin kalan butceyi asarsa 403 AI_VIDEO_BUDGET_EXCEEDED, satir olusmaz', async () => {
    const spent = [
      { status: AiVideoStatus.COMPLETED, costMicroUsd: 400_000, quoteMicroUsd: 400_000 },
    ];
    const { service, prisma } = grantSetup(grantRow(), spent);
    await expect(service.create('u2', dto())).rejects.toMatchObject({
      status: 403,
      response: { error: 'AI_VIDEO_BUDGET_EXCEEDED', message: 'Kredin bu video için yetmiyor.' },
    });
    expect(prisma.aiVideoGeneration.create).not.toHaveBeenCalled();
  });

  it('iptal edilmis / suresi dolmus hak: 403 ve options grant null', async () => {
    for (const over of [{ revokedAt: new Date() }, { expiresAt: new Date(Date.now() - 1000) }]) {
      const { service } = grantSetup(grantRow(over));
      await expect(service.create('u2', dto())).rejects.toMatchObject({ status: 403 });
      expect((await service.options('u2')).grant).toBeNull();
    }
  });

  it('harcanan startsAt sonrasi sorgulanir', async () => {
    const { service, prisma } = grantSetup(grantRow());
    await service.options('u2');
    expect(prisma.aiVideoGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u2', createdAt: { gte: new Date('2026-10-01T00:00:00Z') } },
      }),
    );
  });
});
