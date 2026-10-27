import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as CompressorImage, Video } from 'react-native-compressor';
import { usersApi, type AnimatedProcessPayload, type AnimatedTarget, type MediaCrop } from '@/api/users';
import { guildsApi } from '@/api/guilds';
import { MAX_IMAGE_BYTES } from '@/utils/imageUpload';

/**
 * Sprint C13 §6: hareketli avatar/afis (GIF dosyasi veya videodan kesit).
 * Sabitler sozlesme §2.1 ve web `utils/animatedMedia.ts` ile ayni; sunucu otoritedir.
 */
export const ANIMATED_MIN_MS = 500;
export const ANIMATED_MAX_MS = 6000;
export const ANIMATED_DEFAULT_MS = 3000;
export const ANIMATED_GIF_MAX_BYTES = 15 * 1024 * 1024;
/** Bundan buyuk video yuklemeden once sikistirilir (M6c deseni, `react-native-compressor`). */
const VIDEO_COMPRESS_THRESHOLD = 10 * 1024 * 1024;
const VIDEO_MAX_EDGE = 1280;
const ANIMATED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/** Hareketli adres varsa onu, yoksa statigi doner. `reduceMotion` acikken her zaman statik. */
export function animatedOrStatic(
  staticUrl: string | null | undefined,
  animatedUrl: string | null | undefined,
  reduceMotion: boolean,
): string | null {
  if (animatedUrl && !reduceMotion) return animatedUrl;
  return staticUrl ?? null;
}

/** Sistemin "animasyonlari azalt" ayari (Android: animasyon olcegi 0). Degisimi dinler. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export type PickedProfileMedia =
  | { kind: 'static'; uri: string; contentType: string; size: number }
  | { kind: 'gif'; uri: string; contentType: 'image/gif'; size: number }
  | { kind: 'video'; uri: string; contentType: string; size: number; durationMs: number; width: number; height: number };

/** Desteklenmeyen video turu: `error` alani i18n anahtaridir (profile.animated.errorType). */
export class AnimatedPickError extends Error {
  constructor(public readonly key: string) {
    super(key);
  }
}

function guessType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType && asset.mimeType !== 'image/*' && asset.mimeType !== 'video/*') return asset.mimeType;
  const name = (asset.fileName ?? asset.uri).toLowerCase();
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return asset.type === 'video' ? 'video/mp4' : 'image/jpeg';
}

async function fileSize(uri: string, fallback = 0): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && 'size' in info ? info.size : fallback;
  } catch {
    return fallback;
  }
}

export type ProfileMediaMode = 'static' | 'animated';

/** C22: "Yeni" etiketi bu tarihte (14 gun) kendiliginden kalkar. Web `ANIMATED_NEW_BADGE_UNTIL` ile ayni. */
export const ANIMATED_NEW_BADGE_UNTIL = '2026-11-10';
export function showAnimatedNewBadge(now: Date = new Date()): boolean {
  return now.getTime() < new Date(`${ANIMATED_NEW_BADGE_UNTIL}T00:00:00`).getTime();
}

/**
 * Galeriden gorsel VEYA video sec.
 *
 * 🔴 `quality`, `allowsEditing` ve `exif` BILINCLI verilmiyor: bu parametrelerden biri verilince
 * secici GIF'i tek kareli JPEG'e cevirebiliyor (hareket kaybolur). Parametresiz secimde dosya
 * oldugu gibi gelir. Bunun sonucu: statik gorsel eskiden `quality: 0.9` ile gelirdi, simdi
 * orijinal boyutta gelir; 2 MB sinirini asarsa burada sikistirilir (C8 sinirinin aynisi).
 */
/** C22: `mode` secim sayfasindaki secenegi belirler: 'static' yalniz PNG/JPEG/WebP, 'animated' yalniz GIF/video. */
export async function pickProfileMedia(mode: ProfileMediaMode): Promise<PickedProfileMedia | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: mode === 'animated' ? ['images', 'videos'] : ['images'],
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const contentType = guessType(asset);
  const isGif = contentType === 'image/gif';
  const isVideo = asset.type === 'video' || contentType.startsWith('video/');

  // Secici GIF'i "gorsel" olarak da listeler; yanlis secenekten gelen dosya acik bir mesajla reddedilir.
  if (mode === 'static' && isGif) throw new AnimatedPickError('media.source.errorStaticOnly');
  if (mode === 'animated' && !isGif && !isVideo) throw new AnimatedPickError('media.source.errorAnimatedOnly');

  if (isGif) {
    return { kind: 'gif', uri: asset.uri, contentType: 'image/gif', size: asset.fileSize ?? (await fileSize(asset.uri)) };
  }
  if (isVideo) {
    if (!ANIMATED_VIDEO_TYPES.includes(contentType)) throw new AnimatedPickError('profile.animated.errorType');
    return {
      kind: 'video',
      uri: asset.uri,
      contentType,
      size: asset.fileSize ?? (await fileSize(asset.uri)),
      durationMs: asset.duration ?? 0,
      // Android'de secici donme bayragini boyuta uygular (portre video 1080x1920 gelir).
      width: asset.width,
      height: asset.height,
    };
  }

  // Statik gorsel (C13b: konumlandirma paneline girer). Sunucu yalniz jpeg/png/webp kabul eder.
  const staticType = ['image/jpeg', 'image/png', 'image/webp'].includes(contentType) ? contentType : 'image/jpeg';
  let uri = asset.uri;
  let size = asset.fileSize ?? (await fileSize(uri));
  if (size > MAX_IMAGE_BYTES) {
    const out = await CompressorImage.compress(uri, { maxWidth: 1600, maxHeight: 1600, quality: 0.8, output: 'jpg' });
    uri = out;
    size = await fileSize(out);
    return { kind: 'static', uri, contentType: 'image/jpeg', size };
  }
  return { kind: 'static', uri, contentType: staticType, size };
}

export interface AnimatedUploadInput {
  target: AnimatedTarget;
  /** C19: GUILD_ICON / GUILD_BANNER hedeflerinde zorunlu. */
  guildId?: string;
  media: PickedProfileMedia;
  /** C13b: konumlandirma kesirleri (kaynak boyutuna oranli). */
  crop?: MediaCrop;
  /** Yalniz video. */
  startMs?: number;
  durationMs?: number;
  onPhase: (phase: 'compress' | 'upload' | 'process', percent: number) => void;
}

/** presign, PUT, isle. Hata `error` kodunu tasiyan axios hatasi olarak yukari cikar. */
export async function uploadAnimated(input: AnimatedUploadInput) {
  const { target, guildId, media, crop, startMs, durationMs, onPhase } = input;
  let uri = media.uri;
  let contentType: string = media.contentType;
  let size = media.size;

  if (media.kind === 'video' && size > VIDEO_COMPRESS_THRESHOLD) {
    onPhase('compress', 0);
    uri = await Video.compress(uri, { compressionMethod: 'auto', maxSize: VIDEO_MAX_EDGE }, (p) =>
      onPhase('compress', Math.round(p * 100)),
    );
    contentType = 'video/mp4';
    size = await fileSize(uri, size);
  }

  onPhase('upload', 0);
  const presigned = guildId
    ? await guildsApi.animatedPresign(guildId, contentType, size)
    : await usersApi.animatedPresign(target, contentType, size);
  const task = FileSystem.createUploadTask(
    presigned.uploadUrl,
    uri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType },
    },
    (e) => {
      if (e.totalBytesExpectedToSend > 0) {
        onPhase('upload', Math.round((e.totalBytesSent / e.totalBytesExpectedToSend) * 100));
      }
    },
  );
  const res = await task.uploadAsync();
  // Depolama 2xx donmezse sessizce ilerlenmez: stagingKey bos bir nesneye isaret ederdi.
  if (!res || res.status < 200 || res.status >= 300) throw new Error(`upload_failed_${res?.status ?? 0}`);

  onPhase('process', 100);
  const payload: AnimatedProcessPayload = { stagingKey: presigned.stagingKey };
  if (media.kind === 'video' && durationMs) {
    payload.startMs = startMs;
    payload.durationMs = durationMs;
  }
  if (crop) payload.crop = crop;
  if (guildId && target === 'GUILD_ICON') return guildsApi.processIcon(guildId, payload);
  if (guildId && target === 'GUILD_BANNER') return guildsApi.processBanner(guildId, payload);
  return target === 'AVATAR' ? usersApi.setAnimatedAvatar(payload) : usersApi.setAnimatedBanner(payload);
}
