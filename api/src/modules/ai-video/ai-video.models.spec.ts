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
