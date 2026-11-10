import { SerialQueue } from '@kankaverse/e2ee-core'
import type { WithLock } from './ports'

/**
 * Tek JS ortamı için kilit: aynı ada sahip işler art arda (E1 §1.7). Mobil bunu doğrudan kullanır
 * (bildirim görevi de aynı ortamda çalışır, ileride E3 aynı kuyruğa girer). Web bunu Web Locks ile birleştirir.
 */
export function serialLock(): WithLock {
  const queues = new Map<string, SerialQueue>()
  return (name, task) => {
    let queue = queues.get(name)
    if (!queue) queues.set(name, (queue = new SerialQueue()))
    return queue.run(task)
  }
}
