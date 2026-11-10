// Küçük bayt yardımcıları. Node'a özel modül yok (Hermes uyumlu).

const te = new TextEncoder()
const td = new TextDecoder('utf-8', { fatal: true })

export const utf8 = (s: string): Uint8Array => te.encode(s)
export const fromUtf8 = (b: Uint8Array): string => td.decode(b)

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
