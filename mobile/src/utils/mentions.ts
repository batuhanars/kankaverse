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

export interface MentionSegment {
  text: string;
  /** true → bahsetme parçası (vurgulu çizilir), false → sıradan metin */
  isMention: boolean;
}

/**
 * İçeriği "sıradan metin" ve "bahsetme" parçalarına böler. Çağıran her parçayı kendi stiliyle
 * çizer; böylece tek bir `<Text>` içinde iç içe vurgulu parçalar oluşur.
 *
 * 🔴 Rol token'ı bugün HER ZAMAN "@everyone" olarak çözülüyor — bu bilinen bir eksik, R15 rol
 * bahsetmelerini getirince gerçek rol adı gelecek (sözleşme §8).
 */
export function splitMentions(
  content: string,
  resolve: (id: string) => string | undefined,
  fallback: string,
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
    segments.push({
      text: isRole ? '@everyone' : `@${resolve(match[2]) ?? fallback}`,
      isMention: true,
    });
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
): string {
  return splitMentions(content, resolve, fallback)
    .map((s) => s.text)
    .join('');
}
