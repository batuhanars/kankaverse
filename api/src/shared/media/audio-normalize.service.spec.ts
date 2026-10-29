import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { Logger } from '@nestjs/common';
import { AudioNormalizeService } from './audio-normalize.service';
import { buildDurationProbeArgs, buildLoudnormArgs } from './audio-normalize-args';
import * as runBinaryModule from './run-binary';

jest.mock('./run-binary');
const runBinary = runBinaryModule.runBinary as jest.MockedFunction<
  typeof runBinaryModule.runBinary
>;

const CLEAN_ATT = {
  id: 'a1',
  storageKey: 'attachments/a1.m4a',
  contentType: 'audio/mp4',
  scanStatus: 'CLEAN',
  messageId: 'm1',
  audioNormalizedAt: null,
  message: { deletedAt: null },
};

function setup(att: object | null = CLEAN_ATT, durations = ['5.000', '5.020'], outSize = 1000) {
  const prisma = {
    attachment: {
      findUnique: jest.fn().mockResolvedValue(att),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  let tmpIn = '';
  let tmpOut = '';
  const storage = {
    downloadToFile: jest.fn().mockImplementation(async (_k: string, dest: string) => {
      tmpIn = dest;
      await writeFile(dest, Buffer.alloc(2000, 1));
    }),
    putPrivate: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: jest.fn((k: string) => (k === 'ffmpegPath' ? 'ffmpeg' : 'ffprobe')) };
  const probes = [...durations];
  runBinary.mockReset();
  runBinary.mockImplementation(async (bin, args) => {
    if (bin === 'ffmpeg') {
      tmpOut = args[args.length - 1];
      await writeFile(tmpOut, Buffer.alloc(outSize, 2));
      return '';
    }
    return probes.shift() ?? '5.000';
  });
  const service = new AudioNormalizeService(prisma as any, storage as any, config as any);
  return { service, prisma, storage, paths: () => ({ tmpIn, tmpOut }) };
}

describe('AudioNormalizeService.normalize (C32)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('mutlu yol: doğru argümanlar, aynı anahtara yazım, alanlar güncellenir', async () => {
    const { service, prisma, storage, paths } = setup();

    expect(await service.normalize('a1')).toBe('processed');

    const ffmpegCall = runBinary.mock.calls.find((c) => c[0] === 'ffmpeg')!;
    const { tmpIn, tmpOut } = paths();
    expect(ffmpegCall[1]).toEqual(buildLoudnormArgs('audio/mp4', tmpIn, tmpOut));
    expect(ffmpegCall[1]).toContain('loudnorm=I=-16:TP=-2:LRA=11');
    expect(storage.putPrivate).toHaveBeenCalledWith(
      'attachments/a1.m4a',
      expect.any(Buffer),
      'audio/mp4',
    );
    const data = prisma.attachment.update.mock.calls[0][0].data;
    expect(data.size).toBe(1000);
    expect(data.audioNormalizedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('durationMs');
    expect(data).not.toHaveProperty('waveform');
  });

  it('süre uyuşmazlığında yazılmaz', async () => {
    const { service, prisma, storage } = setup(CLEAN_ATT, ['5.000', '6.000']);
    expect(await service.normalize('a1')).toBe('failed');
    expect(storage.putPrivate).not.toHaveBeenCalled();
    expect(prisma.attachment.update).not.toHaveBeenCalled();
  });

  it('boş çıktıda yazılmaz', async () => {
    const { service, storage } = setup(CLEAN_ATT, ['5.000', '5.000'], 0);
    expect(await service.normalize('a1')).toBe('failed');
    expect(storage.putPrivate).not.toHaveBeenCalled();
  });

  it('girdinin 3 katından büyük çıktıda yazılmaz', async () => {
    const { service, storage } = setup(CLEAN_ATT, ['5.000', '5.000'], 6001);
    expect(await service.normalize('a1')).toBe('failed');
    expect(storage.putPrivate).not.toHaveBeenCalled();
  });

  it.each([
    ['audio olmayan', { ...CLEAN_ATT, contentType: 'image/png' }],
    ['CLEAN olmayan', { ...CLEAN_ATT, scanStatus: 'PENDING' }],
    ['mesajsız', { ...CLEAN_ATT, messageId: null }],
    ['silinmiş mesajdaki', { ...CLEAN_ATT, message: { deletedAt: new Date() } }],
    ['zaten işlenmiş', { ...CLEAN_ATT, audioNormalizedAt: new Date() }],
    ['bulunamayan', null],
  ])('%s ek atlanır, ffmpeg çalışmaz', async (_n, att) => {
    const { service, storage } = setup(att);
    expect(await service.normalize('a1')).toBe('skipped');
    expect(runBinary).not.toHaveBeenCalled();
    expect(storage.downloadToFile).not.toHaveBeenCalled();
  });

  it('hata yolunda da geçici dosya silinir ve fırlatılmaz', async () => {
    const { service, paths } = setup();
    runBinary.mockImplementation((bin) =>
      bin === 'ffmpeg' ? Promise.reject(new Error('ffmpeg çöktü')) : Promise.resolve('5.000'),
    );
    expect(await service.normalize('a1')).toBe('failed');
    expect(existsSync(paths().tmpIn)).toBe(false);
  });

  it('başarı yolunda da geçici dosya silinir', async () => {
    const { service, paths } = setup();
    await service.normalize('a1');
    expect(existsSync(paths().tmpIn)).toBe(false);
    expect(existsSync(paths().tmpOut)).toBe(false);
  });

  it('kuyruk eşzamanlılık 1: işler sırayla, enqueue beklemez', async () => {
    const { service } = setup();
    const order: string[] = [];
    let release!: () => void;
    jest.spyOn(service, 'normalize').mockImplementation(async (id: string) => {
      order.push(`start:${id}`);
      if (id === 'x1') await new Promise<void>((r) => (release = r));
      order.push(`end:${id}`);
      return 'processed';
    });

    service.enqueue('x1');
    service.enqueue('x2');
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual(['start:x1']);
    release();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual(['start:x1', 'end:x1', 'start:x2', 'end:x2']);
  });

  it('enqueueFromMessage yalnız ses eklerini sıraya alır', () => {
    const { service } = setup();
    const spy = jest.spyOn(service, 'enqueue').mockImplementation(() => undefined);
    service.enqueueFromMessage({
      attachments: [
        { id: 'a', contentType: 'audio/webm' },
        { id: 'b', contentType: 'image/png' },
        { id: 'c', contentType: 'video/mp4' },
      ],
    });
    expect(spy.mock.calls).toEqual([['a']]);
  });
});

describe('audio-normalize-args kap/kodek eşlemesi', () => {
  it.each([
    ['audio/mp4', 'aac', 'mp4'],
    ['audio/webm', 'libopus', 'webm'],
    ['audio/mpeg', 'libmp3lame', 'mp3'],
  ])('%s -> %s / %s', (ct, codec, muxer) => {
    const args = buildLoudnormArgs(ct, '/t/in', '/t/out');
    expect(args[args.indexOf('-c:a') + 1]).toBe(codec);
    expect(args[args.indexOf('-b:a') + 1]).toBe('64k');
    expect(args[args.indexOf('-ac') + 1]).toBe('1');
    expect(args[args.length - 2]).toBe(muxer);
    expect(args[args.length - 1]).toBe('/t/out');
    expect(args).toContain('file');
  });

  it('desteklenmeyen tür reddedilir', () => {
    expect(() => buildLoudnormArgs('audio/ogg', 'a', 'b')).toThrow();
    expect(() => buildDurationProbeArgs('image/png', 'a')).toThrow();
  });
});
