/**
 * C13 — hareketli avatar/afiş sabitleri (tek yer). Sözleşme §2.1.
 * Çıktı GIF değil hareketli WebP; ilk kareden statik WebP de üretilir.
 */

export const ANIMATED_MAX_CLIP_MS = 6000;
export const ANIMATED_MIN_CLIP_MS = 500;
export const ANIMATED_FPS = 15;

export type AnimatedTarget = 'AVATAR' | 'BANNER';

/** Çıktı boyutları (px). Afiş 5:2 — web profil afişi 360x144 gösterimin 2x'i. */
export const ANIMATED_SIZE: Record<AnimatedTarget, { width: number; height: number }> = {
  AVATAR: { width: 256, height: 256 },
  BANNER: { width: 720, height: 288 },
};

/** Public bucket anahtar öneki (C8 ile aynı: avatars/ banners/). */
export const ANIMATED_PREFIX: Record<AnimatedTarget, 'avatars' | 'banners'> = {
  AVATAR: 'avatars',
  BANNER: 'banners',
};

export const MB = 1024 * 1024;
/** Girdi tavanı: GIF 15 MB; video için `maxUploadMb` config'i kullanılır. */
export const ANIMATED_MAX_GIF_BYTES = 15 * MB;
/** Çıktı tavanı (animasyonlu WebP). Aşılırsa bir kez düşük kaliteyle tekrar denenir. */
export const ANIMATED_MAX_OUTPUT_BYTES: Record<AnimatedTarget, number> = {
  AVATAR: 2 * MB,
  BANNER: 4 * MB,
};

/** Girdi contentType allowlist → (uzantı, ffmpeg zorunlu demuxer). */
export const ANIMATED_INPUT_TYPES = {
  'image/gif': { ext: 'gif', demuxer: 'gif' },
  'video/mp4': { ext: 'mp4', demuxer: 'mov,mp4,m4a,3gp,3g2,mj2' },
  'video/quicktime': { ext: 'mov', demuxer: 'mov,mp4,m4a,3gp,3g2,mj2' },
  'video/webm': { ext: 'webm', demuxer: 'matroska,webm' },
} as const;
export type AnimatedInputType = keyof typeof ANIMATED_INPUT_TYPES;

export const ANIMATED_STAGING_PREFIX = 'animated-staging';
/** İş başına ffmpeg/ffprobe zaman aşımı. */
export const ANIMATED_PROCESS_TIMEOUT_MS = 30_000;
/** Aynı anda en fazla bu kadar ffmpeg (süreç içi sayaç). */
export const ANIMATED_MAX_CONCURRENCY = 2;
