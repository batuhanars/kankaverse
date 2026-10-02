import { MAX_VIDEO_MS } from '@/utils/videoPrepare';
import {
  MAX_ATTACHMENT_BYTES,
  readFileSize,
  resolveContentType,
  type DraftAttachment,
} from '@/utils/attachmentUpload';

/**
 * Sprint M3c §2-§3 — seçilen bir dosyayı taslak eke çevirir ve **istemci tarafı erken kontrolünü**
 * uygular (tür + boyut). İki kaynak (galeri ızgarası ve sistem seçicisi/kamera) aynı kontrolden
 * geçsin diye tek yerde: aksi hâlde iki yol ayrı ayrı doğrulanır ve biri unutulurdu.
 *
 * 🔴 Bu kontrol bir KAPI DEĞİL, kolaylıktır. Otorite sunucudadır (`presign`); istemci sunucunun
 * sınırını yalnız erken söyler, asla gevşetmez.
 */

let counter = 0;

export type DraftResult = { ok: true; draft: DraftAttachment } | { ok: false; errorKey: string };

export interface PickedFile {
  uri: string;
  filename?: string | null;
  /** Seçicinin bildirdiği tür (varsa) — allowlist'te değilse uzantıdan türetilir. */
  contentType?: string | null;
  /** Seçici boyutu biliyorsa (ImagePicker biliyor, MediaLibrary bilmiyor) tekrar okunmaz. */
  size?: number | null;
  /** M6c — video seçimi. Süre/boyut seçiciden gelir (süre ms; MediaLibrary saniye verir, çağıran çevirir). */
  isVideo?: boolean;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
}

export async function buildDraftAttachment(file: PickedFile): Promise<DraftResult> {
  // M6c §3.2-§3.3 — video: 60 sn üstü seçilmez; tür/boyut kontrolü SIKIŞTIRMADAN SONRA (orijinal
  // büyük olabilir, 25 MB sınırı sonuca uygulanır). Orijinal adı ne olursa olsun çıktı mp4.
  if (file.isVideo) {
    if (file.durationMs && file.durationMs > MAX_VIDEO_MS) {
      return { ok: false, errorKey: 'mobile.video.tooLong' };
    }
    counter += 1;
    return {
      ok: true,
      draft: {
        key: `draft-${Date.now()}-${counter}`,
        uri: file.uri,
        filename: `video-${Date.now()}.mp4`,
        contentType: 'video/mp4',
        size: file.size && file.size > 0 ? file.size : 0,
        isVideo: true,
        durationMs: file.durationMs && file.durationMs > 0 ? Math.round(file.durationMs) : undefined,
        width: file.width ?? undefined,
        height: file.height ?? undefined,
      },
    };
  }
  const filename = file.filename?.trim() || 'dosya';
  const contentType = resolveContentType(filename, file.contentType);
  if (!contentType) {
    return { ok: false, errorKey: 'attachment.errors.UNSUPPORTED_TYPE' };
  }

  const size = file.size && file.size > 0 ? file.size : await readFileSize(file.uri);
  if (size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, errorKey: 'attachment.errors.FILE_TOO_LARGE' };
  }

  counter += 1;
  return {
    ok: true,
    draft: { key: `draft-${Date.now()}-${counter}`, uri: file.uri, filename, contentType, size },
  };
}
