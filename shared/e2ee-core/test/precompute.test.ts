import { ed25519 } from '@noble/curves/ed25519.js'
import { describe, expect, it } from 'vitest'
import { pureSuite1, tunePurePrecompute } from '../src/pure/suite'

// E3 Rev.4: önhesaplama penceresi yalnız hız ayarıdır; imza/doğrulama sonuçları değişmemeli.
describe('Ed25519 önhesaplama ayarı (W=4)', () => {
  it('RFC 8032 test vektörü 1 ayar sonrası da doğrulanır, imza aynı çıkar', async () => {
    tunePurePrecompute()
    const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'))
    const sk = hex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
    const pk = hex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
    const sig = hex(
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
    )
    const msg = new Uint8Array(0)
    expect(ed25519.getPublicKey(sk)).toEqual(pk)
    expect(await pureSuite1.signature.sign(sk, msg)).toEqual(sig)
    expect(await pureSuite1.signature.verify(pk, msg, sig)).toBe(true)
    const bad = sig.slice()
    bad[0] ^= 1
    expect(await pureSuite1.signature.verify(pk, msg, bad)).toBe(false)
  })
})
