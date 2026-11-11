import { describe, expect, it } from 'vitest'
import { decodePayload, encodePayload, textPayload } from '../src'

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o))

describe('yük biçimi (§3.2)', () => {
  it('v1 metin gidiş-dönüş', () => {
    const p = textPayload('merhaba ğüş', 1700000000000)
    expect(JSON.parse(new TextDecoder().decode(encodePayload(p)))).toEqual({
      v: 1,
      t: 'text',
      body: 'merhaba ğüş',
      sentAt: 1700000000000,
    })
    expect(decodePayload(encodePayload(p))).toEqual({ kind: 'text', payload: p })
  })

  it('bilinmeyen sürüm hata değil, ayırt edilebilir sonuç', () => {
    // v2 artık tanınır (E4); bilinmeyen sürüm örneği v3.
    expect(decodePayload(enc({ v: 3, t: 'text', body: 'x', sentAt: 1, fk: 'abc' }))).toEqual({
      kind: 'unsupported',
      version: 3,
    })
  })

  it('v1 ama bilinmeyen tür unsupported', () => {
    expect(decodePayload(enc({ v: 1, t: 'sticker' }))).toEqual({ kind: 'unsupported', version: 1 })
  })

  it('bozuk girdiler malformed', () => {
    expect(decodePayload(new Uint8Array([0xff, 0xfe]))).toEqual({ kind: 'malformed' })
    expect(decodePayload(enc('düz metin'))).toEqual({ kind: 'malformed' })
    expect(decodePayload(enc(null))).toEqual({ kind: 'malformed' })
    expect(decodePayload(enc({ t: 'text' }))).toEqual({ kind: 'malformed' })
    expect(decodePayload(enc({ v: 1, t: 'text', body: 5, sentAt: 1 }))).toEqual({ kind: 'malformed' })
  })
})
