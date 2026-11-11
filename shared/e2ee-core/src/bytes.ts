// Küçük bayt yardımcıları. Node'a özel modül yok (Hermes uyumlu).

// UTF-8 yardımcıları utf8.ts'te (tembel, Hermes'te TextDecoder yoksa saf JS).
export { fromUtf8, utf8 } from './utf8'

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

/** Sabit zamanlı bayt eşitliği (anahtar karşılaştırmalarında zamanlama sızıntısı olmasın). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standart base64 (dolgulu). btoa/Buffer yok (Hermes): saf JS. */
export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? B64[n & 63] : '='
  }
  return out
}

/** Katı base64 çözücü: alfabe, dolgu ya da kanonik olmayan biçim varsa null. */
export function fromBase64(s: string): Uint8Array | null {
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0
  const out = new Uint8Array((s.length / 4) * 3 - pad)
  let pos = 0
  for (let i = 0; i < s.length; i += 4) {
    let n = 0
    for (let j = 0; j < 4; j++) n = (n << 6) | (s[i + j] === '=' ? 0 : B64.indexOf(s[i + j]))
    if (pos < out.length) out[pos++] = (n >> 16) & 255
    if (pos < out.length) out[pos++] = (n >> 8) & 255
    if (pos < out.length) out[pos++] = n & 255
  }
  // Yeniden kodlayınca aynı dize çıkmalı (artık bitler sıfır).
  return toBase64(out) === s ? out : null
}

/** Uzunluk önekli (4 bayt, big-endian) parçaları tek bayt dizisine paketler. */
export function pack(parts: Uint8Array[]): Uint8Array {
  const framed = parts.map((p) => {
    const head = new Uint8Array(4)
    new DataView(head.buffer).setUint32(0, p.length)
    return concat(head, p)
  })
  return concat(...framed)
}

/** pack'in tersi. Bozuk/kesik veri için null döner (çağıran tipli hata fırlatır). */
export function unpack(data: Uint8Array): Uint8Array[] | null {
  const parts: Uint8Array[] = []
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let pos = 0
  while (pos < data.length) {
    if (pos + 4 > data.length) return null
    const len = view.getUint32(pos)
    pos += 4
    if (pos + len > data.length) return null
    parts.push(data.slice(pos, pos + len))
    pos += len
  }
  return parts
}
