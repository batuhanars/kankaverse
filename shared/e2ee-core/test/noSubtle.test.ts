// Hermes benzetimi: crypto.subtle YOK. pureProvider yalnız getRandomValues ile çalışmalı;
// getRandomValues de yoksa açık hata fırlatmalı (Math.random'a düşmemeli).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RandomUnavailableError, pureProvider } from '../src'
import { makePeer, send, setupGroup } from './helpers'

const realCrypto = globalThis.crypto

function stubCrypto(value: unknown) {
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true })
}

afterEach(() => {
  stubCrypto(realCrypto)
  vi.restoreAllMocks()
})

describe('pureProvider, crypto.subtle olmayan ortam', () => {
  it('subtle kaldırılmışken grup kurulur, mesaj geçer', async () => {
    stubCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) }) // subtle yok
    expect((globalThis.crypto as { subtle?: unknown }).subtle).toBeUndefined()
    const a = await makePeer(pureProvider, 'A')
    const b = await makePeer(pureProvider, 'B')
    await setupGroup(a, [b])
    expect(await send(a, [b], 'subtle yokken')).toEqual(['subtle yokken'])
  })

  it('getRandomValues yoksa RandomUnavailableError; Math.random çağrılmaz', async () => {
    const mathRandom = vi.spyOn(Math, 'random')
    stubCrypto({})
    await expect(makePeer(pureProvider, 'A')).rejects.toBeInstanceOf(RandomUnavailableError)
    expect(mathRandom).not.toHaveBeenCalled()
  })
})
