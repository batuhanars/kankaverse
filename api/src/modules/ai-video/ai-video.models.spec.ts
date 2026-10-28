import { buildPikaBody, findModelSpec } from './ai-video.models';

describe('Wan 3.0 sureleri', () => {
  it('5-10-15-20-30 sn; 30 sn govdesi duration: 30 uretir', () => {
    const spec = findModelSpec('wan-3.0')!;
    expect(spec.durations).toEqual([5, 10, 15, 20, 30]);
    expect(buildPikaBody(spec, { prompt: 'x', resolution: '720p', durationS: 30 })).toMatchObject({
      duration: 30,
    });
  });
});
