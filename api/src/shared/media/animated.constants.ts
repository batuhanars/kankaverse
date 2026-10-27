/**
 * C13 — hareketli avatar/afiş sabitleri (tek yer). Sözleşme §2.1.
 * Çıktı GIF değil hareketli WebP; ilk kareden statik WebP de üretilir.
 */

export const ANIMATED_MAX_CLIP_MS = 6000;
export const ANIMATED_MIN_CLIP_MS = 500;
export const ANIMATED_FPS = 15;

/** C19: GUILD_ICON / GUILD_BANNER ayni hatti ortam gorselleri icin kullanir (sahip kimligi = guildId). */
export type AnimatedTarget = 'AVATAR' | 'BANNER' | 'GUILD_ICON' | 'GUILD_BANNER';

/** Çıktı boyutları (px). Afiş 5:2 — web profil afişi 360x144 gösterimin 2x'i. */
export const ANIMATED_SIZE: Record<AnimatedTarget, { width: number; height: number }> = {
  AVATAR: { width: 256, height: 256 },
  BANNER: { width: 720, height: 288 },
  // C19: ortam simgesi kare; ortam afisi kanal paneli/mobil kenar cubugunda ~2:1 (248x120 / 132 yuksek), profil 5:2'den farkli.
  GUILD_ICON: { width: 256, height: 256 },
  GUILD_BANNER: { width: 640, height: 320 },
};

/** Public bucket anahtar öneki (C8 ile aynı: avatars/ banners/). */
export const ANIMATED_PREFIX: Record<AnimatedTarget, string> = {
  AVATAR: 'avatars',
  BANNER: 'banners',
  GUILD_ICON: 'icons',
  GUILD_BANNER: 'guild-banners',
};

export const MB = 1024 * 1024;
/** Girdi tavanı: GIF 15 MB; video için `maxUploadMb` config'i kullanılır. */
export const ANIMATED_MAX_GIF_BYTES = 15 * MB;
/** Çıktı tavanı (animasyonlu WebP). Aşılırsa bir kez düşük kaliteyle tekrar denenir. */
export const ANIMATED_MAX_OUTPUT_BYTES: Record<AnimatedTarget, number> = {
  AVATAR: 2 * MB,
  BANNER: 4 * MB,
  GUILD_ICON: 2 * MB,
  GUILD_BANNER: 4 * MB,
};

/** Girdi contentType allowlist → (uzantı, ffmpeg zorunlu demuxer). */
export const ANIMATED_INPUT_TYPES = {
  'image/gif': { ext: 'gif', demuxer: 'gif' },
  'video/mp4': { ext: 'mp4', demuxer: 'mov,mp4,m4a,3gp,3g2,mj2' },
  'video/quicktime': { ext: 'mov', demuxer: 'mov,mp4,m4a,3gp,3g2,mj2' },
  'video/webm': { ext: 'webm', demuxer: 'matroska,webm' },
} as const;
export type AnimatedInputType = keyof typeof ANIMATED_INPUT_TYPES;

/**
 * C13b: statik görsel girdileri (sharp hattı; ffmpeg'e girmez). Hareketli WebP girişi desteklenmez:
 * `image/webp` statik kabul edilir, hareketli gelirse ilk kare alınır (sharp varsayılanı).
 */
export const STILL_IMAGE_TYPES = {
  'image/png': { ext: 'png' },
  'image/jpeg': { ext: 'jpg' },
  'image/webp': { ext: 'webp' },
} as const;
export type StillImageType = keyof typeof STILL_IMAGE_TYPES;
/** Statik görsel girdi tavanı. */
export const STILL_MAX_INPUT_BYTES = 15 * MB;
/** Statik çıktı boyutları (px): yüksek DPI için 2x. */
export const STILL_SIZE: Record<AnimatedTarget, { width: number; height: number }> = {
  AVATAR: { width: 512, height: 512 },
  BANNER: { width: 1200, height: 480 },
  GUILD_ICON: { width: 512, height: 512 },
  GUILD_BANNER: { width: 1200, height: 600 },
};
export const STILL_WEBP_QUALITY = 85;
/** sharp için çözülmüş piksel tavanı (decompression bomb). */
export const STILL_MAX_INPUT_PIXELS = 8192 * 8192;
/** sharp işlem zaman aşımı. */
export const STILL_PROCESS_TIMEOUT_MS = 30_000;

export const ANIMATED_STAGING_PREFIX = 'animated-staging';
/** İş başına ffmpeg/ffprobe zaman aşımı. */
export const ANIMATED_PROCESS_TIMEOUT_MS = 30_000;
/** Aynı anda en fazla bu kadar ffmpeg (süreç içi sayaç). */
export const ANIMATED_MAX_CONCURRENCY = 2;
