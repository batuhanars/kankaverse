// Şifreli yük biçimi (sözleşme §3.2): MLS uygulama mesajının düz içeriği UTF-8 JSON.
// E4 franking alanı `v: 2` ile gelecek; bilinmeyen sürüm HATA değil, ayırt edilebilir sonuçtur.
import { fromUtf8, utf8 } from './bytes'

export interface TextPayload {
  v: 1
  t: 'text'
  body: string
  sentAt: number
}

export type DecodedPayload =
  | { kind: 'text'; payload: TextPayload }
  /** v bilinmiyor ya da tür tanınmıyor: istemci "uygulamayı güncelle" gösterir. */
  | { kind: 'unsupported'; version: number }
  /** JSON/UTF-8 bozuk ya da şekil yanlış (v:1 ama alanlar eksik). */
  | { kind: 'malformed' }

const PAYLOAD_VERSION = 1

export const textPayload = (body: string, sentAt: number): TextPayload => ({ v: PAYLOAD_VERSION, t: 'text', body, sentAt })

export function encodePayload(payload: TextPayload): Uint8Array {
  return utf8(JSON.stringify({ v: payload.v, t: payload.t, body: payload.body, sentAt: payload.sentAt }))
}

export function decodePayload(bytes: Uint8Array): DecodedPayload {
  let raw: unknown
  try {
    raw = JSON.parse(fromUtf8(bytes))
  } catch {
    return { kind: 'malformed' }
  }
  if (typeof raw !== 'object' || raw === null) return { kind: 'malformed' }
  const o = raw as Record<string, unknown>
  if (typeof o.v !== 'number') return { kind: 'malformed' }
  if (o.v !== PAYLOAD_VERSION || o.t !== 'text') return { kind: 'unsupported', version: o.v }
  if (typeof o.body !== 'string' || typeof o.sentAt !== 'number') return { kind: 'malformed' }
  return { kind: 'text', payload: { v: 1, t: 'text', body: o.body, sentAt: o.sentAt } }
}
