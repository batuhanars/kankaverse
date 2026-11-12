// DM listesi şifreli önizleme seçimi (E3 §4.1): depoda var / yok / şifresiz.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { encryptedLastIds, useEncryptedPreviews } from '../useEncryptedPreviews'
import { useE2eeStore } from '@/stores/e2ee'
import type { DmChannelDto } from '@/types'

const ch = (id: string, last: { id: string; encrypted?: boolean } | null) =>
  ({ id, type: 'DM', lastMessage: last }) as unknown as DmChannelDto

describe('encryptedLastIds', () => {
  it('yalnız şifreli ve kimlikli son mesajları alır', () => {
    const ids = encryptedLastIds([
      ch('a', { id: 'm1', encrypted: true }),
      ch('b', { id: 'm2' }),
      ch('c', { id: '', encrypted: true }),
      ch('d', null),
    ])
    expect(ids).toEqual(['m1'])
  })
})

describe('useEncryptedPreviews', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('depoda olan düz metin gelir, olmayan boş kalır; şifresize dokunulmaz', async () => {
    const store = useE2eeStore()
    const spy = vi
      .spyOn(store, 'plainText')
      .mockImplementation((id) => Promise.resolve(id === 'm1' ? 'selam' : null))
    const scope = effectScope()
    const { previews } = scope.run(() =>
      useEncryptedPreviews(
        () => [
          ch('a', { id: 'm1', encrypted: true }),
          ch('b', { id: 'm2', encrypted: true }),
          ch('c', { id: 'm3' }),
        ],
        () => null,
      ),
    )!
    await nextTick()
    await vi.waitFor(() => expect(previews.value.m1).toBe('selam'))
    expect(previews.value.m2).toBeUndefined()
    expect(spy).not.toHaveBeenCalledWith('m3')
    scope.stop()
  })

  it('plainTick artınca (soketten çözülünce) önizleme depodan yeniden okunur', async () => {
    const store = useE2eeStore()
    let stored: string | null = null
    vi.spyOn(store, 'plainText').mockImplementation(() => Promise.resolve(stored))
    const scope = effectScope()
    const { previews } = scope.run(() =>
      useEncryptedPreviews(
        () => [ch('a', { id: 'm1', encrypted: true })],
        () => null,
      ),
    )!
    await nextTick()
    await Promise.resolve()
    expect(previews.value.m1).toBeUndefined()
    stored = 'gercek metin'
    store.plainTick++
    await vi.waitFor(() => expect(previews.value.m1).toBe('gercek metin'))
    scope.stop()
  })

  it('depoda yoksa sohbet arka planda bir kez çözülür (uygulama kapalıyken gelen mesaj)', async () => {
    const store = useE2eeStore()
    let stored: string | null = null
    vi.spyOn(store, 'plainText').mockImplementation(() => Promise.resolve(stored))
    store.engine = {} as never
    const prefetch = vi.spyOn(store, 'prefetchPreview').mockImplementation(() => {
      stored = 'kapaliyken gelen'
      store.plainTick++
      return Promise.resolve([])
    })
    const scope = effectScope()
    const { previews } = scope.run(() =>
      useEncryptedPreviews(
        () => [ch('a', { id: 'm1', encrypted: true })],
        () => null,
      ),
    )!
    await vi.waitFor(() => expect(previews.value.m1).toBe('kapaliyken gelen'))
    expect(prefetch).toHaveBeenCalledTimes(1)
    expect(prefetch).toHaveBeenCalledWith('a')
    store.plainTick++
    await nextTick()
    expect(prefetch).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('E5b Parça C: son mesaj cihaz öncesiyse önizleme boş işaretlenir ("Şifreli mesaj" yazılmaz)', async () => {
    const store = useE2eeStore()
    vi.spyOn(store, 'plainText').mockResolvedValue(null)
    store.engine = {} as never
    vi.spyOn(store, 'prefetchPreview').mockResolvedValue([
      { id: 'm1', encrypted: true, e2eeStatus: 'undecryptable' } as never,
    ])
    const scope = effectScope()
    const { previews } = scope.run(() =>
      useEncryptedPreviews(
        () => [ch('a', { id: 'm1', encrypted: true })],
        () => null,
      ),
    )!
    await vi.waitFor(() => expect(previews.value.m1).toBe(''))
    scope.stop()
  })
})
