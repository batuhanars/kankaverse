/**
 * İndirme başlığı (`Content-Disposition: attachment`) için güvenli dosya adı inşası (C15).
 * Saf TS helper: S3 `ResponseContentDisposition` değeri olarak imzalı adrese gömülür.
 */

// Kontrol karakterleri, çift tırnak, ters bölü, bölü: başlığı bozar ya da yol ayrımı sızdırır.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f"\\/]/g;
// Eşleşmemiş vekil (surrogate) karakter encodeURIComponent'i patlatır.
const LONE_SURROGATES = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Kayıtlı dosya adını temizler; boş kalırsa `fallback` döner. */
export function sanitizeDownloadFilename(filename: string, fallback: string): string {
  const cleaned = (filename ?? '').replace(LONE_SURROGATES, '').replace(UNSAFE_CHARS, '').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/** RFC 5987 `attr-char` dışını yüzde ile kodlar (encodeURIComponent'in bıraktığı ' ( ) * ! dahil). */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * `attachment; filename="<ascii yedek>"; filename*=UTF-8''<RFC 5987 kodlu ad>`.
 * ASCII yedekte ASCII dışı (ve yazdırılamaz) her kod noktası `_` olur.
 */
export function buildAttachmentContentDisposition(filename: string, fallback: string): string {
  const safe = sanitizeDownloadFilename(filename, fallback);
  const ascii = Array.from(safe)
    .map((ch) => (ch >= ' ' && ch <= '~' ? ch : '_'))
    .join('');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(safe)}`;
}
