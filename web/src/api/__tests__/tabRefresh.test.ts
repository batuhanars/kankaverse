import { describe, it, expect, vi } from 'vitest'
import {
  createTabRefresher,
  type AuthChannelMessage,
  type ChannelLike,
  type LockManagerLike,
} from '../tabRefresh'

/** Tüm "sekmelerin" paylaştığı sahte Web Locks: istekler sırayla çalışır. */
function fakeLocks(): LockManagerLike {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    request<T>(_name: string, cb: () => Promise<T>): Promise<T> {
      const run = tail.then(cb)
      tail = run.catch(() => {})
      return run
    },
  }
}

/** Sahte BroadcastChannel: gönderen hariç herkese (asenkron) iletir. */
function fakeBus() {
  const members: ChannelLike[] = []
  return {
    join(): ChannelLike {
      const ch: ChannelLike = {
        onmessage: null,
        postMessage(message: AuthChannelMessage) {
          for (const m of members) {
            if (m !== ch) setTimeout(() => m.onmessage?.({ data: message }), 0)
          }
        },
      }
      members.push(ch)
      return ch
    },
  }
}

function makeTab(
  locks: LockManagerLike | null,
  bus: ReturnType<typeof fakeBus>,
  doRefresh: () => Promise<string>,
  onSignedOut?: () => void,
) {
  const state = { token: 'old' as string | null }
  const tab = createTabRefresher({
    getToken: () => state.token,
    setToken: (t) => (state.token = t),
    doRefresh: async () => {
      const t = await doRefresh()
      state.token = t
      return t
    },
    onSignedOut,
    locks,
    channel: bus.join(),
    settleMs: 5,
  })
  return { tab, state }
}

describe('sekmeler arası tek yenileme (D108 §2.2)', () => {
  it('iki sekme aynı anda 401 alınca ağa TEK refresh gider, ikisi de aynı token ile döner', async () => {
    const locks = fakeLocks()
    const bus = fakeBus()
    const network = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return 'new-1'
    })
    const a = makeTab(locks, bus, network)
    const b = makeTab(locks, bus, network)
    const [ta, tb] = await Promise.all([a.tab.refresh('old'), b.tab.refresh('old')])
    expect(network).toHaveBeenCalledTimes(1)
    expect(ta).toBe('new-1')
    expect(tb).toBe('new-1')
    expect(b.state.token).toBe('new-1') // yayınla kendi sessionStorage karşılığına yazıldı
  })

  it('kilit yoksa (geri düşme) sekme kendi yenilemesini yapar', async () => {
    const bus = fakeBus()
    const network = vi.fn(() => Promise.resolve('n'))
    const a = makeTab(null, bus, network)
    await a.tab.refresh('old')
    expect(network).toHaveBeenCalledTimes(1)
  })

  it('çıkış yayını diğer sekmelere ulaşır', async () => {
    const locks = fakeLocks()
    const bus = fakeBus()
    const out = vi.fn()
    const a = makeTab(locks, bus, () => Promise.resolve('x'))
    makeTab(locks, bus, () => Promise.resolve('x'), out)
    a.tab.announceSignedOut()
    await new Promise((r) => setTimeout(r, 10))
    expect(out).toHaveBeenCalledTimes(1)
  })
})
