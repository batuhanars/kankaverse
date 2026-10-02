/**
 * Ek-yalnız mesajın önizleme metni (DM push gövdesi, DM listesi önizlemesi).
 * İçerik doluysa AYNEN döner; boşsa eklerden üretilir. Öncelik: ses > görsel > dosya.
 * Ek de yoksa boş string.
 */
export function previewFromAttachments(
  content: string | null | undefined,
  attachments: ReadonlyArray<{ contentType: string }> | null | undefined,
): string {
  if (content && content.trim().length > 0) return content;
  if (!attachments || attachments.length === 0) return '';
  if (attachments.some((a) => a.contentType.startsWith('audio/'))) return '🎤 Sesli mesaj';
  if (attachments.some((a) => a.contentType.startsWith('image/'))) return '📷 Görsel';
  return '📎 Dosya';
}
