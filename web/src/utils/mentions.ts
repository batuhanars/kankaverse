/**
 * Düz-metin mention çözümleyici.
 * MessageRow'un pill render'ına dokunmaz — yalnız düz-metin önizlemeler için.
 *
 * <@id> token'larını "@kullanıcıadı"'na dönüştürür.
 * - resolve(id) → kullanıcı adı döndürürse "@kullanıcıadı" olur
 * - Bilinmeyen id → "@{fallback}" (ör. "@bilinmeyen")
 * - Saf string dönüşümü: XSS riski yok (innerHTML kullanılmaz)
 */
const MENTION_RE = /<@([a-zA-Z0-9_-]+)>/g

export function formatMentionsPlain(
  content: string,
  resolve: (id: string) => string | undefined,
  fallback: string,
): string {
  return content.replace(MENTION_RE, (_match, id: string) => {
    return '@' + (resolve(id) ?? fallback)
  })
}
