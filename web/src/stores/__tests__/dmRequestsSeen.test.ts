// C75 Rev.6: görülmemiş istek sayacı, applyRequestsSeen ve çift çağrı koruması.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import { dmApi } from '@/api/dm'
import type { MessageRequestDto } from '@/types'

const req = (channelId: string, unseen: boolean) =>
  ({
    channelId,
    requester: null,
    preview: '',
    unseen,
    createdAt: '2026-11-26T10:00:00.000Z',
  }) as MessageRequestDto

describe('dmStore: istekler görüldü', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().user = { id: 'me' } as never
    vi.restoreAllMocks()
  })

  it('unseenRequestCount yalnız unseen===true sayar; requestCount toplam kalır', () => {
    const dm = useDmStore()
    dm.requests = [req('a', true), req('b', false), req('c', true)]
    expect(dm.unseenRequestCount).toBe(2)
    expect(dm.requestCount).toBe(3)
  })

  it('applyRequestsSeen hepsini görüldü yapar', () => {
    const dm = useDmStore()
    dm.requests = [req('a', true), req('b', true)]
    dm.applyRequestsSeen()
    expect(dm.unseenRequestCount).toBe(0)
    expect(dm.requestCount).toBe(2)
  })

  it('markRequestsSeen uçuştayken çift çağrı yapmaz; görülmemiş yoksa çağrı yok', async () => {
    const spy = vi.spyOn(dmApi, 'markRequestsSeen').mockResolvedValue({ data: null } as never)
    const dm = useDmStore()
    await dm.markRequestsSeen()
    expect(spy).not.toHaveBeenCalled()
    dm.requests = [req('a', true)]
    await Promise.all([dm.markRequestsSeen(), dm.markRequestsSeen()])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(dm.unseenRequestCount).toBe(0)
  })
})
