// Mesaj metnindeki bağlantıları ayırır (web `utils/markdown.ts` linkify karşılığı, aynı güvenlik kuralı):
// yalnız http/https ve `www.` ile başlayan adresler bağlantı sayılır; javascript:/data: gibi şemalar
// hiç eşleşmez. Yeni paket eklememek için tek regex (linkify-it'in tam TLD listesi yok, bilinçli).

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** Cümle sonu noktalaması bağlantıya dahil edilmez: "bak: https://x.com." → nokta dışarıda. */
const TRAILING_PUNCT_RE = /[.,!?;:'"*_~]+$/;

export interface LinkSegment {
  text: string;
  /** Açılacak tam adres (`www.` → `https://` eklenmiş). Yoksa düz metin. */
  url?: string;
}

function trimTrailing(raw: string): string {
  let s = raw.replace(TRAILING_PUNCT_RE, '');
  // Parantez içine yazılmış bağlantı: "(https://x.com)" → kapanış parantezi adrese ait değil.
  while (s.endsWith(')') && (s.match(/\(/g)?.length ?? 0) < (s.match(/\)/g)?.length ?? 0)) {
    s = s.slice(0, -1).replace(TRAILING_PUNCT_RE, '');
  }
  return s;
}

export function splitLinks(content: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(content)) !== null) {
    const text = trimTrailing(match[0]);
    // "www." tek başına ya da "https://" boş kaldıysa bağlantı değil.
    if (!/^(?:https?:\/\/[^\s/]+|www\.[^\s.]+\.\S+)/i.test(text)) continue;
    if (match.index > lastIndex) segments.push({ text: content.slice(lastIndex, match.index) });
    const url = /^www\./i.test(text) ? `https://${text}` : text;
    segments.push({ text, url });
    lastIndex = match.index + text.length;
    URL_RE.lastIndex = lastIndex;
  }
  if (lastIndex < content.length) segments.push({ text: content.slice(lastIndex) });
  return segments;
}
