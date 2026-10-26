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
      expect(await code(s.presign(UID, 'image/png', 100))).toBe('UNSUPPORTED_TYPE');
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
