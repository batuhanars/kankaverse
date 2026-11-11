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
})
