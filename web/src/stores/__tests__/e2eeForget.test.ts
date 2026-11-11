// Silme boşluğu (E5a §4.1): şifreli DM mesajı silinince motorun yerel kaydı silmesi tetiklenir.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDmStore } from '@/stores/dm'
import { useE2eeStore } from '@/stores/e2ee'
import type { DmChannelDto } from '@/types'

const dm = (id: string, type: string) => ({ id, type }) as unknown as DmChannelDto

describe('e2ee store forgetMessage', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it("1-1 DM kanalında motorun forgetMessage'ını çağırır", async () => {
    useDmStore().channels = [dm('dm1', 'DM')]
    const store = useE2eeStore()
    const forget = vi.fn().mockResolvedValue(undefined)
    store.engine = { forgetMessage: forget } as never
    await store.forgetMessage('dm1', 'm1')
    expect(forget).toHaveBeenCalledWith('m1')
  })

  it('DM olmayan kanalda (Ortam kanalı) ve motor yokken hiçbir şey yapmaz', async () => {
    useDmStore().channels = [dm('dm1', 'DM')]
    const store = useE2eeStore()
    const forget = vi.fn().mockResolvedValue(undefined)
    store.engine = { forgetMessage: forget } as never
    await store.forgetMessage('guild-channel', 'm1')
    expect(forget).not.toHaveBeenCalled()
    store.engine = null
    await expect(store.forgetMessage('dm1', 'm1')).resolves.toBeUndefined()
  })

  it('motor hata verirse silme akışını bozmaz (yutulur, loglanır)', async () => {
    useDmStore().channels = [dm('dm1', 'DM')]
    const store = useE2eeStore()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    store.engine = { forgetMessage: vi.fn().mockRejectedValue(new Error('depo')) } as never
    await expect(store.forgetMessage('dm1', 'm1')).resolves.toBeUndefined()
  })
})
