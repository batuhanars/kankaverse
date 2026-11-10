// UTF-8: yerleşik TextEncoder/TextDecoder varsa o, yoksa küçük saf JS karşılığı. Erişim TEMBEL (modül
// yüklenirken değil): Hermes'te bu global'lerin varlığı/`fatal` desteği garanti değil, modül seviyesinde
// çağrı uygulamayı açılışta çökertirdi. Yeni bağımlılık yok.

export class InvalidUtf8Error extends Error {}

let decoder: TextDecoder | null | undefined // null = yerleşik yok/yetersiz
let encoder: TextEncoder | null | undefined

function builtinDecoder(): TextDecoder | null {
  if (decoder !== undefined) return decoder
  decoder = null
  try {
    if (typeof TextDecoder === 'function') {
      const d = new TextDecoder('utf-8', { fatal: true })
      // `fatal` desteği DENENİR: yok sayan bir uygulama geçersiz diziyi sessizce U+FFFD'ye çevirirdi.
      let rejects = false
      try {
        d.decode(new Uint8Array([0xff]))
      } catch {
        rejects = true
      }
      if (rejects) decoder = d
    }
  } catch {
    decoder = null
  }
  return decoder
}

function builtinEncoder(): TextEncoder | null {
  if (encoder !== undefined) return encoder
  try {
    encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null
  } catch {
    encoder = null
  }
  return encoder
}

/** Hangi yol seçildi (mobil başlangıç logu için). */
export const utf8Path = (): 'builtin' | 'pure' => (builtinDecoder() ? 'builtin' : 'pure')

/** Katı UTF-8 çözücü (`fatal:true` ile aynı): geçersiz dizi, aşırı uzun kodlama, vekil, >U+10FFFF → hata. */
export function strictUtf8Decode(b: Uint8Array): string {
  const cps: number[] = []
  let i = 0
  while (i < b.length) {
    const c = b[i]
    if (c < 0x80) {
      cps.push(c)
      i++
      continue
    }
    let need: number
    let cp: number
    let min: number
    if (c >= 0xc2 && c <= 0xdf) {
      need = 1
      cp = c & 0x1f
      min = 0x80
    } else if (c >= 0xe0 && c <= 0xef) {
      need = 2
      cp = c & 0x0f
      min = 0x800
    } else if (c >= 0xf0 && c <= 0xf4) {
      need = 3
      cp = c & 0x07
      min = 0x10000
    } else {
      throw new InvalidUtf8Error('geçersiz baş bayt') // 0x80-0xC1 (0xC0/0xC1 aşırı uzun) ve 0xF5+
    }
    if (i + need >= b.length) throw new InvalidUtf8Error('kesik dizi')
    for (let k = 1; k <= need; k++) {
      const cc = b[i + k]
      if ((cc & 0xc0) !== 0x80) throw new InvalidUtf8Error('geçersiz devam baytı')
      cp = (cp << 6) | (cc & 0x3f)
    }
    if (cp < min) throw new InvalidUtf8Error('aşırı uzun kodlama')
    if (cp > 0x10ffff) throw new InvalidUtf8Error('U+10FFFF üstü')
    if (cp >= 0xd800 && cp <= 0xdfff) throw new InvalidUtf8Error('vekil kod noktası')
    cps.push(cp)
    i += need + 1
  }
  if (cps[0] === 0xfeff) cps.shift() // TextDecoder varsayılanı gibi baştaki BOM atılır
  let s = ''
  for (let k = 0; k < cps.length; k += 0x2000) s += String.fromCodePoint(...cps.slice(k, k + 0x2000))
  return s
}

/** Saf UTF-8 kodlayıcı; eşleşmemiş vekil U+FFFD olur (TextEncoder ile aynı). */
export function pureUtf8Encode(str: string): Uint8Array {
  const out: number[] = []
  for (const ch of str) {
    let cp = ch.codePointAt(0)!
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
  }
  return Uint8Array.from(out)
}

export const utf8 = (s: string): Uint8Array => builtinEncoder()?.encode(s) ?? pureUtf8Encode(s)

export function fromUtf8(b: Uint8Array): string {
  const d = builtinDecoder()
  return d ? d.decode(b) : strictUtf8Decode(b)
}

/** Yalnız test: globalThis.TextDecoder değiştirildikten sonra yol seçimi yeniden yapılsın. */
export function resetUtf8PathForTests(): void {
  decoder = undefined
  encoder = undefined
}
