// Şifreli yük biçimi (sözleşme §3.2): MLS uygulama mesajının düz içeriği UTF-8 JSON.
// v1: parmak izsiz. v2 (E4 §2.1): `fk` (base64, 32 bayt) taşır. Bilinmeyen sürüm HATA değil, ayırt edilebilir sonuçtur.
import { fromBase64, fromUtf8, utf8 } from './bytes'

export interface TextPayloadV1 {
  v: 1
  t: 'text'
  body: string
  sentAt: number
}

export interface TextPayloadV2 {
  v: 2
  t: 'text'
  body: string
  sentAt: number
  /** Parmak izi anahtarı, base64 (32 bayt). */
  fk: string
}

export type TextPayload = TextPayloadV1 | TextPayloadV2

export type DecodedPayload =
  | { kind: 'text'; payload: TextPayload }
  /** v bilinmiyor ya da tür tanınmıyor: istemci "uygulamayı güncelle" gösterir. */
  | { kind: 'unsupported'; version: number }
  /** JSON/UTF-8 bozuk ya da şekil yanlış (v:1/v:2 ama alanlar eksik, fk 32 bayt base64 değil). */
  | { kind: 'malformed' }

const FK_BYTES = 32

/** `fk` verilirse v2, verilmezse v1 (E4 bayrağı kapalıyken gönderim v1 kalır). */
export function textPayload(body: string, sentAt: number, fk?: string): TextPayload {
  return fk === undefined ? { v: 1, t: 'text', body, sentAt } : { v: 2, t: 'text', body, sentAt, fk }
}

export function encodePayload(payload: TextPayload): Uint8Array {
  if (payload.v === 2) {
    if (fromBase64(payload.fk)?.length !== FK_BYTES) throw new Error('v2 yükü için fk 32 bayt base64 olmalı')
    return utf8(JSON.stringify({ v: 2, t: payload.t, body: payload.body, sentAt: payload.sentAt, fk: payload.fk }))
  }
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
  if ((o.v !== 1 && o.v !== 2) || o.t !== 'text') return { kind: 'unsupported', version: o.v }
  if (typeof o.body !== 'string' || typeof o.sentAt !== 'number') return { kind: 'malformed' }
  if (o.v === 1) return { kind: 'text', payload: { v: 1, t: 'text', body: o.body, sentAt: o.sentAt } }
  if (typeof o.fk !== 'string' || fromBase64(o.fk)?.length !== FK_BYTES) return { kind: 'malformed' }
  return { kind: 'text', payload: { v: 2, t: 'text', body: o.body, sentAt: o.sentAt, fk: o.fk } }
}
