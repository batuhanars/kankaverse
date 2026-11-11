// Web Argon2id sarmalayıcısı (E5a §2): Worker yolu ve ana iş parçacığı yedeği aynı çıktıyı verir.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nobleArgon2id } from '@kankaverse/e2ee-core'
import type { Argon2Request, Argon2Response } from '../argon2'
import { webArgon2id } from '../argon2'

const enc = (s: string) => new TextEncoder().encode(s)
const OPTS = { m: 1024, t: 1, p: 1, dkLen: 32 } // test hızı için küçük; taban denetimi core'da
const args = [enc('password'), enc('somesalt'), OPTS] as const

afterEach(() => vi.unstubAllGlobals())

/** Worker protokolünü taklit eden sahte sınıf: istek gelince noble ile hesaplar ya da `mode`a göre bozulur. */
function stubWorker(mode: 'ok' | 'compute-error' | 'start-error') {
  const created: FakeWorker[] = []
  class FakeWorker {
    onmessage: ((e: MessageEvent<Argon2Response>) => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    terminated = false
    constructor() {
      created.push(this)
    }
    postMessage(req: Argon2Request) {
      setTimeout(async () => {
        if (mode === 'start-error') return this.onerror?.(new Error('yüklenemedi'))
        if (mode === 'compute-error') return this.onmessage?.({ data: { ok: false, message: 'bellek' } } as MessageEvent)
        const out = await nobleArgon2id(req.password, req.salt, req.opts)
        this.onmessage?.({ data: { ok: true, out } } as MessageEvent<Argon2Response>)
      }, 0)
    }
    terminate() {
      this.terminated = true
    }
  }
  vi.stubGlobal('Worker', FakeWorker)
  return created
}

describe('webArgon2id', () => {
  it("Worker varsa Worker'da hesaplar, sonuç noble ile birebir, iş bitince Worker kapanır", async () => {
    const created = stubWorker('ok')
    const out = await webArgon2id(...args)
    expect(out).toEqual(await nobleArgon2id(...args))
    expect(created).toHaveLength(1)
    expect(created[0].terminated).toBe(true)
  })

  it('Worker yoksa ana iş parçacığında noble ile hesaplar', async () => {
    vi.stubGlobal('Worker', undefined)
    expect(await webArgon2id(...args)).toEqual(await nobleArgon2id(...args))
  })

  it('Worker açılamazsa (CSP, yükleme hatası) ana iş parçacığına düşer', async () => {
    const created = stubWorker('start-error')
    expect(await webArgon2id(...args)).toEqual(await nobleArgon2id(...args))
    expect(created[0].terminated).toBe(true)
  })

  it('Worker hesap hatası verirse yutulmaz, hata yukarı çıkar', async () => {
    stubWorker('compute-error')
    await expect(webArgon2id(...args)).rejects.toThrow('bellek')
  })
})
