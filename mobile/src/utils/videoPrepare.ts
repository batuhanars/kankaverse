import * as FileSystem from 'expo-file-system/legacy';
import { Image as CompressorImage, Video, createVideoThumbnail } from 'react-native-compressor';
import { MAX_ATTACHMENT_BYTES, readFileSize, type DraftAttachment } from '@/utils/attachmentUpload';

/** Sprint M6c — sunucu video süre sınırı (`VIDEO_TOO_LONG`): 60 sn. */
export const MAX_VIDEO_MS = 60_000;

/** Sunucu `thumbnail` üst sınırı 40000 karakter; ~30 KB hedefi için güvenli pay. */
const THUMB_MAX_CHARS = 38_000;
const THUMB_EDGE = 320;

/** Hazırlama hatası: `key` kullanıcıya gösterilecek i18n anahtarı (ham hata metni ekrana basılmaz). */
export class VideoPrepareError extends Error {
  constructor(public readonly key: string) {
    super(key);
  }
}

/** En uzun kenarı 320px, ~30 KB'a inen JPEG küçük resim (base64). Başarısızsa null (kart koyu zeminle çizilir). */
async function buildThumbnail(videoUri: string): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    const frame = await createVideoThumbnail(videoUri);
    for (const quality of [0.6, 0.4, 0.25]) {
      const small = await CompressorImage.compress(frame.path, {
        maxWidth: THUMB_EDGE,
        maxHeight: THUMB_EDGE,
        quality,
        output: 'jpg',
      });
      const base64 = await FileSystem.readAsStringAsync(small, { encoding: FileSystem.EncodingType.Base64 });
      if (base64.length <= THUMB_MAX_CHARS) {
        return { base64, width: frame.width, height: frame.height };
      }
    }
  } catch {
    // küçük resim bir kolaylık: yoksa mesaj yine gider
  }
  return null;
}

/**
 * Sprint M6c §3.3 — videoyu mp4'e sıkıştırır (`auto`), küçük resim üretir, boyutu denetler.
 * `onProgress` 0-100. 25 MB'ı sıkıştırmadan sonra bile aşarsa `VideoPrepareError('mobile.video.tooLarge')`.
 */
export async function prepareVideoDraft(
  draft: DraftAttachment,
  onProgress: (percent: number) => void,
): Promise<DraftAttachment> {
  let uri: string;
  try {
    uri = await Video.compress(draft.uri, { compressionMethod: 'auto' }, (p) => onProgress(Math.round(p * 100)));
  } catch {
    throw new VideoPrepareError('mobile.video.prepareFailed');
  }
  const size = await readFileSize(uri);
  if (size > MAX_ATTACHMENT_BYTES) throw new VideoPrepareError('mobile.video.tooLarge');

  const thumb = await buildThumbnail(uri);
  return {
    ...draft,
    uri,
    size: size || draft.size,
    contentType: 'video/mp4',
    prepared: true,
    thumbnail: thumb?.base64,
    width: thumb?.width ?? draft.width,
    height: thumb?.height ?? draft.height,
  };
}
