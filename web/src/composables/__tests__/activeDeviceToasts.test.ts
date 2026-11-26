import { describe, it, expect, vi, beforeEach } from 'vitest'

// C76 K2/K3: telefon ön plandayken OS bildirimi + ses yok; read:self ilgili bildirimi kapatır.
vi.mock('@/router', () => ({ default: { push: vi.fn() } }))
vi.mock('@/i18n', () => ({ i18n: { global: { t: (k: string) => k } } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'me' } }) }))
vi.mock('@/stores/dm', () => ({
  useDmStore: () => ({
    channels: [{ id: 'c1', type: 'DM', otherUser: { username: 'ali' }, members: [] }],
  }),
}))
vi.mock('@/stores/channels', () => ({ useChannelsStore: () => ({ findChannelById: () => null }) }))
vi.mock('@/stores/notificationPrefs', () => ({
  useNotificationPrefsStore: () => ({ isMuted: () => false, effectiveLevel: () => 'ALL' }),
}))
vi.mock('@/utils/notificationTone', () => ({ playNotificationTone: vi.fn() }))

import { maybeFireDmToast } from '../useMessageToasts'
import { setMobileForeground, closeOsNotificationsForChannel } from '@/utils/activeDevice'
import { playNotificationTone } from '@/utils/notificationTone'

class FakeNotification {
  static created: FakeNotification[] = []
  closed = false
  private listeners = new Map<string, Array<() => void>>()
  onclick: (() => void) | null = null
  title: string
  opts: { tag?: string }
  constructor(title: string, opts: { tag?: string }) {
    this.title = title
    this.opts = opts
    FakeNotification.created.push(this)
  }
  addEventListener(type: string, cb: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb])
  }
  close() {
    this.closed = true
    this.listeners.get('close')?.forEach((cb) => cb())
  }
}

const payload = (channelId: string) => ({
  channelId,
  lastMessage: { content: 'selam' },
  senderId: 'other',
})

describe('C76 aktif cihaz: OS bildirimi', () => {
  beforeEach(() => {
    FakeNotification.created = []
    vi.mocked(playNotificationTone).mockClear()
    setMobileForeground(false)
    vi.stubGlobal('Notification', FakeNotification)
    vi.stubGlobal('document', { hidden: true, hasFocus: () => false })
    vi.stubGlobal('window', { kankaverse: { isElectron: true, focusWindow: vi.fn() } })
  })

  it('telefon ön planda değilken bildirim çizilir ve ses çalar', () => {
    maybeFireDmToast(payload('c-a'), false)
    expect(FakeNotification.created).toHaveLength(1)
    expect(playNotificationTone).toHaveBeenCalledTimes(1)
  })

  it('telefon ön plandayken ne bildirim ne ses', () => {
    setMobileForeground(true)
    maybeFireDmToast(payload('c-b'), false)
    expect(FakeNotification.created).toHaveLength(0)
    expect(playNotificationTone).not.toHaveBeenCalled()
  })

  it('read:self yolu: kanalın açık bildirimi kapanır, başka kanalınki kalır', () => {
    maybeFireDmToast(payload('c-c'), false)
    maybeFireDmToast(payload('c-d'), false)
    const [first, second] = FakeNotification.created
    closeOsNotificationsForChannel('c-c')
    expect(first.closed).toBe(true)
    expect(second.closed).toBe(false)
  })
})
