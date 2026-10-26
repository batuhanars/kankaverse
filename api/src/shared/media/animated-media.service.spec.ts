import { copyFileSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { AnimatedMediaService } from './animated-media.service';

const UID = 'user-1';
const KEY = (ext = 'mp4') => `animated-staging/${UID}/550e8400-e29b-41d4-a716-446655440000.${ext}`;

const prismaMock = { user: { findUnique: jest.fn(), update: jest.fn() } };
const storageMock = {
  presignPut: jest.fn(),
  headSize: jest.fn(),
  downloadToFile: jest.fn(),
  putPublic: jest.fn(),
  deletePublic: jest.fn(),
  delete: jest.fn(),
};

function make(cfg: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    animatedProfileEnabled: true,
    uploadsEnabled: true,
    maxUploadMb: 25,
    's3.publicBaseUrl': 'http://cdn/x',
    ...cfg,
  };
  const config = { get: (k: string) => values[k] };
  return new AnimatedMediaService(prismaMock as any, storageMock as any, config as any);
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e.response?.error,
  );

describe('AnimatedMediaService (C13)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    storageMock.delete.mockResolvedValue(undefined);
  });

  describe('presign', () => {
    it('bayrak kapalı → ANIMATED_DISABLED', async () => {
      const s = make({ animatedProfileEnabled: false });
      expect(await code(s.presign(UID, 'image/gif', 100))).toBe('ANIMATED_DISABLED');
    });
    it('uploads kapalı → UPLOADS_DISABLED', async () => {
      const s = make({ uploadsEnabled: false });
      expect(await code(s.presign(UID, 'image/gif', 100))).toBe('UPLOADS_DISABLED');
    });
    it('allowlist dışı tür → UNSUPPORTED_TYPE (prototip anahtarı dahil)', async () => {
      const s = make();
      expect(await code(s.presign(UID, 'image/bmp', 100))).toBe('UNSUPPORTED_TYPE');
      expect(await code(s.presign(UID, 'toString', 100))).toBe('UNSUPPORTED_TYPE');
    });
    it('GIF 15 MB, video maxUploadMb üstü → FILE_TOO_LARGE', async () => {
      const s = make();
      expect(await code(s.presign(UID, 'image/gif', 16 * 1024 * 1024))).toBe('FILE_TOO_LARGE');
      expect(await code(s.presign(UID, 'video/mp4', 26 * 1024 * 1024))).toBe('FILE_TOO_LARGE');
      expect(await code(s.presign(UID, 'video/mp4', 0))).toBe('FILE_TOO_LARGE');
    });
    it('geçerli → staging anahtarı özel bucket presign (kullanıcı prefix)', async () => {
      storageMock.presignPut.mockResolvedValue('https://put');
      const r = await make().presign(UID, 'video/quicktime', 1000);
      expect(r.stagingKey).toMatch(new RegExp(`^animated-staging/${UID}/[0-9a-f-]{36}\\.mov$`));
      expect(storageMock.presignPut).toHaveBeenCalledWith(r.stagingKey, 'video/quicktime');
    });
  });

  describe('statik görsel (C13b)', () => {
    it('bayrak kapalı + png/jpeg/webp presign GEÇER; gif/video ANIMATED_DISABLED', async () => {
      storageMock.presignPut.mockResolvedValue('https://put');
      const s = make({ animatedProfileEnabled: false });
      for (const t of ['image/png', 'image/jpeg', 'image/webp']) {
        expect((await s.presign(UID, t, 1000)).stagingKey).toMatch(/^animated-staging\//);
      }
      expect(await code(s.presign(UID, 'image/gif', 100))).toBe('ANIMATED_DISABLED');
      expect(await code(s.presign(UID, 'video/mp4', 100))).toBe('ANIMATED_DISABLED');
    });
    it('uzantı jpeg→jpg; statik tavan 15 MB', async () => {
      storageMock.presignPut.mockResolvedValue('https://put');
      const s = make();
      expect((await s.presign(UID, 'image/jpeg', 1000)).stagingKey).toMatch(/\.jpg$/);
      expect(await code(s.presign(UID, 'image/png', 16 * 1024 * 1024))).toBe('FILE_TOO_LARGE');
    });
    it('uploads kapalıyken statik de UPLOADS_DISABLED', async () => {
      const s = make({ uploadsEnabled: false });
      expect(await code(s.presign(UID, 'image/png', 100))).toBe('UPLOADS_DISABLED');
    });

    async function pngFile(width = 400, height = 200) {
      const f = join(mkdtempSync(join(tmpdir(), 'kv-spec-')), 'src.png');
      writeFileSync(
        f,
        await sharp({ create: { width, height, channels: 3, background: '#f00' } })
          .png()
          .toBuffer(),
      );
      return f;
    }
    function stub(file: string) {
      storageMock.headSize.mockResolvedValue(1000);
      storageMock.downloadToFile.mockImplementation(async (_k: string, dest: string) => {
        copyFileSync(file, dest);
      });
      storageMock.putPublic.mockResolvedValue(undefined);
      storageMock.deletePublic.mockResolvedValue(undefined);
      prismaMock.user.findUnique.mockResolvedValue({
        avatarUrl: null,
        avatarAnimatedUrl: null,
        bannerUrl: null,
        bannerAnimatedUrl: null,
      });
      prismaMock.user.update.mockImplementation(async ({ data }: any) => data);
    }

    it('bayrak kapalı + png process GEÇER: statik WebP 512x512, animated alan null', async () => {
      stub(await pngFile());
      const s = make({ animatedProfileEnabled: false });
      const user: any = await s.process(UID, 'AVATAR', { stagingKey: KEY('png') });
      expect(user.avatarAnimatedUrl).toBeNull();
      expect(user.avatarUrl).toMatch(
        /^http:\/\/cdn\/x\/avatars\/user-1\/[0-9a-f-]{36}-still\.webp$/,
      );
      expect(storageMock.putPublic).toHaveBeenCalledTimes(1);
      const [, buf, type] = storageMock.putPublic.mock.calls[0];
      expect(type).toBe('image/webp');
      const meta = await sharp(buf).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['webp', 512, 512]);
      expect(storageMock.delete).toHaveBeenCalledWith(KEY('png')); // staging temizliği
    });
    it('afiş 1200x480, crop uygulanır, bannerAnimatedUrl null', async () => {
      stub(await pngFile(200, 400));
      const user: any = await make().process(UID, 'BANNER', {
        stagingKey: KEY('png'),
        crop: { x: 0, y: 0, width: 1, height: 0.4 },
      });
      expect(user.bannerAnimatedUrl).toBeNull();
      const meta = await sharp(storageMock.putPublic.mock.calls[0][1]).metadata();
      expect([meta.width, meta.height]).toEqual([1200, 480]);
    });
    it('bayrak kapalı + gif process → ANIMATED_DISABLED (depolamaya gitmeden)', async () => {
      const s = make({ animatedProfileEnabled: false });
      expect(await code(s.process(UID, 'AVATAR', { stagingKey: KEY('gif') }))).toBe(
        'ANIMATED_DISABLED',
      );
      expect(storageMock.headSize).not.toHaveBeenCalled();
    });
    it('geçersiz crop → INVALID_CROP, depolamaya gitmeden', async () => {
      const s = make();
      for (const crop of [
        { x: -0.1, y: 0, width: 0.5, height: 0.5 },
        { x: 0.6, y: 0, width: 0.6, height: 0.5 },
        { x: 0, y: 0, width: NaN, height: 0.5 },
        { x: 0, y: 0, width: 0, height: 0.5 },
        'x' as any,
      ]) {
        expect(await code(s.process(UID, 'AVATAR', { stagingKey: KEY('png'), crop }))).toBe(
          'INVALID_CROP',
        );
      }
      expect(storageMock.headSize).not.toHaveBeenCalled();
    });
    it('SVG içeriği png uzantısıyla gelirse → INVALID_MEDIA (sharp biçim allowlist)', async () => {
      const f = join(mkdtempSync(join(tmpdir(), 'kv-spec-')), 'x.png');
      writeFileSync(
        f,
        '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>',
      );
      stub(f);
      expect(await code(make().process(UID, 'AVATAR', { stagingKey: KEY('png') }))).toBe(
        'INVALID_MEDIA',
      );
      expect(storageMock.putPublic).not.toHaveBeenCalled();
    });
    it('önceki -still.webp kendi değiştirmede silinir; C8 statik yüklemesine dokunulmaz', async () => {
      stub(await pngFile());
      prismaMock.user.findUnique.mockResolvedValue({
        avatarUrl: 'http://cdn/x/avatars/user-1/old-still.webp',
        avatarAnimatedUrl: null,
      });
      await make().process(UID, 'AVATAR', { stagingKey: KEY('png') });
      expect(storageMock.deletePublic).toHaveBeenCalledWith('avatars/user-1/old-still.webp');

      storageMock.deletePublic.mockClear();
      prismaMock.user.findUnique.mockResolvedValue({
        avatarUrl: 'http://cdn/x/avatars/user-1/c8-upload.png',
        avatarAnimatedUrl: null,
      });
      await make().process(UID, 'AVATAR', { stagingKey: KEY('png') });
      expect(storageMock.deletePublic).not.toHaveBeenCalled();
    });
  });

  describe('process ön kapıları', () => {
    it('bayrak kapalı → ANIMATED_DISABLED, hiçbir depolama çağrısı yok', async () => {
      const s = make({ animatedProfileEnabled: false });
      expect(await code(s.process(UID, 'AVATAR', { stagingKey: KEY() }))).toBe('ANIMATED_DISABLED');
      expect(storageMock.headSize).not.toHaveBeenCalled();
    });
    it('başkasının prefix / yol atlatma / yanlış uzantı → INVALID_STORAGE_KEY', async () => {
      const s = make();
      for (const k of [
        'animated-staging/other/550e8400-e29b-41d4-a716-446655440000.mp4',
        `animated-staging/${UID}/../other/550e8400-e29b-41d4-a716-446655440000.mp4`,
        `animated-staging/${UID}/550e8400-e29b-41d4-a716-446655440000.exe`,
        `avatars/${UID}/550e8400-e29b-41d4-a716-446655440000.mp4`,
      ]) {
        expect(await code(s.process(UID, 'AVATAR', { stagingKey: k }))).toBe('INVALID_STORAGE_KEY');
      }
    });
    it('HEAD boyutu tavanı aşıyor → FILE_TOO_LARGE ve staging yine silinir', async () => {
      storageMock.headSize.mockResolvedValue(99 * 1024 * 1024);
      expect(await code(make().process(UID, 'AVATAR', { stagingKey: KEY() }))).toBe(
        'FILE_TOO_LARGE',
      );
      expect(storageMock.delete).toHaveBeenCalledWith(KEY());
      expect(storageMock.downloadToFile).not.toHaveBeenCalled();
    });
    it('busy: 2 iş sürerken üçüncü → PROCESSING_BUSY (beklemez)', async () => {
      const s = make();
      let release!: () => void;
      const gate = new Promise<number>((r) => (release = () => r(99 * 1024 * 1024)));
      storageMock.headSize.mockReturnValue(gate);
      const a = s.process(UID, 'AVATAR', { stagingKey: KEY() });
      const b = s.process(UID, 'AVATAR', { stagingKey: KEY() });
      expect(await code(s.process(UID, 'AVATAR', { stagingKey: KEY() }))).toBe('PROCESSING_BUSY');
      release();
      await Promise.allSettled([a, b]);
      // sayaç düştü → yeni iş busy DEĞİL (FILE_TOO_LARGE'a kadar gider)
      storageMock.headSize.mockResolvedValue(99 * 1024 * 1024);
      expect(await code(s.process(UID, 'AVATAR', { stagingKey: KEY() }))).toBe('FILE_TOO_LARGE');
    });
  });

  describe('resolveClip', () => {
    const clip = (type: any, probe: any, start?: number, dur?: number) =>
      (make() as any).resolveClip(type, probe, start, dur);

    it('GIF: aralık yok sayılır, ilk 6 sn', () => {
      expect(clip('image/gif', { durationMs: 1000 }, 9999, 1)).toEqual({
        startMs: 0,
        durationMs: 6000,
      });
    });
    it('video, aralık yok → startMs=0, durationMs=min(6000, süre)', () => {
      expect(clip('video/mp4', { durationMs: 20000 })).toEqual({ startMs: 0, durationMs: 6000 });
      expect(clip('video/mp4', { durationMs: 2500 })).toEqual({ startMs: 0, durationMs: 2500 });
      expect(clip('video/mp4', { durationMs: 100 })).toEqual({ startMs: 0, durationMs: 500 });
      expect(clip('video/mp4', { durationMs: null })).toEqual({ startMs: 0, durationMs: 6000 });
    });
    it('yalnız startMs verilirse süre kalandan türetilir', () => {
      expect(clip('video/mp4', { durationMs: 8000 }, 5000)).toEqual({
        startMs: 5000,
        durationMs: 3000,
      });
    });
    it('geçersiz aralık → INVALID_RANGE', () => {
      const err = (st?: number, d?: number) => {
        try {
          clip('video/mp4', { durationMs: 10000 }, st, d);
        } catch (e: any) {
          return e.response.error;
        }
      };
      expect(err(10000, 3000)).toBe('INVALID_RANGE');
      expect(err(-1, 3000)).toBe('INVALID_RANGE');
      expect(err(0, 499)).toBe('INVALID_RANGE');
      expect(err(0, 6001)).toBe('INVALID_RANGE');
      expect(err(1.5, 3000)).toBe('INVALID_RANGE');
      expect(err(0, 3000)).toBeUndefined();
    });
  });

  it('canCreateAnimated yalnız bayrağa bağlı', () => {
    expect(make().canCreateAnimated({ id: UID })).toBe(true);
    expect(make({ animatedProfileEnabled: false }).canCreateAnimated({ id: UID })).toBe(false);
  });
});
