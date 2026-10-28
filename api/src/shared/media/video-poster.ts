import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { runBinary } from './run-binary';

/** İstemcilerin ürettiğiyle aynı: en uzun kenar 320 px, JPEG base64 <= 40000 karakter (presign sınırı). */
const THUMB_MAX_SIDE = 320;
const THUMB_MAX_CHARS = 40_000;
const SEEK_SECONDS = '0.5';
const TIMEOUT_MS = 30_000;
/** ffmpeg `-q:v` (düşük = iyi): sınıra sığana dek kaliteyi düşür (istemcideki 0.8/0.6/0.4 karşılığı). */
const QUALITIES = [4, 8, 14];

export interface VideoPoster {
  thumbnail: string;
  width: number;
  height: number;
}

/** presign doğrulamasıyla aynı: JPEG imzası (FF D8) + base64 yeniden kodlama tutarlı. */
function isJpeg(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

/**
 * C14b — video baytlarından boyut (ffprobe) + ilk-yarım-saniye JPEG küçük resim (ffmpeg).
 * Geçici dizinde çalışır, her durumda temizler. Herhangi bir hata/limit aşımı → null (çağıran ek
 * oluşturmayı DÜŞÜRMEMELİ). Argümanlar sabit/sunucu üretimi; kullanıcı girdisi yok (runBinary shell'siz).
 */
export async function extractVideoPoster(
  bytes: Buffer,
  ffmpegPath: string,
  ffprobePath: string,
): Promise<VideoPoster | null> {
  const dir = await mkdtemp(join(tmpdir(), 'kv-poster-'));
  try {
    const input = join(dir, 'in.mp4');
    const output = join(dir, 'poster.jpg');
    await writeFile(input, bytes);

    const probe = await runBinary(
      ffprobePath,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        input,
      ],
      TIMEOUT_MS,
    );
    const stream = (JSON.parse(probe) as { streams?: { width?: number; height?: number }[] })
      .streams?.[0];
    const width = stream?.width;
    const height = stream?.height;
    if (!width || !height || width < 1 || height < 1) return null;

    const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * scale));
    const th = Math.max(1, Math.round(height * scale));

    for (const q of QUALITIES) {
      await runBinary(
        ffmpegPath,
        [
          '-hide_banner',
          '-nostdin',
          '-loglevel',
          'error',
          '-y',
          '-ss',
          SEEK_SECONDS,
          '-i',
          input,
          '-frames:v',
          '1',
          '-vf',
          `scale=${tw}:${th}`,
          '-q:v',
          String(q),
          output,
        ],
        TIMEOUT_MS,
      );
      const jpeg = await readFile(output);
      const b64 = jpeg.toString('base64');
      if (isJpeg(jpeg) && b64.length <= THUMB_MAX_CHARS) return { thumbnail: b64, width, height };
    }
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
