// E2 §3.1: şifreleme kapısı 1-1 DM + grup DM'i kapsar; Ortam kanalını kapsamaz.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDmStore } from '@/stores/dm'
import { useE2eeStore } from '@/stores/e2ee'
import type { DmChannelDto } from '@/types'

const dm = (id: string, type: string) => ({ id, type }) as unknown as DmChannelDto

describe('e2ee store kapısı (E2 §3.1)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('grup DM kanalında kanal açılışı ve yerel kayıt silme motora gider', async () => {
    useDmStore().channels = [dm('g1', 'GROUP_DM'), dm('d1', 'DM')]
    const store = useE2eeStore()
    const open = vi.fn().mockResolvedValue({ encrypted: true, createdAt: null })
    const forget = vi.fn().mockResolvedValue(undefined)
    store.engine = { open, forgetMessage: forget } as never
    await store.openChannel('g1')
    await store.forgetMessage('g1', 'm1')
    expect(open).toHaveBeenCalledWith('g1')
    expect(forget).toHaveBeenCalledWith('m1')
  })

  it('Ortam kanalında hiçbir şey yapmaz', async () => {
    useDmStore().channels = [dm('g1', 'GROUP_DM')]
    const store = useE2eeStore()
    const open = vi.fn()
    store.engine = { open } as never
    await store.openChannel('guild-channel')
    expect(open).not.toHaveBeenCalled()
  })
})
