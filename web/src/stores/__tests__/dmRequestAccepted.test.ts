// C75 §3.1: giden isteğe karşı taraftan mesaj gelince (örtük kabul) kilit mevcut `dm.message` akışıyla kalkar.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import type { DmChannelDto } from '@/types'

const pendingOut = () =>
  ({
    type: 'DM',
    id: 'c1',
    lastMessage: null,
    unread: false,
    requestStatus: 'PENDING',
    requestOutgoing: true,
  }) as unknown as DmChannelDto

const payload = (senderId: string) => ({
  channelId: 'c1',
  senderId,
  lastMessage: { id: 'm9', content: 'cevap', createdAt: '2026-11-26T10:00:00.000Z' },
})

describe('dmStore.applyActivity: giden istek kabulü', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().user = { id: 'me' } as never
  })

  it('karşı taraftan mesaj gelince PENDING -> ACCEPTED', async () => {
    const dm = useDmStore()
    dm.channels = [pendingOut()]
    await dm.applyActivity(payload('other'))
    expect((dm.channels[0] as { requestStatus: string }).requestStatus).toBe('ACCEPTED')
  })

  it('kendi mesajımın yankısı durumu değiştirmez', async () => {
    const dm = useDmStore()
    dm.channels = [pendingOut()]
    await dm.applyActivity(payload('me'))
    expect((dm.channels[0] as { requestStatus: string }).requestStatus).toBe('PENDING')
  })

  it('dm.request_accepted: PENDING -> ACCEPTED; kanal yoksa no-op', () => {
    const dm = useDmStore()
    dm.channels = [pendingOut()]
    dm.applyRequestAccepted('yok')
    expect((dm.channels[0] as { requestStatus: string }).requestStatus).toBe('PENDING')
    dm.applyRequestAccepted('c1')
    expect((dm.channels[0] as { requestStatus: string }).requestStatus).toBe('ACCEPTED')
  })
})
