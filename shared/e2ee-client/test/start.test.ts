import { afterEach, describe, expect, it, vi } from 'vitest'
import { RandomUnavailableError, pureProvider } from '@kankaverse/e2ee-core'
import { E2eeEngine } from '../src/engine'
import { serialLock } from '../src/lock'
import { FakeServer } from './fakeServer'
import { MemoryVault } from './memoryVault'

afterEach(() => vi.unstubAllGlobals())

describe('motor başlatma', () => {
  it('güvenli rastgelelik (crypto.getRandomValues) yoksa başlamaz, sunucuya ve depoya dokunmaz', async () => {
    vi.stubGlobal('crypto', undefined)
    const server = new FakeServer()
    const opened = vi.fn()
    const start = E2eeEngine.start('A', {
      api: server.apiFor('A', 'fam'),
      openVault: async () => {
        opened()
        return new MemoryVault()
      },
      withLock: serialLock(),
      provider: pureProvider,
      onWarn: () => {},
    })
    await expect(start).rejects.toBeInstanceOf(RandomUnavailableError)
    expect(opened).not.toHaveBeenCalled()
    expect(server.devices.size).toBe(0)
  })
})
