// RFC 9180 resmi test vektörleri (kaynak ve indirme tarihi vectors/*.json içinde).
// pureProvider'ın HPKE yapıştırması (setup + seal/open + export + DeriveKeyPair) vektörlerle doğrulanır.
// Bu test geçmeden mobil parça merge edilmez (sözleşme §1.1).
import { describe, expect, it, vi } from 'vitest'
import { x25519 } from '@noble/curves/ed25519.js'
import { gcm } from '@noble/ciphers/aes.js'
import { CryptoError } from 'ts-mls'
import { pureHpke, decap, deriveKeySecret, encapWith, exportFrom, keySchedule } from '../src/pure/hpke'
import file from './vectors/rfc9180-x25519-sha256-aes128gcm-base.json'

const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (b) => parseInt(b, 16))
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

const v = file.vectors[0]
const info = hex(v.info)
const raw = (type: 'public' | 'private', h: string) => ({ type, bytes: hex(h) }) as never

describe('RFC 9180 vektörü: DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / AES-128-GCM, base mode', () => {
  it('vektör alt kümesi beklenen paketi taşıyor', () => {
    expect([v.mode, v.kem_id, v.kdf_id, v.aead_id]).toEqual([0, 32, 1, 1])
  })

  it('DeriveKeyPair: ikmE/ikmR -> skEm/skRm, açık anahtarlar', () => {
    expect(toHex(deriveKeySecret(hex(v.ikmE)))).toBe(v.skEm)
    expect(toHex(deriveKeySecret(hex(v.ikmR)))).toBe(v.skRm)
    expect(toHex(x25519.getPublicKey(hex(v.skEm)))).toBe(v.pkEm)
    expect(toHex(x25519.getPublicKey(hex(v.skRm)))).toBe(v.pkRm)
  })

  it('Encap/Decap: enc ve shared_secret', () => {
    const { enc, ss } = encapWith(hex(v.skEm), hex(v.pkRm))
    expect(toHex(enc)).toBe(v.enc)
    expect(toHex(ss)).toBe(v.shared_secret)
    expect(toHex(decap(hex(v.enc), hex(v.skRm)))).toBe(v.shared_secret)
  })

  it('anahtar çizelgesi: key, base_nonce, exporter_secret', () => {
    const ks = keySchedule(hex(v.shared_secret), info)
    expect(toHex(ks.key)).toBe(v.key)
    expect(toHex(ks.baseNonce)).toBe(v.base_nonce)
    expect(toHex(ks.exporterSecret)).toBe(v.exporter_secret)
  })

  it('export: tüm exporter_context/L/exported_value vakaları', () => {
    for (const e of v.exports) {
      expect(toHex(exportFrom(hex(v.exporter_secret), hex(e.exporter_context), e.L))).toBe(e.exported_value)
    }
  })

  it('seal: sabit ephemeral anahtarla vektördeki ilk şifreli metni üretir', async () => {
    // seal rastgele ephemeral üretir; vektörün skEm'ini döndürmek için rastgeleliği enjekte ederiz.
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((a: Uint8Array) => {
      a.set(hex(v.skEm))
      return a
    }) as never)
    const e0 = v.encryptions[0]
    const sealed = await pureHpke.seal(raw('public', v.pkRm), hex(e0.pt), info, hex(e0.aad))
    spy.mockRestore()
    expect(toHex(sealed.enc)).toBe(v.enc)
    expect(toHex(sealed.ct)).toBe(e0.ct)
  })

  it('open: vektördeki şifreli metni alıcı anahtarıyla açar; bozuk etiket CryptoError', async () => {
    const e0 = v.encryptions[0]
    const pt = await pureHpke.open(raw('private', v.skRm), hex(v.enc), hex(e0.ct), info, hex(e0.aad))
    expect(toHex(pt)).toBe(e0.pt)
    const bad = hex(e0.ct)
    bad[0] ^= 1
    await expect(pureHpke.open(raw('private', v.skRm), hex(v.enc), bad, info, hex(e0.aad))).rejects.toBeInstanceOf(
      CryptoError,
    )
  })

  it('sıra numaralı nonce: seq 1 ve 2 vektörleri base_nonce XOR seq ile açılır', () => {
    const ks = keySchedule(hex(v.shared_secret), info)
    for (const [seq, e] of v.encryptions.entries()) {
      const nonce = ks.baseNonce.slice()
      nonce[nonce.length - 1] ^= seq
      expect(toHex(nonce)).toBe(e.nonce)
      expect(toHex(gcm(ks.key, nonce, hex(e.aad)).decrypt(hex(e.ct)))).toBe(e.pt)
    }
  })

  it('exportSecret/importSecret: gönderen ve alıcı aynı sırrı türetir', async () => {
    const pair = await pureHpke.generateKeyPair()
    const out = await pureHpke.exportSecret(pair.publicKey, hex('aabb'), 32, info)
    const back = await pureHpke.importSecret(pair.privateKey, hex('aabb'), out.enc, 32, info)
    expect(toHex(back)).toBe(toHex(out.secret))
  })
})
