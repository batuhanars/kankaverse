/**
 * Güvenli mesaj markdown render util.
 *
 * Güvenlik katmanları:
 *  1. markdown-it `html: false` — kullanıcı ham HTML'i kaçırılır (render edilmez).
 *  2. DOMPurify allowlist sanitize — markdown çıktısından yabancı etiket/attr strip edilir.
 *
 * Bahsetme (<@id>) akışı:
 *  - Markdown parse öncesi <@id> token'ları benzersiz yer-tutucu ile değiştirilir
 *    (markdown-it < > karakterlerini kaçırır; yer-tutucu bunu önler).
 *  - Markdown + DOMPurify sonrası yer-tutucular stilli mention span'lerine dönüştürülür.
 *  - Yer-tutucu formatı: \x02MENTION:id\x03  (Unicode kontrol char — kullanıcı metniyle çakışmaz)
 *
 * Desteklenen subset (§1 — başlık/tablo/resim KAPALI):
 *   **kalın** · *italik* · ~~üstü çizili~~ · `satıriçi kod` · ```kod bloğu```
 *   > alıntı · liste (- / * / 1.) · linkler (http/https) · satır sonu
 *
 * Sprint V2 Markdown Contract §0-§4 uyumlu.
 */

import MarkdownIt from 'markdown-it'
import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify'

// ────────────────────────────────────────────────────────────
// 1. markdown-it instance (bir kez oluştur — modül kapsamı)
// ────────────────────────────────────────────────────────────
const md = new MarkdownIt({
  html: false,      // ham HTML render etme — kaçır (güvenlik katmanı 1)
  linkify: true,    // URL'leri otomatik link'e çevir
  breaks: true,     // tek satır sonu → <br>
})

// Başlık kurallarını devre dışı bırak (# H1 / ## H2 …)
md.disable('heading')
// Tablo ve resim kurallarını devre dışı bırak
md.disable('image')
// Not: markdown-it çekirdeğinde 'table' ayrı kural; eklenmemişse disable sessizce geçer
try { md.disable('table') } catch { /* built-in yoksa ignore */ }

// ────────────────────────────────────────────────────────────
// 2. Link render kuralı override (güvenlik §1)
//    - yalnız http/https — javascript:/data: reddedilir
//    - target="_blank" rel="noopener noreferrer nofollow"
// ────────────────────────────────────────────────────────────
const SAFE_PROTOCOLS = /^https?:\/\//i

// validateLink: markdown-it linkify + [metin](url) için şema kontrolü
md.validateLink = (url: string): boolean => SAFE_PROTOCOLS.test(url.trim())

// link_open token render'ını override et
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  // href güvenlik kontrolü (validateLink zaten reddeder; bu ekstra güvence)
  const hrefIdx = token.attrIndex('href')
  if (hrefIdx >= 0) {
    const href = token.attrs![hrefIdx][1]
    if (!SAFE_PROTOCOLS.test(href.trim())) {
      token.attrs![hrefIdx][1] = '#'
    }
  }
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer nofollow')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

// ────────────────────────────────────────────────────────────
// 3. DOMPurify allowlist (güvenlik §2)
// ────────────────────────────────────────────────────────────
const PURIFY_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: [
    'b', 'strong', 'i', 'em', 'u', 's', 'del',
    'code', 'pre',
    'blockquote',
    'ul', 'ol', 'li',
    'a',
    'br', 'p',
    'span',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
}

// ────────────────────────────────────────────────────────────
// 4. Mention yer-tutucu sabitleri
//    \x02 (STX) ve \x03 (ETX) — kullanıcı girişinde imkânsız
// ────────────────────────────────────────────────────────────
const MENTION_RE = /<@([a-zA-Z0-9_-]+)>/g
// @everyone rol token'ı: <@&roleId> (& kullanıcı regex'ine takılmaz). Yalnız everyone önerilir.
const ROLE_MENTION_RE = /<@&[a-zA-Z0-9_-]+>/g
const EVERYONE_PLACEHOLDER = '\x02EVERYONE\x03'
const EVERYONE_PLACEHOLDER_RE = /\x02EVERYONE\x03/g
const PLACEHOLDER_PREFIX = '\x02MENTION:'
const PLACEHOLDER_SUFFIX = '\x03'

function toPlaceholder(id: string): string {
  return `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`
}

// Yer-tutucu algılama regex'i — sanitize sonrası güvenli (literal kontrol char'lar)
const PLACEHOLDER_RE = /\x02MENTION:([a-zA-Z0-9_-]+)\x03/g

/**
 * Mention span HTML'i üretir.
 * class'lar tailwind'siz; stil inline style ile değil CSS class + token — MDN tabanlı.
 * Gerçek stil MessageRow'daki mention span ile aynı görünümü hedefler.
 */
function mentionSpanHtml(username: string): string {
  // DOMPurify ALLOWED_TAGS'da span, ALLOWED_ATTR'da class var — güvenli
  return `<span class="kv-mention">@${escapeHtml(username)}</span>`
}

/** Minimal HTML kaçırma (mention username için) */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ────────────────────────────────────────────────────────────
// 5. Ana render fonksiyonu (dışa aktarılan)
// ────────────────────────────────────────────────────────────

/**
 * Mesaj içeriğini güvenli HTML'e dönüştürür.
 *
 * @param content    Ham mesaj string'i (kullanıcıdan gelir — güvenilmez)
 * @param resolve    userId → username çözümleyici (undefined → fallback)
 * @param fallback   Çözülemeyen mention için kullanıcı adı (ör. "bilinmeyen")
 * @returns          DOMPurify sanitize edilmiş, v-html'e güvenle verilecek HTML
 */
export function renderMessageHtml(
  content: string,
  resolve: (id: string) => string | undefined,
  fallback: string,
): string {
  if (!content) return ''

  // Adım 1: token'ları yer-tutucuyla değiştir (markdown'dan ÖNCE)
  // 1a: @everyone rol token'ı (<@&id>) → everyone yer-tutucu (id çözümüne gerek yok)
  const withEveryone = content.replace(ROLE_MENTION_RE, () => EVERYONE_PLACEHOLDER)
  // 1b: <@id> kullanıcı token'ları
  const mentionMap = new Map<string, string>()
  const withPlaceholders = withEveryone.replace(MENTION_RE, (_match, id: string) => {
    mentionMap.set(id, resolve(id) ?? fallback)
    return toPlaceholder(id)
  })

  // Adım 2: markdown render
  const rawHtml = md.render(withPlaceholders)

  // Adım 3: DOMPurify sanitize
  const cleanHtml = DOMPurify.sanitize(rawHtml, PURIFY_CONFIG) as unknown as string

  // Adım 4: yer-tutucuları stilli mention span'lerine çevir
  // (Sanitize sonrasında — span ve class allowlist'te olduğu için hayatta kalır)
  const finalHtml = cleanHtml
    .replace(EVERYONE_PLACEHOLDER_RE, () => '<span class="kv-mention kv-mention--everyone">@everyone</span>')
    .replace(PLACEHOLDER_RE, (_match, id: string) => {
      const username = mentionMap.get(id) ?? fallback
      return mentionSpanHtml(username)
    })

  return finalHtml
}
