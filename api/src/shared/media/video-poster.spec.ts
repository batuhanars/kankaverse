import { readdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { extractVideoPoster } from './video-poster';
import { runBinary } from './run-binary';

jest.mock('./run-binary');
const run = runBinary as jest.MockedFunction<typeof runBinary>;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100, 1)]);
const probeOut = JSON.stringify({ streams: [{ width: 1280, height: 720 }] });

/** ffmpeg çağrısını taklit eder: çıktı dosyasına (son argüman) verilen baytları yazar. */
function mockFfmpeg(bytes: Buffer) {
  run.mockImplementation(async (bin, args) => {
    if (bin === 'ffprobe') return probeOut;
    await writeFile(args[args.length - 1], bytes);
    return '';
  });
}

const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith('kv-poster-'));

describe('extractVideoPoster', () => {
  beforeEach(() => run.mockReset());

  it('boyut ffprobe, kucuk resim ffmpeg: 320 px kenar, base64 JPEG, gecici dizin temizlenir', async () => {
    const before = leftovers().length;
    mockFfmpeg(JPEG);
    const res = await extractVideoPoster(Buffer.from('v'), 'ffmpeg', 'ffprobe');
    expect(res).toEqual({ thumbnail: JPEG.toString('base64'), width: 1280, height: 720 });
    const ffArgs = run.mock.calls.find((c) => c[0] === 'ffmpeg')![1];
    expect(ffArgs).toContain('scale=320:180');
    expect(leftovers().length).toBe(before);
  });

  it('ffmpeg hatasi: firlatir (cagiran yakalar), dizin yine temizlenir', async () => {
    const before = leftovers().length;
    run.mockImplementation(async (bin) => {
      if (bin === 'ffprobe') return probeOut;
      throw new Error('ffmpeg yok');
    });
    await expect(extractVideoPoster(Buffer.from('v'), 'ffmpeg', 'ffprobe')).rejects.toThrow();
    expect(leftovers().length).toBe(before);
  });

  it('JPEG imzasi yoksa veya 40000 karakteri asarsa null', async () => {
    mockFfmpeg(Buffer.from('png-degil-jpeg'));
    expect(await extractVideoPoster(Buffer.from('v'), 'ffmpeg', 'ffprobe')).toBeNull();
    mockFfmpeg(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(40_000, 1)]));
    expect(await extractVideoPoster(Buffer.from('v'), 'ffmpeg', 'ffprobe')).toBeNull();
  });

  it('video akisi/boyutu yoksa null', async () => {
    run.mockResolvedValue(JSON.stringify({ streams: [] }));
    expect(await extractVideoPoster(Buffer.from('v'), 'ffmpeg', 'ffprobe')).toBeNull();
  });
});
