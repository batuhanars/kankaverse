// detectWebProvider: Ed25519 desteği olmayan motorda (Electron 36 / Chromium 136) pure seçilir.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectWebProvider, pureProvider, webProvider } from '../src'
import { resetDetectedProvider } from '../src/provider'

const real = globalThis.crypto.subtle
type Gen = (alg: unknown, ...rest: unknown[]) => Promise<unknown>
const realGen = real.generateKey.bind(real) as unknown as Gen

function stubSubtle(subtle: unknown): void {
  vi.stubGlobal('crypto', { subtle, getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetDetectedProvider()
})

describe('detectWebProvider', () => {
  it('tam destekte web seçer ve sonucu önbelleğe alır', async () => {
    expect(await detectWebProvider()).toBe(webProvider)
    stubSubtle(undefined) // önbellekten gelir, yeniden denenmez
    expect(await detectWebProvider()).toBe(webProvider)
  })

  it('Ed25519 yoksa pure seçer', async () => {
    const generateKey: Gen = (alg, ...rest) => {
      const name = typeof alg === 'string' ? alg : (alg as { name: string }).name
      if (name === 'Ed25519') return Promise.reject(new DOMException('Unrecognized name', 'NotSupportedError'))
      return realGen(alg, ...rest)
    }
    stubSubtle({ generateKey })
    expect(await detectWebProvider()).toBe(pureProvider)
  })

  it('X25519 yoksa pure seçer', async () => {
    const generateKey: Gen = (alg, ...rest) => {
      if (alg === 'X25519') return Promise.reject(new DOMException('x', 'NotSupportedError'))
      return realGen(alg, ...rest)
    }
    stubSubtle({
      generateKey,
      sign: real.sign.bind(real),
      verify: real.verify.bind(real),
      deriveBits: real.deriveBits.bind(real),
    })
    expect(await detectWebProvider()).toBe(pureProvider)
  })

  it('crypto.subtle hiç yoksa pure seçer', async () => {
    stubSubtle(undefined)
    expect(await detectWebProvider()).toBe(pureProvider)
  })
})
