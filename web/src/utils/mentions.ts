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
// Rol token'ı (<@&id>) — R15'e kadar SABİT "@everyone" yazılıyordu; artık id çözülür.
const ROLE_MENTION_RE = /<@&([a-zA-Z0-9_-]+)>/g

/**
 * R15 — rol adının başına '@' koy, ama zaten '@' ile başlıyorsa tekrarlama.
 * everyone rolünün adı veritabanında zaten "@everyone" (guilds.service oluştururken öyle yazıyor),
 * naif birleştirme "@@everyone" üretirdi.
 */
export function prefixRoleName(name: string): string {
  return name.startsWith('@') ? name : `@${name}`
}

export function formatMentionsPlain(
  content: string,
  resolve: (id: string) => string | undefined,
  fallback: string,
  /** R15 — roleId → rol adı. Verilmezse rol token'ı "@rol" yedeğine düşer. */
  resolveRole?: (roleId: string) => string | undefined,
): string {
  return content
    .replace(ROLE_MENTION_RE, (_match, roleId: string) => {
      const name = resolveRole?.(roleId)
      return name ? prefixRoleName(name) : '@rol'
    })
    .replace(MENTION_RE, (_match, id: string) => {
      return '@' + (resolve(id) ?? fallback)
    })
}
