import { buildPikaBody, findModelSpec } from './ai-video.models';

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
