// C75 Rev.6/Rev.7: görülmemiş istek sayacı, toplu ve istek başına görüldü, toplu ret.
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

  it('markRequestSeen yalnız o isteği düşürür; görülmüşse ya da yoksa çağrı yok', async () => {
    const spy = vi.spyOn(dmApi, 'markRequestSeen').mockResolvedValue({ data: null } as never)
    const dm = useDmStore()
    dm.requests = [req('a', true), req('b', true), req('c', false)]
    await dm.markRequestSeen('a')
    expect(spy).toHaveBeenCalledWith('a')
    expect(dm.unseenRequestCount).toBe(1)
    await dm.markRequestSeen('a')
    await dm.markRequestSeen('c')
    await dm.markRequestSeen('yok')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('applyRequestSeen (diğer cihaz) yalnız o isteği görüldü yapar', () => {
    const dm = useDmStore()
    dm.requests = [req('a', true), req('b', true)]
    dm.applyRequestSeen('b')
    expect(dm.requests.map((r) => r.unseen)).toEqual([true, false])
  })

  it('rejectRequestsBatch yalnız sunucunun reddettiklerini düşürür', async () => {
    vi.spyOn(dmApi, 'rejectRequestsBatch').mockResolvedValue({
      data: { rejected: ['a', 'c'] },
    } as never)
    const dm = useDmStore()
    dm.requests = [req('a', true), req('b', false), req('c', true)]
    expect(await dm.rejectRequestsBatch(['a', 'c'])).toBe(2)
    expect(dm.requests.map((r) => r.channelId)).toEqual(['b'])
  })
})
