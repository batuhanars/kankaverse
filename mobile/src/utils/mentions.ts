// Sprint M1a contract §4.4 — web/src/utils/mentions.ts deseni okunur, kopyalanmaz (aynı kurallar):
// `<@userId>` -> "@kullanıcıadı", `<@&roleId>` -> "@everyone". Ham token ekrana basılmaz.
// Tıklanabilir değil (contract) — düz metin dönüşümü, XSS riski yok (RN'de zaten innerHTML yok).
//
// Sprint M2d R1 (sahip bulgusu 2026-08-03) — bahsetmeler mobilde düz yazı rengindeydi, web'de ise
// Kor aksanlı (`.kv-mention`: accentSubtle zemin + accent500 metin). Ayrıştırma tek yerde kalsın
// diye metin bölme (`splitMentions`) çekirdek fonksiyon oldu; `formatMentionsPlain` onun üzerine
// ince bir sarmalayıcı — iki ayrı regex hattı tutmuyoruz.

/** Hem kullanıcı (`<@id>`) hem rol (`<@&id>`) token'ını yakalar; grup 1 dolu ise rol. */
const ANY_MENTION_RE = /<@(&?)([a-zA-Z0-9_-]+)>/g;

/**
 * R15 — rol adının başına '@' koy, zaten '@' ile başlıyorsa tekrarlama.
 * everyone rolünün adı veritabanında zaten "@everyone" (web `utils/mentions.ts` ikizi).
 */
export function prefixRoleName(name: string): string {
  return name.startsWith('@') ? name : `@${name}`;
}

export interface MentionSegment {
  text: string;
  /** true → bahsetme parçası (vurgulu çizilir), false → sıradan metin */
  isMention: boolean;
}

/**
 * İçeriği "sıradan metin" ve "bahsetme" parçalarına böler. Çağıran her parçayı kendi stiliyle
 * çizer; böylece tek bir `<Text>` içinde iç içe vurgulu parçalar oluşur.
 *
 * R15 — rol token'ı `resolveRole` ile gerçek rol adına çözülür (eskiden sabit "@everyone" yazıyordu).
 */
export function splitMentions(
  content: string,
  resolve: (id: string) => string | undefined,
  fallback: string,
  /** R15 — roleId → rol adı. Verilmezse rol token'ı "@rol" yedeğine düşer. */
  resolveRole?: (roleId: string) => string | undefined,
): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // exec döngüsü paylaşılan `lastIndex` tutuyor; regex modül seviyesinde olduğu için sıfırlanır.
  ANY_MENTION_RE.lastIndex = 0;
  while ((match = ANY_MENTION_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index), isMention: false });
    }
    const isRole = match[1] === '&';
    let text: string;
    if (isRole) {
      // R15 — artık SABİT "@everyone" değil; çözülemezse nötr "@rol" yedeği
      const roleName = resolveRole?.(match[2]);
      text = roleName ? prefixRoleName(roleName) : '@rol';
    } else {
      text = `@${resolve(match[2]) ?? fallback}`;
    }
    segments.push({ text, isMention: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), isMention: false });
  }
  return segments;
}

/** Düz metin karşılığı — önizleme/alıntı gibi tek satırlık, stilsiz yüzeyler için. */
export function formatMentionsPlain(
  content: string,
  resolve: (id: string) => string | undefined,
  fallback: string,
  resolveRole?: (roleId: string) => string | undefined,
): string {
  return splitMentions(content, resolve, fallback, resolveRole)
    .map((s) => s.text)
    .join('');
}
