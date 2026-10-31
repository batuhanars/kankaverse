import { AiVideoStatus } from '@prisma/client';
import { AiVideoService } from './ai-video.service';
import { AiVideoInputService } from './ai-video-input.service';
import { AiVideoReferenceService } from './ai-video-references.service';
import { translatePromptTags } from './ai-video-prompt-tags';
import { apiIdOf, buildPikaBody, findModelSpec } from './ai-video.models';
import { runBinary } from '../../shared/media/run-binary';

jest.mock('../../shared/media/run-binary', () => ({ runBinary: jest.fn() }));
const runBinaryMock = runBinary as jest.Mock;

const UUIDS = [1, 2, 3, 4, 5, 6].map((n) => `123e4567-e89b-42d3-a456-42661417400${n}`);
const key = (i: number, ext: string) => `ai-input/u1/${UUIDS[i]}.${ext}`;

describe('translatePromptTags (C42 §1.4)', () => {
  const counts = { image: 2, video: 1, audio: 1 };

  it('omni: Gorsel/Video/Ses -> Image n / Video n / Audio n', () => {
    expect(
      translatePromptTags('@Görsel2 telefonda, @Video1 hareket, @Ses1 fon', 'reference', counts),
    ).toBe('Image 2 telefonda, Video 1 hareket, Audio 1 fon');
  });

  it('buyuk/kucuk harf duyarsiz', () => {
    expect(translatePromptTags('@görsel1 ve @GÖRSEL2 ve @vIdEo1', 'reference', counts)).toBe(
      'Image 1 ve Image 2 ve Video 1',
    );
  });

  it('gorselden video kipi: @Gorsel1 -> gorsel', () => {
    expect(translatePromptTags('@Görsel1 yürüsün', 'image', { image: 1, video: 0, audio: 0 })).toBe(
      'görsel yürüsün',
    );
  });

  it('etiketsiz istem ve e-posta (@ bitisik) aynen kalir', () => {
    expect(translatePromptTags('kedi ali@video1.com', 'reference', counts)).toBe(
      'kedi ali@video1.com',
    );
  });

  it.each([
    ['var olmayan video', '@Video2'],
    ['sifir', '@Görsel0'],
    ['fazla gorsel', '@Görsel3'],
  ])('%s: 400 AI_VIDEO_INVALID_OPTION', (_n, text) => {
    expect(() => translatePromptTags(text, 'reference', counts)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ error: 'AI_VIDEO_INVALID_OPTION' }),
      }),
    );
  });

  it('gorsel kipinde ikinci gorsel / video etiketi yok sayilmaz, 400', () => {
    const one = { image: 1, video: 0, audio: 0 };
    expect(() => translatePromptTags('@Görsel2', 'image', one)).toThrow();
    expect(() => translatePromptTags('@Video1', 'image', one)).toThrow();
  });
});

describe('model tablosu: kipler ve govde', () => {
  const wan = findModelSpec('wan-3.0')!;

  it('apiIdOf uc kip', () => {
    expect(apiIdOf(wan, 'text')).toBe('alibaba/wan3.0-video/text-to-video');
    expect(apiIdOf(wan, 'image')).toBe('alibaba/wan3.0-video/image-to-video');
    expect(apiIdOf(wan, 'reference')).toBe('alibaba/wan3.0-video/omni-video');
  });

  it('referans alanlari tablodan, bos tur govdeye girmez', () => {
    const body = buildPikaBody(wan, {
      prompt: 'x',
      resolution: '720p',
      durationS: 5,
      referenceUrls: { image: ['a', 'b'], video: [], audio: ['c'] },
    });
    expect(body).toMatchObject({
      reference_image_urls: ['a', 'b'],
      reference_audio_urls: ['c'],
      watermark: false,
    });
    expect(body).not.toHaveProperty('reference_video_urls');
    expect(body).not.toHaveProperty('first_frame_url');
  });

  it('Pika ve Kling referans desteklemez', () => {
    expect(findModelSpec('pika-2.5')!.references).toBeNull();
    expect(findModelSpec('kling-3.0-turbo')!.references).toBeNull();
  });
});

function setup() {
  const row = {
    id: 'g1',
    userId: 'u1',
    model: 'alibaba/wan3.0-video/omni-video',
    prompt: '',
    inputKey: null,
    references: null,
    resolution: '480p',
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
  };
  const prisma = {
    aiVideoGrant: {
      findUnique: jest.fn().mockResolvedValue({
        userId: 'u1',
        budgetMicroUsd: 1_000_000_000,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        expiresAt: null,
        revokedAt: null,
      }),
    },
    aiVideoGeneration: {
      create: jest.fn().mockImplementation(({ data }) => ({ ...row, ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null), // C43: aktif üretim yok
      update: jest.fn().mockImplementation(({ data }) => ({ ...row, ...data })),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const storage = {
    headSize: jest.fn().mockResolvedValue(1000),
    getBuffer: jest.fn().mockResolvedValue(Buffer.from('x')),
    downloadToFile: jest.fn().mockResolvedValue(undefined),
  };
  const values: Record<string, unknown> = {
    'aiVideo.models': ['pika-2.5', 'wan-3.0'],
  };
  const config = { get: (k: string) => values[k] };
  let uploads = 0;
  const pika = {
    quote: jest.fn().mockResolvedValue(200_000),
    submit: jest.fn().mockResolvedValue({ id: 'media_1', status: 'queued' }),
    createUpload: jest.fn().mockImplementation(() =>
      Promise.resolve({
        uploadUrl: 'https://up',
        headers: {},
        url: `https://pika/u${++uploads}`,
      }),
    ),
    putUpload: jest.fn().mockResolvedValue(undefined),
  };
  const input = new AiVideoInputService(storage as any, pika as any);
  const service = new AiVideoService(
    prisma as any,
    storage as any,
    config as any,
    pika as any,
    input,
    new AiVideoReferenceService(storage as any, input, config as any),
  );
  return { service, prisma, storage, pika, input };
}

/** ffprobe sahte: dosya yolu yerine sirayla verilen sureleri doner. */
const probeDurations = (...seconds: number[]) => {
  runBinaryMock.mockReset();
  seconds.forEach((s) => runBinaryMock.mockResolvedValueOnce(`${s}\n`));
};

const wanDto = (over: Record<string, unknown> = {}) => ({
  model: 'wan-3.0',
  resolution: '480p',
  durationS: 5,
  prompt: '@Görsel2 telefon ekraninda',
  ...over,
});

describe('AiVideoService.create referans kipi (C42)', () => {
  const refs2img = [
    { kind: 'image' as const, key: key(0, 'png') },
    { kind: 'image' as const, key: key(1, 'jpg') },
  ];

  it('2 gorsel: omni ucu, govde alanlari, etiket cevrilir, satirda ham istem + references', async () => {
    const s = setup();
    await s.service.create('u1', wanDto({ references: refs2img }));
    expect(s.pika.quote.mock.calls[0][0]).toBe('alibaba/wan3.0-video/omni-video');
    // teklifte yer tutucu: kullanici anahtari / pika adresi yok
    const qBody = s.pika.quote.mock.calls[0][1];
    expect(qBody.reference_image_urls).toHaveLength(2);
    expect(JSON.stringify(qBody)).not.toContain('ai-input');
    expect(JSON.stringify(qBody)).toContain('example.com');
    expect(s.prisma.aiVideoGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        model: 'alibaba/wan3.0-video/omni-video',
        prompt: '@Görsel2 telefon ekraninda',
        inputKey: undefined,
        references: refs2img,
      }),
    });
    const [apiId, body] = s.pika.submit.mock.calls[0];
    expect(apiId).toBe('alibaba/wan3.0-video/omni-video');
    expect(body).toEqual({
      prompt: 'Image 2 telefon ekraninda',
      resolution: '480p',
      duration: 5,
      reference_image_urls: ['https://pika/u1', 'https://pika/u2'],
      watermark: false,
    });
  });

  it('tek gorselden ibaret references de omni ucuna gider (kip kurali istemcide)', async () => {
    const s = setup();
    await s.service.create('u1', wanDto({ prompt: 'x', references: [refs2img[0]] }));
    expect(s.pika.submit.mock.calls[0][0]).toBe('alibaba/wan3.0-video/omni-video');
  });

  it('video + ses: alanlar tablodan, sureler sinirda kabul', async () => {
    probeDurations(15.4, 30.4);
    const s = setup();
    await s.service.create(
      'u1',
      wanDto({
        prompt: '@Video1 gibi, @Ses1 ile',
        references: [
          { kind: 'video', key: key(0, 'mp4') },
          { kind: 'audio', key: key(1, 'mp3') },
        ],
      }),
    );
    expect(s.pika.submit.mock.calls[0][1]).toMatchObject({
      prompt: 'Video 1 gibi, Audio 1 ile',
      reference_video_urls: ['https://pika/u1'],
      reference_audio_urls: ['https://pika/u2'],
    });
    expect(s.pika.quote.mock.calls[0][1].reference_video_urls).toHaveLength(1);
  });

  it('inputKey + references birlikte: 400 AI_VIDEO_INVALID_OPTION', async () => {
    const s = setup();
    await expect(
      s.service.create('u1', wanDto({ inputKey: key(2, 'png'), references: refs2img })),
    ).rejects.toMatchObject({ status: 400, response: { error: 'AI_VIDEO_INVALID_OPTION' } });
    expect(s.pika.quote).not.toHaveBeenCalled();
  });

  it('bos references dizisi: 400', async () => {
    const s = setup();
    await expect(s.service.create('u1', wanDto({ references: [] }))).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_INVALID_OPTION' },
    });
  });

  it.each([
    ['5 gorsel', Array.from({ length: 5 }, (_v, i) => ({ kind: 'image', key: key(i, 'png') }))],
    ['3 video', [0, 1, 2].map((i) => ({ kind: 'video', key: key(i, 'mp4') }))],
    ['3 ses', [0, 1, 2].map((i) => ({ kind: 'audio', key: key(i, 'mp3') }))],
  ])('sayi tavani (%s): 400, Pika cagrilmaz', async (_n, references) => {
    const s = setup();
    await expect(s.service.create('u1', wanDto({ prompt: 'x', references }))).rejects.toMatchObject(
      { response: { error: 'AI_VIDEO_INVALID_OPTION' } },
    );
    expect(s.pika.quote).not.toHaveBeenCalled();
  });

  it('tur ile uzanti uyusmazligi (video diye png): 400', async () => {
    const s = setup();
    await expect(
      s.service.create(
        'u1',
        wanDto({ prompt: 'x', references: [{ kind: 'video', key: key(0, 'png') }] }),
      ),
    ).rejects.toMatchObject({ response: { error: 'AI_VIDEO_INVALID_OPTION' } });
  });

  it('baskasinin anahtari: INVALID_STORAGE_KEY', async () => {
    const s = setup();
    await expect(
      s.service.create(
        'u1',
        wanDto({
          prompt: 'x',
          references: [{ kind: 'image', key: `ai-input/u2/${UUIDS[0]}.png` }],
        }),
      ),
    ).rejects.toMatchObject({ response: { error: 'INVALID_STORAGE_KEY' } });
  });

  it('15,6 sn video: 400 AI_VIDEO_INPUT_TOO_LONG', async () => {
    probeDurations(15.6);
    const s = setup();
    await expect(
      s.service.create(
        'u1',
        wanDto({ prompt: 'x', references: [{ kind: 'video', key: key(0, 'mp4') }] }),
      ),
    ).rejects.toMatchObject({ status: 400, response: { error: 'AI_VIDEO_INPUT_TOO_LONG' } });
    expect(s.pika.quote).not.toHaveBeenCalled();
  });

  it('toplam video 15,5 sn asilirsa (8 + 8): 400 AI_VIDEO_INPUT_TOO_LONG', async () => {
    probeDurations(8, 8);
    const s = setup();
    await expect(
      s.service.create(
        'u1',
        wanDto({
          prompt: 'x',
          references: [0, 1].map((i) => ({ kind: 'video' as const, key: key(i, 'mp4') })),
        }),
      ),
    ).rejects.toMatchObject({ response: { error: 'AI_VIDEO_INPUT_TOO_LONG' } });
  });

  it('30,6 sn ses: 400 AI_VIDEO_INPUT_TOO_LONG', async () => {
    probeDurations(30.6);
    const s = setup();
    await expect(
      s.service.create(
        'u1',
        wanDto({ prompt: 'x', references: [{ kind: 'audio', key: key(0, 'mp3') }] }),
      ),
    ).rejects.toMatchObject({ response: { error: 'AI_VIDEO_INPUT_TOO_LONG' } });
  });

  it('ffprobe okuyamazsa: 400 INVALID_STORAGE_KEY', async () => {
    runBinaryMock.mockReset();
    runBinaryMock.mockRejectedValueOnce(new Error('bozuk'));
    const s = setup();
    await expect(
      s.service.create(
        'u1',
        wanDto({ prompt: 'x', references: [{ kind: 'video', key: key(0, 'mp4') }] }),
      ),
    ).rejects.toMatchObject({ response: { error: 'INVALID_STORAGE_KEY' } });
  });

  it('var olmayan referansa etiket: 400, dosya indirilmez / Pika cagrilmaz', async () => {
    const s = setup();
    await expect(
      s.service.create('u1', wanDto({ prompt: '@Video3 olsun', references: refs2img })),
    ).rejects.toMatchObject({ response: { error: 'AI_VIDEO_INVALID_OPTION' } });
    expect(s.storage.downloadToFile).not.toHaveBeenCalled();
    expect(s.pika.quote).not.toHaveBeenCalled();
  });

  it('referans kipinde olcu references.aspectRatios icinden dogrulanir', async () => {
    const s = setup();
    await expect(
      s.service.create('u1', wanDto({ prompt: 'x', references: refs2img, aspectRatio: '21:9' })),
    ).rejects.toMatchObject({ response: { error: 'AI_VIDEO_INVALID_OPTION' } });
    await s.service.create('u1', wanDto({ prompt: 'x', references: refs2img, aspectRatio: '3:4' }));
    expect(s.pika.submit.mock.calls[0][1]).toMatchObject({ ratio: '3:4' });
  });

  it('referansi olmayan model (Pika) referansla secilemez', async () => {
    const s = setup();
    await expect(
      s.service.create('u1', wanDto({ model: 'pika-2.5', prompt: 'x', references: refs2img })),
    ).rejects.toMatchObject({ response: { error: 'AI_VIDEO_INVALID_OPTION' } });
  });

  it('GERI UYUM: eski inputKey yolu image-to-video, first_frame_url, etiket -> gorsel', async () => {
    const s = setup();
    const inputKey = key(0, 'png');
    await s.service.create('u1', wanDto({ prompt: '@Görsel1 yürüsün', inputKey }));
    const [apiId, body] = s.pika.submit.mock.calls[0];
    expect(apiId).toBe('alibaba/wan3.0-video/image-to-video');
    expect(body).toMatchObject({ prompt: 'görsel yürüsün', first_frame_url: 'https://pika/u1' });
    expect(body).not.toHaveProperty('reference_image_urls');
  });
});

describe('AiVideoService.estimate referans kipi (C42)', () => {
  const q = { model: 'wan-3.0', resolution: '480p', durationS: 5, withImage: false };

  it('referenceKinds: omni teklifi, yer tutucu adresler, withImage yok sayilir', async () => {
    const s = setup();
    await s.service.estimate({ ...q, withImage: true, referenceKinds: ['image', 'video'] });
    const [apiId, body] = s.pika.quote.mock.calls[0];
    expect(apiId).toBe('alibaba/wan3.0-video/omni-video');
    expect(body.reference_image_urls).toHaveLength(1);
    expect(body.reference_video_urls).toHaveLength(1);
    expect(body).not.toHaveProperty('first_frame_url');
  });

  it('onbellek anahtari yalniz video var mi: gorsel sayisi degisse de tek teklif', async () => {
    const s = setup();
    await s.service.estimate({ ...q, referenceKinds: ['image'] });
    await s.service.estimate({ ...q, referenceKinds: ['image', 'image', 'audio'] });
    expect(s.pika.quote).toHaveBeenCalledTimes(1);
    await s.service.estimate({ ...q, referenceKinds: ['image', 'video'] });
    expect(s.pika.quote).toHaveBeenCalledTimes(2);
  });

  it('tavan asimi / bos / referanssiz model: 400', async () => {
    const s = setup();
    await expect(
      s.service.estimate({ ...q, referenceKinds: ['video', 'video', 'video'] }),
    ).rejects.toMatchObject({ response: { error: 'AI_VIDEO_INVALID_OPTION' } });
    await expect(s.service.estimate({ ...q, referenceKinds: [] })).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_INVALID_OPTION' },
    });
    await expect(
      s.service.estimate({ ...q, model: 'pika-2.5', referenceKinds: ['image'] }),
    ).rejects.toMatchObject({ response: { error: 'AI_VIDEO_INVALID_OPTION' } });
  });
});

describe('GET /ai-video/options references (C42 §1.7)', () => {
  it('Wan: sinirlar ve kabul edilen turler; Pika: null', async () => {
    const s = setup();
    const res = await s.service.options('u1');
    expect(res.models.find((m) => m.key === 'pika-2.5')!.references).toBeNull();
    expect(res.models.find((m) => m.key === 'wan-3.0')!.references).toEqual({
      max: { image: 4, video: 2, audio: 2 },
      videoTotalMaxS: 15,
      videoMaxS: 15,
      audioMaxS: 30,
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      inputTypes: {
        image: ['image/png', 'image/jpeg', 'image/webp'],
        video: ['video/mp4', 'video/quicktime', 'video/webm'],
        audio: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/webm'],
      },
    });
  });
});

describe('AiVideoInputService.presignInput (C42)', () => {
  it('video 50 MB, ses/gorsel 10 MB; anahtar uzantisi tablodan', async () => {
    const s = setup();
    (s.input as any).storage.presignPut = jest.fn().mockResolvedValue('https://put');
    const mb = 1024 * 1024;
    expect((await s.input.presignInput('u1', 'video/mp4', 50 * mb)).inputKey).toMatch(/\.mp4$/);
    expect((await s.input.presignInput('u1', 'audio/mp4', 10 * mb)).inputKey).toMatch(/\.m4a$/);
    await expect(s.input.presignInput('u1', 'audio/mpeg', 10 * mb + 1)).rejects.toMatchObject({
      response: { error: 'FILE_TOO_LARGE' },
    });
    await expect(s.input.presignInput('u1', 'image/png', 11 * mb)).rejects.toMatchObject({
      response: { error: 'FILE_TOO_LARGE' },
    });
    await expect(s.input.presignInput('u1', 'application/pdf', 10)).rejects.toMatchObject({
      response: { error: 'UNSUPPORTED_TYPE' },
    });
  });
});
