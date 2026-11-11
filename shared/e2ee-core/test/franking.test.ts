import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  decodePayload,
  encodePayload,
  frank,
  frankingCanon,
  fromBase64,
  newFrankingKey,
  textPayload,
  toBase64,
  verifyFrank,
  pureProvider,
  webProvider,
  type CryptoProvider,
  type FrankingInput,
} from '../src'
import { groupOf, makePeer, setupGroup } from './helpers'

interface Vector {
  name: string
  input: FrankingInput
  fk: string
  canon: string
  tag: string
}
// Vektörler Node crypto ile (noble'dan bağımsız) üretildi; api aynı dosyayı kullanır.
const vectors: Vector[] = JSON.parse(readFileSync(new URL('./vectors/franking.json', import.meta.url), 'utf8'))
const b64 = (s: string) => fromBase64(s) as Uint8Array
const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o))

describe('franking (E4 §2.1)', () => {
  it('en az 5 vektör var', () => expect(vectors.length).toBeGreaterThanOrEqual(5))

  describe.each(vectors)('vektör $name', (v) => {
    it('canon birebir', () => expect(frankingCanon(v.input)).toBe(v.canon))
    it('tag birebir', () => expect(toBase64(frank(b64(v.fk), v.input))).toBe(v.tag))
    it('verifyFrank doğru', () => expect(verifyFrank(b64(v.fk), v.input, b64(v.tag))).toBe(true))
  })

  const v0 = vectors[0]
  const fk = b64(v0.fk)
  const tag = b64(v0.tag)

  it('body / sentAt / deviceId / channelId değişince false', () => {
    expect(verifyFrank(fk, { ...v0.input, body: v0.input.body + '.' }, tag)).toBe(false)
    expect(verifyFrank(fk, { ...v0.input, sentAt: v0.input.sentAt + 1 }, tag)).toBe(false)
    expect(verifyFrank(fk, { ...v0.input, senderDeviceId: 'dev_X' }, tag)).toBe(false)
    expect(verifyFrank(fk, { ...v0.input, channelId: 'ch_X' }, tag)).toBe(false)
  })

  it('yanlış anahtar, bozuk bit ve farklı uzunlukta tag false', () => {
    expect(verifyFrank(b64(vectors[1].fk), v0.input, tag)).toBe(false)
    const flipped = tag.slice()
    flipped[0] ^= 1
    expect(verifyFrank(fk, v0.input, flipped)).toBe(false)
    expect(verifyFrank(fk, v0.input, tag.slice(0, 31))).toBe(false)
    expect(verifyFrank(fk, v0.input, new Uint8Array(0))).toBe(false)
  })

  it('newFrankingKey 32 bayt ve her çağrıda farklı; random enjekte edilebilir', () => {
    const a = newFrankingKey()
    expect(a.length).toBe(32)
    expect(toBase64(a)).not.toBe(toBase64(newFrankingKey()))
    expect(newFrankingKey((n) => new Uint8Array(n).fill(9))).toEqual(new Uint8Array(32).fill(9))
  })
})

describe('base64', () => {
  it('gidiş-dönüş ve katılık', () => {
    for (const n of [0, 1, 2, 3, 31, 32, 33]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 53 + 7) & 255)
      expect(fromBase64(toBase64(bytes))).toEqual(bytes)
    }
    expect(toBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=')
    expect(fromBase64('AB')).toBeNull() // dolgusuz
    expect(fromBase64('AB=A')).toBeNull()
    expect(fromBase64('AAB=')).toBeNull() // kanonik olmayan artık bit
    expect(fromBase64('A-A=')).toBeNull()
  })
})

describe('yük biçimi v2', () => {
  const fkB64 = toBase64(newFrankingKey())

  it('encode/decode gidiş-dönüş, fk döner, JSON şekli sabit', () => {
    const p = textPayload('merhaba 👋', 1700000000000, fkB64)
    expect(p).toEqual({ v: 2, t: 'text', body: 'merhaba 👋', sentAt: 1700000000000, fk: fkB64 })
    expect(JSON.parse(new TextDecoder().decode(encodePayload(p)))).toEqual(p)
    expect(decodePayload(encodePayload(p))).toEqual({ kind: 'text', payload: p })
  })

  it('v2 encode: fk bozuksa fırlatır; v1 fk olmadan hâlâ üretilir', () => {
    expect(() => encodePayload({ v: 2, t: 'text', body: 'x', sentAt: 1, fk: 'AAAA' })).toThrow()
    expect(textPayload('x', 1).v).toBe(1)
  })

  it('v2 decode: fk eksik / yanlış uzunluk / tür yanlış = malformed', () => {
    expect(decodePayload(enc({ v: 2, t: 'text', body: 'x', sentAt: 1 }))).toEqual({ kind: 'malformed' })
    expect(decodePayload(enc({ v: 2, t: 'text', body: 'x', sentAt: 1, fk: 'AAAA' }))).toEqual({ kind: 'malformed' })
    expect(decodePayload(enc({ v: 2, t: 'text', body: 'x', sentAt: 1, fk: 5 }))).toEqual({ kind: 'malformed' })
  })

  it('v1 geriye uyum ve bilinmeyen v / tür', () => {
    const v1 = enc({ v: 1, t: 'text', body: 'eski', sentAt: 5 })
    expect(decodePayload(v1)).toEqual({ kind: 'text', payload: { v: 1, t: 'text', body: 'eski', sentAt: 5 } })
    expect(decodePayload(enc({ v: 3, t: 'text', body: 'x', sentAt: 1, fk: fkB64 }))).toEqual({
      kind: 'unsupported',
      version: 3,
    })
    expect(decodePayload(enc({ v: 2, t: 'sticker' }))).toEqual({ kind: 'unsupported', version: 2 })
  })
})

describe.each([
  ['webProvider', webProvider],
  ['pureProvider', pureProvider],
] as [string, CryptoProvider][])('Group v2 şifreleme (%s)', (_n, provider) => {
  it('v2 yükü şifrelenir, çözülür, fk istemciye ulaşır ve franking doğrulanır; v1 yanında çalışır', async () => {
    const [A, B] = await Promise.all(['A1', 'B1'].map((id) => makePeer(provider, id)))
    await setupGroup(A, [B])
    const key = newFrankingKey()
    const input: FrankingInput = { channelId: 'ch_1', senderDeviceId: 'A1', body: 'selam', sentAt: 42 }
    const sent = await groupOf(A).encrypt(textPayload(input.body, input.sentAt, toBase64(key)))
    const got = await groupOf(B).decrypt(sent.ciphertext, 'A1')
    expect(got.payload.kind).toBe('text')
    if (got.payload.kind !== 'text' || got.payload.payload.v !== 2) throw new Error('v2 bekleniyordu')
    const recvKey = b64(got.payload.payload.fk)
    expect(recvKey).toEqual(key)
    const tagSent = frank(key, input)
    expect(verifyFrank(recvKey, { ...input, body: got.payload.payload.body, sentAt: got.payload.payload.sentAt }, tagSent)).toBe(true)

    const old = await groupOf(A).encrypt(textPayload('v1 mesaj', 43))
    const gotOld = await groupOf(B).decrypt(old.ciphertext, 'A1')
    expect(gotOld.payload).toEqual({ kind: 'text', payload: { v: 1, t: 'text', body: 'v1 mesaj', sentAt: 43 } })
  })
})
