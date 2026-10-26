import {
  ANIMATED_FPS,
  ANIMATED_INPUT_TYPES,
  ANIMATED_MAX_CLIP_MS,
  ANIMATED_MIN_CLIP_MS,
  ANIMATED_SIZE,
  AnimatedInputType,
  AnimatedTarget,
} from './animated.constants';
import { PixelRect } from './crop-math';

/**
 * C13 R7 — ffmpeg/ffprobe argüman inşası (SAF fonksiyonlar, çalıştırma yok).
 *
 * Güvenilmeyen dosya sunucuda işleniyor. Kurallar:
 *  - Çıktı yalnız ARGÜMAN DİZİSİ; çağıran `spawn(shell:false)` kullanır → shell enjeksiyonu yok.
 *  - Kullanıcı girdisi argümana YALNIZ doğrulanmış sayı olarak girer (assertSafeNumber);
 *    dosya yolları sunucunun ürettiği geçici dizinden gelir, kullanıcıdan değil.
 *  - Girdi biçimi contentType'tan ZORLANIR (-f), ffmpeg dosya içeriğinden tahmin etmez.
 *  - `-protocol_whitelist file`: HLS/concat/http gibi dosya içinden ağ/dosya okutan yollar kapalı.
 */

const LOG_FLAGS = ['-hide_banner', '-nostdin', '-loglevel', 'error'] as const;

/** Argümana girecek sayı: sonlu ve negatif olmayan değilse hata (kullanıcı girdisi sızamaz). */
function assertSafeNumber(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`ffmpeg argümanı geçersiz: ${name}`);
  }
  return value;
}

/** ms → saniye metni (örn. 1500 → "1.500"); yalnız rakam ve nokta üretir. */
function secondsArg(ms: number, name: string): string {
  return (assertSafeNumber(ms, name) / 1000).toFixed(3);
}

/** Argümana girecek piksel değeri: sonlu, negatif olmayan TAMSAYI. */
function assertSafeInt(value: number, name: string): number {
  if (!Number.isInteger(assertSafeNumber(value, name))) {
    throw new Error(`ffmpeg argümanı geçersiz: ${name}`);
  }
  return value;
}

/**
 * Kırp + ölçekle. C13b: `rect` (kullanıcının seçtiği, sunucuda hedef oranına oturtulmuş piksel
 * dikdörtgeni) varsa `crop=W:H:X:Y,scale=w:h`; yoksa merkezden kırpma (eski istemciler).
 * Tüm sayılar doğrulanmış tamsayı veya sabittir; kullanıcı metni filtreye girmez.
 */
function cropScaleFilter(target: AnimatedTarget, rect?: PixelRect): string {
  const { width, height } = ANIMATED_SIZE[target];
  if (rect) {
    const w = assertSafeInt(rect.width, 'crop.width');
    const h = assertSafeInt(rect.height, 'crop.height');
    if (w < 1 || h < 1) throw new Error('ffmpeg argümanı geçersiz: crop boyutu');
    const x = assertSafeInt(rect.left, 'crop.left');
    const y = assertSafeInt(rect.top, 'crop.top');
    return `crop=${w}:${h}:${x}:${y},scale=${width}:${height}`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

export function demuxerFor(contentType: AnimatedInputType): string {
  return ANIMATED_INPUT_TYPES[contentType].demuxer;
}

/** ffprobe: video akışı var mı, süre, boyut (JSON). */
export function buildProbeArgs(contentType: AnimatedInputType, inputPath: string): string[] {
  return [
    '-v',
    'error',
    '-protocol_whitelist',
    'file',
    '-f',
    demuxerFor(contentType),
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_type,width,height:stream_side_data=rotation:stream_tags=rotate:format=duration',
    '-of',
    'json',
    inputPath,
  ];
}

export interface ClipRange {
  startMs: number;
  durationMs: number;
}

export interface ConvertArgsInput {
  contentType: AnimatedInputType;
  target: AnimatedTarget;
  clip: ClipRange;
  inputPath: string;
  outputPath: string;
  /** libwebp kalite (0-100). Düşük kaliteyle ikinci denemede küçültülür. */
  quality: number;
  /** C13b: kullanıcı kırpması (kaynak pikseli, hedef oranında). Yoksa merkezden kırp. */
  cropRect?: PixelRect;
}

/** Ortak giriş: günlük bayrakları + zorunlu biçim + protokol whitelist + kesit (giriş seçenekleri). */
function inputArgs(input: ConvertArgsInput): string[] {
  const { startMs, durationMs } = input.clip;
  if (durationMs < ANIMATED_MIN_CLIP_MS || durationMs > ANIMATED_MAX_CLIP_MS) {
    throw new Error('ffmpeg argümanı geçersiz: durationMs aralığı');
  }
  return [
    ...LOG_FLAGS,
    '-protocol_whitelist',
    'file',
    '-threads',
    '2',
    '-f',
    demuxerFor(input.contentType),
    '-ss',
    secondsArg(startMs, 'startMs'),
    '-t',
    secondsArg(durationMs, 'durationMs'),
    '-i',
    input.inputPath,
  ];
}

/** Hareketli WebP: kesit → fps → kırp → ölçekle → libwebp_anim, ses/altyazı/metadata yok. */
export function buildAnimatedArgs(input: ConvertArgsInput): string[] {
  const quality = Math.round(assertSafeNumber(input.quality, 'quality'));
  if (quality > 100) throw new Error('ffmpeg argümanı geçersiz: quality');
  return [
    ...inputArgs(input),
    '-map',
    '0:v:0',
    '-an',
    '-sn',
    '-dn',
    '-map_metadata',
    '-1',
    '-vf',
    `fps=${ANIMATED_FPS},${cropScaleFilter(input.target, input.cropRect)}`,
    '-c:v',
    'libwebp_anim',
    '-loop',
    '0',
    '-quality',
    String(quality),
    '-compression_level',
    '4',
    '-y',
    '-f',
    'webp',
    input.outputPath,
  ];
}

/** Statik WebP: kesitin ilk karesi (animasyonlu olanla aynı kırpma). */
export function buildStaticArgs(input: ConvertArgsInput): string[] {
  return [
    ...inputArgs(input),
    '-map',
    '0:v:0',
    '-an',
    '-sn',
    '-dn',
    '-map_metadata',
    '-1',
    '-vf',
    cropScaleFilter(input.target, input.cropRect),
    '-frames:v',
    '1',
    '-c:v',
    'libwebp',
    '-quality',
    '85',
    '-y',
    '-f',
    'webp',
    input.outputPath,
  ];
}
