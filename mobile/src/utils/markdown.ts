// C56 §3 — web/src/utils/markdown.ts'in mobil ikizi. Aynı ayrıştırıcı (markdown-it 14) ve aynı kurallar:
// html kapalı, linkify açık, breaks açık, resim/tablo/lheading kapalı, link yalnız http/https, başlık
// h1-h3 (h4-h6 → h3). Fark: HTML üretilmez; `md.parse()` token akışı RN'in çizeceği bir ağaca çevrilir.
//
// Bahsetme: web'deki yer-tutucu yöntemi. Parse ÖNCESİ `<@id>`/`<@&id>` kontrol karakterli yer-tutucuya
// çevrilir (markdown-it `<` `>` ile uğraşmasın), metin düğümlerinde (kod dahil, web de öyle) geri
// `<@id>`'ye çevrilip mevcut `splitMentions` ile çözülür. Çözümleyiciler ağaca GÖMÜLMEZ: ağaç yalnız
// içeriğe bağlı (önbelleklenebilir), çözümleme çizimde yapılır.

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

// ── Ağaç tipleri ──────────────────────────────────────────────────────────────

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  /** Yalnız http/https; doğrulama `md.validateLink` + `safeHref` ile çifte. */
  href?: string;
}

export type MdBlock =
  | { type: 'paragraph'; runs: InlineRun[] }
  | { type: 'heading'; level: 1 | 2 | 3; runs: InlineRun[] }
  | { type: 'quote'; children: MdBlock[] }
  | { type: 'list'; ordered: boolean; start: number; items: MdBlock[][] }
  | { type: 'code'; text: string };

// ── markdown-it örneği (web ile aynı ayarlar) ─────────────────────────────────

const SAFE_PROTOCOLS = /^https?:\/\//i;

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
// lheading kapalı: "Metin\n---" yanlışlıkla dev başlık üretmesin (sözleşme §2). Başlık (#) AÇIK.
md.disable(['image', 'table', 'lheading']);
md.validateLink = (url: string): boolean => SAFE_PROTOCOLS.test(url.trim());

// ── Bahsetme yer-tutucuları (web ile aynı biçim) ──────────────────────────────

const USER_TOKEN_RE = /<@([a-zA-Z0-9_-]+)>/g;
const ROLE_TOKEN_RE = /<@&([a-zA-Z0-9_-]+)>/g;
const USER_PLACEHOLDER_RE = /\x02MENTION:([a-zA-Z0-9_-]+)\x03/g;
const ROLE_PLACEHOLDER_RE = /\x02ROLE:([a-zA-Z0-9_-]+)\x03/g;

function protectMentions(content: string): string {
  return content
    .replace(ROLE_TOKEN_RE, (_m, id: string) => `\x02ROLE:${id}\x03`)
    .replace(USER_TOKEN_RE, (_m, id: string) => `\x02MENTION:${id}\x03`);
}

/** Metin düğümündeki yer-tutucuları `<@id>` / `<@&id>` biçimine geri çevirir (`splitMentions` girdisi). */
export function restoreMentions(text: string): string {
  return text
    .replace(ROLE_PLACEHOLDER_RE, (_m, id: string) => `<@&${id}>`)
    .replace(USER_PLACEHOLDER_RE, (_m, id: string) => `<@${id}>`);
}

// ── Token akışı → ağaç ────────────────────────────────────────────────────────

interface Marks {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  href?: string;
}

function inlineRuns(children: Token[]): InlineRun[] {
  const runs: InlineRun[] = [];
  const marks: Marks = { bold: false, italic: false, strike: false };
  const push = (run: InlineRun) => {
    if (!run.text) return;
    runs.push({
      ...run,
      ...(marks.bold && { bold: true }),
      ...(marks.italic && { italic: true }),
      ...(marks.strike && { strike: true }),
      ...(marks.href && { href: marks.href }),
    });
  };
  for (const tok of children) {
    switch (tok.type) {
      case 'text':
        push({ text: tok.content });
        break;
      case 'code_inline':
        push({ text: tok.content, code: true });
        break;
      // breaks:true → web'de softbreak da <br>; ikisi de satır sonu.
      case 'softbreak':
      case 'hardbreak':
        push({ text: '\n' });
        break;
      case 'strong_open':
        marks.bold = true;
        break;
      case 'strong_close':
        marks.bold = false;
        break;
      case 'em_open':
        marks.italic = true;
        break;
      case 'em_close':
        marks.italic = false;
        break;
      case 's_open':
        marks.strike = true;
        break;
      case 's_close':
        marks.strike = false;
        break;
      case 'link_open': {
        const href = tok.attrGet('href')?.trim() ?? '';
        marks.href = SAFE_PROTOCOLS.test(href) ? href : undefined;
        break;
      }
      case 'link_close':
        marks.href = undefined;
        break;
      default:
        // image (kapalı) / html_inline (kapalı) gelmez; gelirse düz içeriğe düş.
        if (tok.content) push({ text: tok.content });
    }
  }
  return runs;
}

/** `tokens[i]` açılış token'ıysa eşleşen kapanışın indeksini döndürür (iç içe nesting dikkate alınır). */
function closeIndex(tokens: Token[], i: number): number {
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    depth += tokens[j].nesting;
    if (depth === 0) return j;
  }
  return tokens.length - 1;
}

function blocksOf(tokens: Token[]): MdBlock[] {
  const out: MdBlock[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    switch (tok.type) {
      case 'paragraph_open': {
        out.push({ type: 'paragraph', runs: inlineRuns(tokens[i + 1]?.children ?? []) });
        i = closeIndex(tokens, i) + 1;
        break;
      }
      case 'heading_open': {
        // h4-h6 → h3 (sözleşme §0.1)
        const level = Math.min(Number(tok.tag.slice(1)) || 3, 3) as 1 | 2 | 3;
        out.push({ type: 'heading', level, runs: inlineRuns(tokens[i + 1]?.children ?? []) });
        i = closeIndex(tokens, i) + 1;
        break;
      }
      case 'blockquote_open': {
        const end = closeIndex(tokens, i);
        out.push({ type: 'quote', children: blocksOf(tokens.slice(i + 1, end)) });
        i = end + 1;
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const end = closeIndex(tokens, i);
        const items: MdBlock[][] = [];
        let j = i + 1;
        while (j < end) {
          const itemEnd = closeIndex(tokens, j);
          items.push(blocksOf(tokens.slice(j + 1, itemEnd)));
          j = itemEnd + 1;
        }
        const ordered = tok.type === 'ordered_list_open';
        out.push({ type: 'list', ordered, start: ordered ? Number(tok.attrGet('start') ?? 1) || 1 : 1, items });
        i = end + 1;
        break;
      }
      case 'fence':
      case 'code_block':
        out.push({ type: 'code', text: tok.content.replace(/\n$/, '') });
        i += 1;
        break;
      default:
        // hr: web'de <hr> allowlist dışı, çıktıdan düşer → burada da çizilmez.
        i += 1;
    }
  }
  return out;
}

/** Ham mesaj içeriğini RN'in çizeceği blok ağacına çevirir. Saf; aynı girdi → aynı ağaç. */
export function parseMarkdown(content: string): MdBlock[] {
  if (!content) return [];
  return blocksOf(md.parse(protectMentions(content), {}));
}

/** Son blok düz metinle bitiyorsa (paragraf/başlık) saat o satırın sonuna oturabilir. */
export function endsWithTextBlock(blocks: MdBlock[]): boolean {
  const last = blocks[blocks.length - 1];
  return !!last && (last.type === 'paragraph' || last.type === 'heading');
}
