// C75: sunucu PENDING kanalları döndürmez; fetchChannels yerel giden bekleyen kanalı ezmemeli.
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import { dmApi } from '@/api/dm'
import type { DmChannelDto } from '@/types'

vi.mock('@/api/dm', () => ({
  dmApi: { openChannel: vi.fn(), getChannels: vi.fn() },
}))

const ch = (over: Record<string, unknown>) =>
  ({
    type: 'DM',
    id: 'c1',
    lastMessage: null,
    unread: false,
    requestStatus: 'PENDING',
    requestOutgoing: true,
    ...over,
  }) as unknown as DmChannelDto

describe('dmStore.fetchChannels: giden bekleyen kanal korunur', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().user = { id: 'me' } as never
    vi.mocked(dmApi.openChannel).mockResolvedValue({ data: ch({}) } as never)
  })

  it('sunucu PENDING dönmezse yerel kanal listede kalır', async () => {
    vi.mocked(dmApi.getChannels).mockResolvedValue({
      data: [ch({ id: 'x', requestStatus: 'ACCEPTED' })],
    } as never)
    const dm = useDmStore()
    await dm.openChannel('u1')
    await dm.fetchChannels()
    expect(dm.channels.map((c) => c.id).sort()).toEqual(['c1', 'x'])
    expect(dm.activeChannel()?.id).toBe('c1')
  })

  it('sunucu aynı kanalı ACCEPTED dönerse sunucununki geçerli', async () => {
    vi.mocked(dmApi.getChannels).mockResolvedValue({
      data: [ch({ requestStatus: 'ACCEPTED' })],
    } as never)
    const dm = useDmStore()
    await dm.openChannel('u1')
    await dm.fetchChannels()
    expect(dm.channels).toHaveLength(1)
    expect((dm.channels[0] as { requestStatus: string }).requestStatus).toBe('ACCEPTED')
  })

  it('kullanıcı kimliği değişince liste ve aktif kanal sıfırlanır', async () => {
    vi.mocked(dmApi.getChannels).mockResolvedValue({ data: [] } as never)
    const dm = useDmStore()
    await dm.openChannel('u1')
    expect(dm.channels).toHaveLength(1)
    useAuthStore().user = { id: 'other' } as never
    await nextTick()
    expect(dm.channels).toEqual([])
    expect(dm.activeDmChannelId).toBeNull()
  })
})

describe('dmStore.applyRequestResolved (C75 §2.7)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().user = { id: 'me' } as never
    vi.mocked(dmApi.getChannels).mockReset()
  })

  const seed = (dm: ReturnType<typeof useDmStore>) => {
    dm.requests = [{ channelId: 'r1' }, { channelId: 'r2' }] as never
  }

  it('rejected: istek düşer, sayaç azalır, kanal listesi çekilmez', () => {
    const dm = useDmStore()
    seed(dm)
    dm.applyRequestResolved('r1', 'rejected')
    expect(dm.requests.map((r) => r.channelId)).toEqual(['r2'])
    expect(dm.requestCount).toBe(1)
    expect(dmApi.getChannels).not.toHaveBeenCalled()
  })

  it('accepted: istek düşer ve DM listesi tazelenir; hata sessiz, tekrar çağrı idempotent', async () => {
    vi.mocked(dmApi.getChannels).mockRejectedValue(new Error('ağ'))
    const dm = useDmStore()
    seed(dm)
    dm.applyRequestResolved('r1', 'accepted')
    dm.applyRequestResolved('r1', 'accepted')
    await nextTick()
    expect(dm.requests.map((r) => r.channelId)).toEqual(['r2'])
    expect(dmApi.getChannels).toHaveBeenCalledTimes(2)
  })
})
