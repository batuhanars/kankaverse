import { describe, expect, it } from 'vitest'
import { createDevice, pureProvider, rebindMessage, webProvider } from '../src'

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

describe('C69 rebindMessage', () => {
  it('bayt düzeni sunucu util ile aynı (sabit vektör)', () => {
    const nonce = new Uint8Array(32).map((_, i) => i)
    const msg = rebindMessage(nonce, 'user-1', 'dev-9')
    // utf8("kankaverse/e2ee/rebind/v1") 00 nonce utf8("user-1") 00 utf8("dev-9")
    const expected =
      Buffer.from('kankaverse/e2ee/rebind/v1', 'utf8').toString('hex') +
      '00' +
      Buffer.from(nonce).toString('hex') +
      Buffer.from('user-1').toString('hex') +
      '00' +
      Buffer.from('dev-9').toString('hex')
    expect(hex(msg)).toBe(expected)
    expect(hex(msg)).toBe(
      '6b616e6b6176657273652f653265652f72656269' +
        '6e642f7631' +
        '00' +
        '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f' +
        '757365722d31' +
        '00' +
        '6465762d39',
    )
  })

  for (const p of [webProvider, pureProvider]) {
    it(`Device.sign ham Ed25519 imza üretir (${p.name})`, async () => {
      const d = await createDevice(p)
      const msg = rebindMessage(new Uint8Array(32).fill(7), 'u', 'd')
      const sig = await d.sign(msg)
      expect(sig.length).toBe(64)
      const suite = await pureProvider.loadSuite()
      expect(await suite.signature.verify(d.signaturePublicKey, msg, sig)).toBe(true)
    })
  }
})
