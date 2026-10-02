// SDK 54'te `expo-file-system` yeni File/Directory API'sine geçti; `uploadAsync` LEGACY yolda kaldı.
// Yeni API'de doğrudan karşılığı yok, bu yüzden legacy içe aktarım bilinçli (aynı gerekçe
// `utils/imageUpload.ts`'te de yazılı — o dosya PROFİL yoluna ait, bu dosya MESAJ ekine).
import * as FileSystem from 'expo-file-system/legacy';
import { attachmentsApi } from '@/api/attachments';

/**
 * Sprint M3c §3 — mesaj eki yükleme yolu.
 *
 * `utils/imageUpload.ts` deseni referans alındı ama KOD PAYLAŞILMADI: o dosya profil-özel
 * (2 MB sınırı, `users` API'sinin görsel allowlist'i, sonda `PATCH /users/me`). Mesaj eki farklı
 * uçlara gider ve farklı sınırlara tabidir; ikisini tek fonksiyona sıkıştırmak "hangi sınır hangi
 * çağıran için" sorusunu belirsizleştirirdi.
 *
 * Akış sunucunun tanımladığı üç adımın ilk ikisi:
 *   1. `POST /attachments/presign` → presigned PUT URL + `attachmentId`
 *   2. dosyayı **doğrudan depolamaya** PUT (adım 3 = mesajı `attachmentIds` ile göndermek, çağıranda)
 */

/**
 * 🔴 Sunucunun allowlist'i ile BİREBİR (`attachments.service.ts` `ALLOWED_CONTENT_TYPES`).
 * İstemci aynı listeyi erken söyler; **otorite sunucudur** ve bu liste ondan GEVŞETİLEMEZ.
 * Video burada YOK — sunucu `video/*` kabul etmiyor (web `accept` özniteliği de aynı listede).
 */
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/zip',
  'application/vnd.rar',
  'application/x-7z-compressed',
] as const;

/**
 * Sunucu sınırı `MAX_UPLOAD_MB` config'inden gelir (varsayılan 25) ve istemciye taşınmaz.
 * Web de aynı varsayımı yapıyor (`attachment.errors.FILE_TOO_LARGE` metni "max 25 MB" diyor);
 * burada da 25 MB varsayılıyor. Sunucu daha düşük yapılandırılırsa 400 döner ve onun Türkçe
 * mesajı gösterilir — istemci tahmini yalnız erken uyarıdır, kapı değildir.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Bir mesaja bağlanabilen en fazla ek — sunucu `CreateMessageDto` `@ArrayMaxSize(10)`. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/** Seçilmiş ama henüz gönderilmemiş ek (kutunun altındaki şeritte duran taslak). */
export interface DraftAttachment {
  /** Yerel benzersiz anahtar — aynı dosya iki kez seçilebildiği için `uri` anahtar olamaz. */
  key: string;
  uri: string;
  filename: string;
  contentType: string;
  size: number;
  /** M6b — sesli mesaj kaydının süresi (ms); presign'a taşınır. Diğer eklerde yok. */
  durationMs?: number;
  /** M6b §7 — kayıt sırasında örneklenen dalga (base64, 64 bayt). */
  waveform?: string;
  /** Sesli mesaj taslağı: başarısız gönderimde ek şeridine DÜŞMEZ, atılır (M6b §7.5). */
  isVoice?: boolean;
  /**
   * 🔴 Yüklenmiş ekin sunucudaki kimliği. Kısmi başarısızlıkta DOLU kalır: kullanıcı tekrar
   * denediğinde başarılı olanlar YENİDEN yüklenmez (aynı dosyayı ikinci kez yüklemek hem veri
   * yakar hem sunucuda sahipsiz kayıt biriktirir).
   */
  uploadedId?: string;
}

const STORAGE_UPLOAD_ERROR = 'storage_upload_failed_';

const EXTENSION_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  // Düz metin ailesi. log/yml/yaml/ini için ayrı bir tür yok, hepsi text/plain — sunucunun
  // listesini büyütmeden uzantıyı tanımanın doğru yolu bu (dosya gerçekten düz metin).
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  log: 'text/plain',
  yml: 'text/plain',
  yaml: 'text/plain',
  ini: 'text/plain',
  // Arşiv. Uzantıdan türetmek burada ŞART: Android seçicisi zip için sık sık
  // `application/x-zip-compressed` ya da boş tür bildiriyor, ikisi de allowlist'te değil.
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
};

/**
 * Dosya adının uzantısından içerik türü çıkarır.
 *
 * Neden seçicinin bildirdiği türe güvenilmiyor: galeri/kamera bazen `image/*` gibi GENEL bir tür
 * bildiriyor ve sunucu allowlist'i onu reddediyor (`imageUpload.ts`'te aynı tuzak yaşandı).
 * Bildirilen tür allowlist'te ise o kullanılır, değilse uzantıya düşülür.
 */
export function resolveContentType(filename: string, reported?: string | null): string | null {
  if (reported && (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(reported)) return reported;
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  return EXTENSION_TYPES[ext] ?? null;
}

/** Yerel dosyanın byte cinsinden boyutu; okunamazsa 0 (sunucu yine de kendi sınırını uygular). */
export async function readFileSize(uri: string): Promise<number> {
  try {
    // Legacy API boyutu her zaman döner (ayrı bir `size` seçeneği yok).
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory ? (info.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * Tek eki yükler ve sunucudaki `attachmentId`'sini döner.
 *
 * 🔴 İkinci adımda `http` instance'ı KULLANILMAZ — presigned URL yetkiyi zaten taşıyor, oraya
 * `Authorization` başlığı göndermek token'ı üçüncü tarafa sızdırmak olurdu.
 */
export async function uploadDraftAttachment(draft: DraftAttachment): Promise<string> {
  const presign = await attachmentsApi.presign({
    filename: draft.filename,
    contentType: draft.contentType,
    size: draft.size,
    ...(draft.durationMs ? { durationMs: draft.durationMs } : {}),
    ...(draft.waveform ? { waveform: draft.waveform } : {}),
  });

  const res = await FileSystem.uploadAsync(presign.uploadUrl, draft.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': draft.contentType },
  });
  // Depolama 2xx dönmezse hata: sessizce başarılı sayılırsa mesaj boş bir nesneye işaret eden
  // kırık ekle giderdi.
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${STORAGE_UPLOAD_ERROR}${res.status}`);
  }

  return presign.attachmentId;
}

/**
 * Hata depolamaya PUT adımından mı geldi?
 *
 * Ayrımın sebebi: `presign` bizim sunucumuz, envelope'ında kullanıcıya gösterilecek **Türkçe
 * mesaj** var. Depolama üçüncü taraf; oradan gelen ham durum kodu ekrana basılmaz (kök CLAUDE.md),
 * onun yerine "yüklenemedi, mesaj gönderilmedi" denir.
 */
export function isStorageUploadError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith(STORAGE_UPLOAD_ERROR);
}
