import {
  buildAnimatedArgs,
  buildProbeArgs,
  buildStaticArgs,
  ConvertArgsInput,
} from './ffmpeg-args';

const base: ConvertArgsInput = {
  contentType: 'video/mp4',
  target: 'AVATAR',
  clip: { startMs: 1500, durationMs: 3000 },
  inputPath: '/tmp/kv/in.mp4',
  outputPath: '/tmp/kv/out.webp',
  quality: 75,
};

function after(args: string[], flag: string): string {
  return args[args.indexOf(flag) + 1];
}

describe('ffmpeg-args (R7)', () => {
  it('animasyonlu: protokol whitelist=file, zorunlu demuxer, nostdin, ses/metadata yok', () => {
    const a = buildAnimatedArgs(base);
    expect(after(a, '-protocol_whitelist')).toBe('file');
    expect(after(a, '-f')).toBe('mov,mp4,m4a,3gp,3g2,mj2');
    expect(a).toContain('-nostdin');
    expect(a).toContain('-an');
    expect(after(a, '-map_metadata')).toBe('-1');
    expect(after(a, '-c:v')).toBe('libwebp_anim');
    expect(after(a, '-loop')).toBe('0');
    expect(after(a, '-threads')).toBe('2');
    // -f giriş seçeneği: -i'den ÖNCE olmalı
    expect(a.indexOf('-f')).toBeLessThan(a.indexOf('-i'));
    expect(after(a, '-ss')).toBe('1.500');
    expect(after(a, '-t')).toBe('3.000');
    expect(after(a, '-i')).toBe(base.inputPath);
    expect(a[a.length - 1]).toBe(base.outputPath);
  });

  it('girdi biçimi contentType ile zorlanır', () => {
    expect(after(buildAnimatedArgs({ ...base, contentType: 'image/gif' }), '-f')).toBe('gif');
    expect(after(buildAnimatedArgs({ ...base, contentType: 'video/webm' }), '-f')).toBe(
      'matroska,webm',
    );
    expect(after(buildAnimatedArgs({ ...base, contentType: 'video/quicktime' }), '-f')).toBe(
      'mov,mp4,m4a,3gp,3g2,mj2',
    );
  });

  it('hedefe göre sabit boyut (avatar 256x256, afiş 720x288)', () => {
    expect(after(buildAnimatedArgs(base), '-vf')).toContain('scale=256:256');
    expect(after(buildAnimatedArgs(base), '-vf')).toContain('crop=256:256');
    expect(after(buildAnimatedArgs({ ...base, target: 'BANNER' }), '-vf')).toContain(
      'crop=720:288',
    );
  });

  it('crop yoksa eski merkez kırpması (scale → crop)', () => {
    expect(after(buildAnimatedArgs(base), '-vf')).toBe(
      'fps=15,scale=256:256:force_original_aspect_ratio=increase,crop=256:256',
    );
  });

  it('crop varsa filtre sırası fps → crop → scale (piksel tamsayıları)', () => {
    const cropRect = { left: 120, top: 40, width: 200, height: 200 };
    expect(after(buildAnimatedArgs({ ...base, cropRect }), '-vf')).toBe(
      'fps=15,crop=200:200:120:40,scale=256:256',
    );
    expect(after(buildStaticArgs({ ...base, target: 'BANNER', cropRect }), '-vf')).toBe(
      'crop=200:200:120:40,scale=720:288',
    );
  });

  it('crop sayıları doğrulanır: tamsayı olmayan / negatif / sıfır boyut / string reddedilir', () => {
    const bad = (cropRect: any) => () => buildAnimatedArgs({ ...base, cropRect });
    expect(bad({ left: 0.5, top: 0, width: 10, height: 10 })).toThrow();
    expect(bad({ left: -1, top: 0, width: 10, height: 10 })).toThrow();
    expect(bad({ left: 0, top: 0, width: 0, height: 10 })).toThrow();
    expect(bad({ left: NaN, top: 0, width: 10, height: 10 })).toThrow();
    expect(bad({ left: '0:0,evil', top: 0, width: 10, height: 10 })).toThrow();
  });

  it('probe: döndürme üstverisi istenir', () => {
    expect(after(buildProbeArgs('video/mp4', '/tmp/in.mp4'), '-show_entries')).toContain(
      'stream_side_data=rotation',
    );
  });

  it('statik: tek kare, libwebp', () => {
    const a = buildStaticArgs(base);
    expect(after(a, '-frames:v')).toBe('1');
    expect(after(a, '-c:v')).toBe('libwebp');
    expect(after(a, '-protocol_whitelist')).toBe('file');
  });

  it('probe: whitelist + zorunlu demuxer', () => {
    const a = buildProbeArgs('image/gif', '/tmp/in.gif');
    expect(after(a, '-protocol_whitelist')).toBe('file');
    expect(after(a, '-f')).toBe('gif');
  });

  it('sayılar doğrulanır: NaN/Infinity/negatif/string enjeksiyonu reddedilir', () => {
    const bad = (clip: any) => () => buildAnimatedArgs({ ...base, clip });
    expect(bad({ startMs: NaN, durationMs: 3000 })).toThrow();
    expect(bad({ startMs: Infinity, durationMs: 3000 })).toThrow();
    expect(bad({ startMs: -1, durationMs: 3000 })).toThrow();
    expect(bad({ startMs: '0; rm -rf /' as any, durationMs: 3000 })).toThrow();
    expect(bad({ startMs: 0, durationMs: 100 })).toThrow();
    expect(bad({ startMs: 0, durationMs: 6001 })).toThrow();
    expect(() => buildAnimatedArgs({ ...base, quality: 101 })).toThrow();
    expect(() => buildAnimatedArgs({ ...base, quality: NaN })).toThrow();
  });

  it('argümanların tamamı string (shell birleştirmesi yok)', () => {
    for (const a of [buildAnimatedArgs(base), buildStaticArgs(base)]) {
      expect(a.every((x) => typeof x === 'string')).toBe(true);
    }
  });
});
