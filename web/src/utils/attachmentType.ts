/**
 * Tarayıcının bildirdiği `File.type`'ı sunucunun kabul ettiği kanonik içerik türüne çevirir.
 *
 * Neden gerekiyor: `File.type` işletim sistemine kayıtlı MIME'dan geliyor ve bizim gönderdiğimiz
 * dosyaların çoğunda ya yanlış ya da BOŞ. Ölçülen örnekler:
 *  - `.md`, `.log`, `.yml` → `''` (boş dize) → sunucu `UNSUPPORTED_TYPE` döndürüyordu, sahibin
 *    "md gönderemiyoruz" bulgusunun kaynağı tam olarak buydu.
 *  - `.zip` → Windows Chrome'da `application/x-zip-compressed`, allowlist'te olan ad değil.
 *  - `.7z`, `.rar` → çoğu kurulumda yine `''`.
 *
 * Mobilde aynı sorun ve aynı çözüm var (`mobile/src/utils/attachmentUpload.ts`
 * `resolveContentType`). İki kopya bilinçli: ayrı paketler, ortak bir yer yok. **Üçüncü bir
 * istemci çıkmadan soyutlama arama** (Rule of Three); ama biri değişirse ikisi birlikte değişir.
 *
 * 🔴 Bu bir kapı DEĞİL, ad düzeltmesidir. Otorite sunucudadır (`attachments.service.ts`
 * `ALLOWED_CONTENT_TYPES`) ve buradaki liste ondan GEVŞETİLEMEZ.
 */

/** Sunucunun allowlist'i ile birebir. */
const ALLOWED = new Set([
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
])

/** Uzantı → kanonik tür. log/yml/yaml/ini düz metin, ayrı bir türe ihtiyaçları yok. */
const BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  log: 'text/plain',
  yml: 'text/plain',
  yaml: 'text/plain',
  ini: 'text/plain',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
}

/** Dosya seçicide gösterilecek `accept` değeri: türler + uzantılar (boş `File.type` yüzünden ikisi de). */
export const ATTACHMENT_ACCEPT = [
  ...ALLOWED,
  ...Object.keys(BY_EXTENSION).map((e) => `.${e}`),
].join(',')

/**
 * Bildirilen tür allowlist'teyse o kullanılır, değilse uzantıdan türetilir.
 * Hiçbiri tutmuyorsa `null` → çağıran dosyayı reddeder (sunucuya gitmeden erken uyarı).
 */
export function resolveContentType(filename: string, reported?: string | null): string | null {
  if (reported && ALLOWED.has(reported)) return reported
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
  return BY_EXTENSION[ext] ?? null
}
