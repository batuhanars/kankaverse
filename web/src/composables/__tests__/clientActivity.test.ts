import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick, effectScope } from 'vue'

// C76 Rev.1: aktiflik = görünür VE idle değil.
const sendClientActivity = vi.fn()
// Ortam Node (DOM yok): görünürlük kaynağı sahte ref.
const visibility = ref<'visible' | 'hidden'>('visible')
vi.mock('@vueuse/core', () => ({
  useIdle: vi.fn(),
  useDocumentVisibility: () => visibility,
}))
vi.mock('@/composables/useSocket', () => ({
  useSocket: () => ({ setPresence: (): void => undefined }),
  sendClientActivity: (a: boolean): void => {
    sendClientActivity(a)
  },
}))
vi.mock('@/stores/presence', () => ({
  usePresenceStore: () => ({ manualStatus: 'online' }),
}))

import { useClientActivitySync } from '../useIdlePresence'

function setVisibility(state: 'visible' | 'hidden') {
  visibility.value = state
}

describe('useClientActivitySync', () => {
  beforeEach(() => {
    sendClientActivity.mockClear()
    setVisibility('visible')
  })

  it('gizliyken false, görünür ve idle değilken true', async () => {
    setVisibility('hidden')
    const idle = ref(false)
    const scope = effectScope()
    const active = scope.run(() => useClientActivitySync(idle))!
    expect(active.value).toBe(false)
    expect(sendClientActivity).toHaveBeenLastCalledWith(false)

    setVisibility('visible')
    await nextTick()
    expect(active.value).toBe(true)
    expect(sendClientActivity).toHaveBeenLastCalledWith(true)

    setVisibility('hidden')
    await nextTick()
    expect(sendClientActivity).toHaveBeenLastCalledWith(false)
    scope.stop()
  })

  it('görünür ama idle ise false', async () => {
    const idle = ref(false)
    const scope = effectScope()
    const active = scope.run(() => useClientActivitySync(idle))!
    expect(active.value).toBe(true)
    idle.value = true
    await nextTick()
    expect(active.value).toBe(false)
    expect(sendClientActivity).toHaveBeenLastCalledWith(false)
    scope.stop()
  })
})
