// E5a §4.3: zamanlayıcı aralığı ve geri çekilmesi. Sahte saat + sahte zamanlayıcı; gerçek bekleme yok.
import { describe, expect, it } from 'vitest'
import type { BackupRunResult } from '../src/backup'
import { BACKUP_FIRST_DELAY_MS, BACKUP_MAX_DELAY_MS, BackupScheduler } from '../src/backupScheduler'

const MIN = 60_000
const HOUR = 60 * MIN

/** Sahte zamanlayıcı: `advance` saati ilerletir, vadesi gelenleri sırayla çalıştırır. */
class FakeClock {
  now = 1_000_000
  private seq = 0
  private tasks = new Map<number, { at: number; fn: () => void }>()
  timers = {
    set: (fn: () => void, ms: number) => {
      const id = ++this.seq
      this.tasks.set(id, { at: this.now + ms, fn })
      return id
    },
    clear: (h: unknown) => void this.tasks.delete(h as number),
  }

  get pending(): number[] {
    return [...this.tasks.values()].map((t) => t.at - this.now)
  }

  async advance(ms: number) {
    const target = this.now + ms
    for (;;) {
      const next = [...this.tasks.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      this.tasks.delete(next[0])
      this.now = Math.max(this.now, next[1].at)
      next[1].fn()
      await flush()
    }
    this.now = target
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

function setup(results: BackupRunResult[]) {
  const clock = new FakeClock()
  const calls: number[] = []
  const queue = [...results]
  const scheduler = new BackupScheduler({
    run: async (now) => {
      calls.push(now - clock.now) // hep 0: `now` saatten gelir
      return queue.shift() ?? { status: 'skipped', reason: 'not-dirty' }
    },
    now: () => clock.now,
    timers: clock.timers,
  })
  return { clock, calls, scheduler }
}

const ok: BackupRunResult = { status: 'uploaded', messages: 1, size: 10 }
const fail: BackupRunResult = { status: 'failed' }

describe('BackupScheduler', () => {
  it('start: ilk deneme 1 dk sonra, ondan önce hiçbir şey yok', async () => {
    const { clock, calls, scheduler } = setup([ok])
    scheduler.start()
    await clock.advance(BACKUP_FIRST_DELAY_MS - 1)
    expect(calls).toHaveLength(0)
    await clock.advance(1)
    expect(calls).toHaveLength(1)
  })

  it('sonra en çok 6 saatte bir (başarıda ve yapacak iş yokken)', async () => {
    const { clock, calls, scheduler } = setup([ok, { status: 'skipped', reason: 'not-dirty' }])
    scheduler.start()
    await clock.advance(MIN) // 1. deneme
    await clock.advance(6 * HOUR - 1)
    expect(calls).toHaveLength(1)
    await clock.advance(1) // 2. deneme
    expect(calls).toHaveLength(2)
    await clock.advance(6 * HOUR) // 3. deneme
    expect(calls).toHaveLength(3)
  })

  it('başarısızlıkta üstel geri çekilme: 1, 2, 4 dk ... tavan 6 saat; başarıda sıfırlanır', async () => {
    const { clock, calls, scheduler } = setup(Array(12).fill(fail))
    scheduler.start()
    await clock.advance(MIN) // ilk deneme (başarısız) -> sonraki 1 dk
    expect(clock.pending).toEqual([MIN])
    const delays: number[] = []
    for (let i = 0; i < 10; i++) {
      delays.push(clock.pending[0])
      await clock.advance(clock.pending[0])
    }
    expect(delays).toEqual([MIN, 2 * MIN, 4 * MIN, 8 * MIN, 16 * MIN, 32 * MIN, 64 * MIN, 128 * MIN, 256 * MIN, BACKUP_MAX_DELAY_MS])
    expect(clock.pending[0]).toBe(BACKUP_MAX_DELAY_MS) // tavanda kalır
    expect(calls.length).toBe(11)

    const fresh = setup([fail, fail, ok, fail])
    fresh.scheduler.start()
    await fresh.clock.advance(MIN) // başarısız -> 1 dk
    await fresh.clock.advance(MIN) // başarısız -> 2 dk
    await fresh.clock.advance(2 * MIN) // başarı -> 6 saat
    expect(fresh.clock.pending).toEqual([BACKUP_MAX_DELAY_MS])
    await fresh.clock.advance(BACKUP_MAX_DELAY_MS) // başarısız -> geri çekilme yeniden 1 dk
    expect(fresh.clock.pending).toEqual([MIN])
  })

  it('onBackground: hemen dener; çalışan deneme varken ikinci deneme açılmaz; sonra zamanlayıcı yeniden kurulur', async () => {
    const { clock, calls, scheduler } = setup([ok, ok])
    scheduler.start()
    scheduler.onBackground()
    scheduler.onBackground() // ilki bitmeden: yok sayılır
    await flush()
    expect(calls).toHaveLength(1)
    expect(clock.pending).toEqual([BACKUP_MAX_DELAY_MS]) // 1 dk'lık ilk zamanlayıcı iptal, 6 saat kuruldu
    scheduler.onBackground()
    await flush()
    expect(calls).toHaveLength(2)
  })

  it('stop sonrası hiçbir şey çalışmaz; start çağrılmadan onBackground yok sayılır', async () => {
    const { clock, calls, scheduler } = setup([ok])
    scheduler.onBackground()
    await flush()
    expect(calls).toHaveLength(0)
    scheduler.start()
    scheduler.stop()
    await clock.advance(7 * HOUR)
    expect(calls).toHaveLength(0)
    expect(clock.pending).toEqual([])
  })

  it('run fırlatsa da zamanlayıcı ölmez (başarısız sayılır, geri çekilir)', async () => {
    const clock = new FakeClock()
    let n = 0
    const scheduler = new BackupScheduler({
      run: async () => {
        n++
        throw new Error('beklenmedik')
      },
      now: () => clock.now,
      timers: clock.timers,
    })
    scheduler.start()
    await clock.advance(MIN)
    expect(n).toBe(1)
    expect(clock.pending).toEqual([MIN])
  })
})
