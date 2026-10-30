import { BadRequestException } from '@nestjs/common';

/**
 * C35 §2.5 — saklanan embed biçimi. Yalnız bu alanlar yazılır; `image`, `thumbnail`, `video`,
 * `author.icon_url`, `footer.icon_url` ve diğer her şey ATILIR (§0.4 harici görsel yok:
 * taranmamış, minörün gördüğü yüzeye dışarıdan görsel çekmek demek).
 */
export interface StoredEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: { name: string; url?: string };
  fields?: { name: string; value: string; inline: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

export const MAX_EMBEDS = 5;
const MAX_FIELDS = 10;
const MAX_TOTAL_CHARS = 6000;

function invalid(reason: string): never {
  throw new BadRequestException({
    message: `Embed geçersiz: ${reason}`,
    error: 'INVALID_EMBED',
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Boş/yok → undefined; metin değilse ya da sınır aşılırsa 400. Sessiz kırpma YOK. */
function optText(v: unknown, max: number, label: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') invalid(`${label} metin olmalı`);
  if (v.length > max) invalid(`${label} en fazla ${max} karakter olabilir`);
  return v;
}

function reqText(v: unknown, max: number, label: string): string {
  const text = optText(v, max, label);
  if (text === undefined) invalid(`${label} zorunlu`);
  return text;
}

function optHttpUrl(v: unknown, label: string): string | undefined {
  const text = optText(v, 2048, label);
  if (text === undefined) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return invalid(`${label} geçerli bir adres olmalı`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    invalid(`${label} yalnız http:// veya https:// olabilir`);
  }
  return text;
}

function parseOne(raw: unknown): { embed: StoredEmbed; chars: number } | null {
  if (!isObject(raw)) invalid('her embed bir nesne olmalı');
  const embed: StoredEmbed = {};
  let chars = 0;

  const title = optText(raw.title, 256, 'title');
  if (title !== undefined) {
    embed.title = title;
    chars += title.length;
  }
  const description = optText(raw.description, 2000, 'description');
  if (description !== undefined) {
    embed.description = description;
    chars += description.length;
  }
  const url = optHttpUrl(raw.url, 'url');
  if (url !== undefined) embed.url = url;

  if (raw.color !== undefined && raw.color !== null) {
    if (typeof raw.color !== 'number' || !Number.isInteger(raw.color)) {
      invalid('color tam sayı olmalı');
    }
    if (raw.color < 0 || raw.color > 0xffffff) invalid('color 0 ile 16777215 arasında olmalı');
    embed.color = raw.color;
  }

  if (raw.author !== undefined && raw.author !== null) {
    if (!isObject(raw.author)) invalid('author nesne olmalı');
    const name = reqText(raw.author.name, 256, 'author.name');
    const authorUrl = optHttpUrl(raw.author.url, 'author.url');
    embed.author = authorUrl ? { name, url: authorUrl } : { name };
    chars += name.length;
  }

  if (raw.fields !== undefined && raw.fields !== null) {
    if (!Array.isArray(raw.fields)) invalid('fields liste olmalı');
    if (raw.fields.length > MAX_FIELDS) invalid(`en fazla ${MAX_FIELDS} alan olabilir`);
    embed.fields = raw.fields.map((f: unknown) => {
      if (!isObject(f)) invalid('her alan bir nesne olmalı');
      const name = reqText(f.name, 256, 'fields.name');
      const value = reqText(f.value, 1024, 'fields.value');
      chars += name.length + value.length;
      return { name, value, inline: f.inline === true };
    });
  }

  if (raw.footer !== undefined && raw.footer !== null) {
    if (!isObject(raw.footer)) invalid('footer nesne olmalı');
    const text = reqText(raw.footer.text, 256, 'footer.text');
    embed.footer = { text };
    chars += text.length;
  }

  if (raw.timestamp !== undefined && raw.timestamp !== null && raw.timestamp !== '') {
    if (typeof raw.timestamp !== 'string') invalid('timestamp metin olmalı');
    const ms = Date.parse(raw.timestamp);
    if (Number.isNaN(ms)) invalid('timestamp ISO-8601 olmalı');
    embed.timestamp = new Date(ms).toISOString();
  }

  // Yalnız atılan alanlardan (ör. sadece image) oluşan embed boş kalır → hiç saklanmaz.
  return Object.keys(embed).length === 0 ? null : { embed, chars };
}

/**
 * Gövdedeki `embeds` alanını doğrular ve izinli alt kümeye indirger. Sınır aşımı 400 INVALID_EMBED
 * (Discord da reddeder). `texts` automod'a gidecek TÜM embed metinlerini döndürür.
 */
export function parseEmbeds(raw: unknown): { embeds: StoredEmbed[]; texts: string[] } {
  if (raw === undefined || raw === null) return { embeds: [], texts: [] };
  if (!Array.isArray(raw)) invalid('embeds liste olmalı');
  if (raw.length > MAX_EMBEDS) invalid(`en fazla ${MAX_EMBEDS} embed gönderilebilir`);

  const embeds: StoredEmbed[] = [];
  let total = 0;
  for (const item of raw as unknown[]) {
    const parsed = parseOne(item);
    if (!parsed) continue;
    embeds.push(parsed.embed);
    total += parsed.chars;
  }
  if (total > MAX_TOTAL_CHARS) invalid(`toplam metin ${MAX_TOTAL_CHARS} karakteri aşamaz`);

  return { embeds, texts: embeds.flatMap(embedTexts) };
}

/** Embed içindeki kullanıcıya görünen tüm metinler (automod girdisi). */
export function embedTexts(e: StoredEmbed): string[] {
  return [
    e.title,
    e.description,
    e.author?.name,
    e.footer?.text,
    ...(e.fields ?? []).flatMap((f) => [f.name, f.value]),
  ].filter((t): t is string => typeof t === 'string' && t.length > 0);
}
