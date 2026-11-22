import { buildPikaBody, findModelSpec, hasRequiredVisual } from './ai-video.models';

describe('Wan 3.0 sureleri', () => {
  it('5-30 sn tek tek; 30 sn govdesi duration: 30 uretir', () => {
    const spec = findModelSpec('wan-3.0')!;
    expect(spec.durations).toHaveLength(26);
    expect(spec.durations[0]).toBe(5);
    expect(spec.durations).toContain(7);
    expect(spec.durations.at(-1)).toBe(30);
    expect(buildPikaBody(spec, { prompt: 'x', resolution: '720p', durationS: 30 })).toMatchObject({
      duration: 30,
    });
  });
});

describe('2026-11-22 sesli modeller ve referans sinirlari', () => {
  it('Wan 3.0 referans sinirlari saglayicinin ust siniri: 10 gorsel, 5 video, 5 ses', () => {
    expect(findModelSpec('wan-3.0')!.references!.max).toEqual({ image: 10, video: 5, audio: 5 });
  });

  it('yeni modellerin govdesi Pika alan adlariyla kurulur', () => {
    const seed = findModelSpec('seedance-2.5')!;
    expect(
      buildPikaBody(seed, { prompt: 'x', resolution: '720p', durationS: 10, aspectRatio: '21:9' }),
    ).toEqual({ prompt: 'x', resolution: '720p', duration: 10, ratio: '21:9', watermark: false });
    const kling = findModelSpec('kling-4.0')!;
    expect(
      buildPikaBody(kling, { prompt: 'x', resolution: '720p', durationS: 5, image: 'https://i' }),
    ).toEqual({ prompt: 'x', resolution: '720p', duration: 5, image_url: 'https://i' });
    expect(findModelSpec('veo-3.1-fast')!.supportsImage).toBe(false);
  });
});

describe('2026-11-22 Pika H3 Flex', () => {
  const h3 = findModelSpec('pika-h3-flex')!;

  it('metinden ve ilk kareden govde Pika alan adlariyla kurulur', () => {
    expect(
      buildPikaBody(h3, { prompt: 'x', resolution: '768p', durationS: 5, aspectRatio: '9:16' }),
    ).toEqual({ prompt: 'x', resolution: '768p', duration: 5, aspect_ratio: '9:16' });
    expect(
      buildPikaBody(h3, { prompt: 'x', resolution: '480p', durationS: 5, image: 'https://i' }),
    ).toEqual({ prompt: 'x', resolution: '480p', duration: 5, image: 'https://i' });
  });

  it('referanslar sirali tek references listesine girer (gorsel, video, ses)', () => {
    const body = buildPikaBody(h3, {
      prompt: 'Image 1 Video 1',
      resolution: '768p',
      durationS: 8,
      referenceUrls: {
        image: ['https://a', 'https://b'],
        video: ['https://v'],
        audio: ['https://s'],
      },
    });
    expect(body).toEqual({
      prompt: 'Image 1 Video 1',
      references: [
        { type: 'image', url: 'https://a' },
        { type: 'image', url: 'https://b' },
        { type: 'video', url: 'https://v' },
        { type: 'audio', url: 'https://s' },
      ],
      resolution: '768p',
      duration: 8,
    });
  });

  it('yalniz ses referansi kabul edilmez; diger modellerde kural yok', () => {
    expect(hasRequiredVisual(h3.references!, ['audio'])).toBe(false);
    expect(hasRequiredVisual(h3.references!, ['audio', 'video'])).toBe(true);
    expect(hasRequiredVisual(findModelSpec('wan-3.0')!.references!, ['audio'])).toBe(true);
  });
});
