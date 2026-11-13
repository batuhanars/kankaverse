// E2 Rev.2 §4.2: şifreli mesajda bahsedilen kullanıcı kimlikleri düz üst veri olarak gider. Liste, GÖNDERİLEN düz
// metindeki `<@id>` token'larından üretilir (composer'ın biçimi: `<@kullanıcıKimliği>`; rol `<@&id>` buna takılmaz).
// Sunucu üye olmayanı ve göndereni atar; burada yalnız tekilleştirme ve üst sınır var.
const MENTION_RE = /<@([a-zA-Z0-9_-]+)>/g

/** api `E2EE_MENTION_IDS_MAX` ile aynı: fazlası gönderimde 400 olurdu, sessizce kesilir. */
export const MAX_MENTION_IDS = 20

export function mentionIdsOf(text: string): string[] {
  const ids = new Set<string>()
  for (const m of text.matchAll(MENTION_RE)) {
    ids.add(m[1])
    if (ids.size === MAX_MENTION_IDS) break
  }
  return [...ids]
}
