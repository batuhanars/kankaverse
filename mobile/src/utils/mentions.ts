// Sprint M1a contract §4.4 — web/src/utils/mentions.ts deseni okunur, kopyalanmaz (aynı kurallar):
// `<@userId>` -> "@kullanıcıadı", `<@&roleId>` -> "@everyone". Ham token ekrana basılmaz.
// Tıklanabilir değil (contract) — düz metin dönüşümü, XSS riski yok (RN'de zaten innerHTML yok).
const MENTION_RE = /<@([a-zA-Z0-9_-]+)>/g;
const ROLE_MENTION_RE = /<@&[a-zA-Z0-9_-]+>/g;

export function formatMentionsPlain(
  content: string,
  resolve: (id: string) => string | undefined,
  fallback: string,
): string {
  return content
    .replace(ROLE_MENTION_RE, '@everyone')
    .replace(MENTION_RE, (_match, id: string) => '@' + (resolve(id) ?? fallback));
}
