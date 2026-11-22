// E8 — arama anahtarı (MLS exporter). Sözleşme: contracts/SPRINT_E8_E2EE_CALLS_CONTRACT.md §2.
// Her iki sağlayıcıyla koşar: web (WebCrypto) ve mobil (saf JS) aynı anahtarı bulmalı.
import { describe, expect, it } from 'vitest'
import { GroupStateError, pureProvider, webProvider, type CryptoProvider } from '../src'
import { applyCommit, groupOf, listOf, makePeer, setupGroup } from './helpers'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

describe.each([
  ['webProvider', webProvider],
  ['pureProvider', pureProvider],
] as [string, CryptoProvider][])('arama anahtarı (%s)', (_name, provider) => {
  const fleet = async () => {
    const [A, B, C] = await Promise.all(['A', 'B', 'C'].map((id) => makePeer(provider, id)))
    await setupGroup(A, [B, C])
    return { A, B, C }
  }

  it('aynı gruptaki cihazlar aynı epoch\'ta aynı 32 baytlık anahtarı türetir', async () => {
    const { A, B, C } = await fleet()
    const [a, b, c] = await Promise.all([A, B, C].map((p) => groupOf(p).exportCallKey('kanal-1')))
    expect(a.key).toHaveLength(32)
    expect(a.epoch).toBe(1)
    expect(hex(b.key)).toBe(hex(a.key))
    expect(hex(c.key)).toBe(hex(a.key))
  })

  it('farklı kanal kimliği farklı anahtar verir', async () => {
    const { A } = await fleet()
    const k1 = await groupOf(A).exportCallKey('kanal-1')
    const k2 = await groupOf(A).exportCallKey('kanal-2')
    expect(hex(k1.key)).not.toBe(hex(k2.key))
  })

  it('cihaz çıkarılınca anahtar değişir; kalanlar yine aynı anahtarda buluşur, çıkarılan türetemez', async () => {
    const { A, B, C } = await fleet()
    const before = await groupOf(A).exportCallKey('kanal-1')
    const members = listOf([A, B])
    const pending = await groupOf(A).removeDevices(['C'], members)
    await applyCommit(A, pending, [B], members)
    await groupOf(C).processCommit(pending.commit, members)

    const [a, b] = await Promise.all([A, B].map((p) => groupOf(p).exportCallKey('kanal-1')))
    expect(a.epoch).toBe(2)
    expect(hex(a.key)).not.toBe(hex(before.key))
    expect(hex(b.key)).toBe(hex(a.key))
    await expect(groupOf(C).exportCallKey('kanal-1')).rejects.toBeInstanceOf(GroupStateError)
  })

  it('salt okunur: grubun durumunu değiştirmez', async () => {
    const { A } = await fleet()
    const before = hex(groupOf(A).serialize())
    await groupOf(A).exportCallKey('kanal-1')
    expect(hex(groupOf(A).serialize())).toBe(before)
  })
})
