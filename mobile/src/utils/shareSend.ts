import { messagesApi, type MessageDto } from '@/api/messages';
import { extractErrorMessage } from '@/api/errors';
import { buildDraftAttachment } from '@/components/message/attachmentDraft';
import { isStorageUploadError, uploadDraftAttachment } from '@/utils/attachmentUpload';
import { prepareVideoDraft, VideoPrepareError } from '@/utils/videoPrepare';
import type { SharedFile } from '@/stores/shareIntent';
import { t } from '@/i18n';

/**
 * C41 - Paylaşım ekranının gönderim hattı. Yeni yükleme/gönderme kodu YOK: taslak kurma ve erken
 * kontrol (`buildDraftAttachment`), video hazırlama (`prepareVideoDraft`), presign + PUT
 * (`uploadDraftAttachment`) ve mesaj (`messagesApi.send`) sohbet ekranındakilerin aynısı.
 * Kapılar (yükleme bayrağı, e-posta doğrulama, boyut/tür, DM engeli, yazma izni, yavaş mod)
 * sunucuda; istemci yalnız dönen Türkçe mesajı gösterir.
 */
export interface ShareFailure {
  /** Kullanıcıya gösterilecek ad (dosya adı); loglanmaz. */
  name: string;
  reason: string;
}

export interface ShareResult {
  /** Mesaj gönderildi mi (en az bir ek ya da metin). */
  sent: MessageDto | null;
  failures: ShareFailure[];
  /** Mesaj adımı patladıysa kullanıcıya gösterilecek metin (dosya hataları `failures`ta). */
  sendError: string | null;
}

/** Aynı dosya yeniden denemede tekrar yüklenmesin: `SharedFile.uri` -> sunucudaki ek kimliği. */
export type UploadedMap = Map<string, string>;

/** Erken kontrolün (tür / boyut / süre) i18n anahtarlı reddi. */
class ItemRejected extends Error {
  constructor(public readonly key: string) {
    super(key);
  }
}

function failureReason(e: unknown): string {
  if (e instanceof ItemRejected || e instanceof VideoPrepareError) return t(e.key);
  if (isStorageUploadError(e)) return t('mobile.attach.uploadFailed');
  return extractErrorMessage(e);
}

async function uploadOne(
  file: SharedFile,
  onLabel: (label: string) => void,
  position: { done: number; total: number },
): Promise<string> {
  const isVideo = !!file.mimeType?.startsWith('video/');
  const built = await buildDraftAttachment({
    uri: file.uri,
    filename: file.fileName,
    contentType: file.mimeType,
    size: file.size,
    isVideo,
    durationMs: file.durationMs,
    width: file.width,
    height: file.height,
  });
  if (!built.ok) throw new ItemRejected(built.errorKey);
  let draft = built.draft;
  onLabel(t('mobile.attach.uploading', position));
  if (draft.isVideo && !draft.prepared) {
    draft = await prepareVideoDraft(draft, (pct) => onLabel(t('mobile.video.preparing', { pct })));
    onLabel(t('mobile.attach.uploading', position));
  }
  return uploadDraftAttachment(draft);
}

/**
 * Dosyaları sırayla yükler (tek tek hata yakalanır: biri patlarsa diğerleri gider), başarılı
 * olanları tek mesajda `note` ile gönderir. Hiç ek yüklenemediyse mesaj GÖNDERİLMEZ (boş not
 * tek başına anlamsız). Metin paylaşımında `files` boştur, yalnız `note` gider.
 */
export async function sendShare(args: {
  channelId: string;
  files: SharedFile[];
  note: string;
  uploaded: UploadedMap;
  onLabel: (label: string) => void;
}): Promise<ShareResult> {
  const { channelId, files, note, uploaded, onLabel } = args;
  const failures: ShareFailure[] = [];

  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    if (uploaded.has(f.uri)) continue;
    try {
      uploaded.set(f.uri, await uploadOne(f, onLabel, { done: i + 1, total: files.length }));
    } catch (e) {
      failures.push({ name: f.fileName ?? t('mobile.share.fileFallback'), reason: failureReason(e) });
    }
  }

  const attachmentIds = files.map((f) => uploaded.get(f.uri)).filter((id): id is string => !!id);
  if (files.length > 0 && attachmentIds.length === 0) return { sent: null, failures, sendError: null };

  try {
    const sent = await messagesApi.send(channelId, note.trim(), undefined, attachmentIds);
    return { sent, failures, sendError: null };
  } catch (e) {
    return { sent: null, failures, sendError: extractErrorMessage(e) };
  }
}
