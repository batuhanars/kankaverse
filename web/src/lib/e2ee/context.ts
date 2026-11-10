// Bir MLS işlemi boyunca paylaşılan bağlam + işlemleri sıraya sokan kilit (E1 §1.7).
import { SerialQueue, type Device } from '@kankaverse/e2ee-core'
import type { e2eeApi } from '@/api/e2ee'
import type { LocalStore } from './localStore'

export type E2eeApi = typeof e2eeApi

/** Mesajlaşmayı durduran, kullanıcıya gösterilen uyarı türleri (sessiz devam yok, §3.3). */
export type WarningKind = 'unknown-device' | 'removed' | 'device-broken'

export interface E2eeContext {
  api: E2eeApi
  store: LocalStore
  /** Bu işlemde diskten tazelenen cihaz (sekmeler arası bayat durum olmasın). */
  getDevice(): Promise<Device>
  warn(channelId: string, kind: WarningKind): void
}

/** Şifreli yük henüz gönderilemez (Welcome gelmedi, anahtar yok): kullanıcıya "tekrar dene". */
export class GroupNotReadyError extends Error {}

// Aynı sekmedeki işler art arda (SerialQueue); farklı sekmeler Web Locks ile art arda. İkisi de şart:
// MLS durumu "oku, değiştir, yaz" ile ilerler, iki eşzamanlı işlem aynı eski durumdan türeyip
// birinin sonucunu sessizce ezer. Kilit mesaj/ağ boyunca tutulur; sıra, hız değil doğruluk içindir.
const queues = new Map<string, SerialQueue>()

export function runExclusive<T>(userId: string, task: () => Promise<T>): Promise<T> {
  let queue = queues.get(userId)
  if (!queue) queues.set(userId, (queue = new SerialQueue()))
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) return queue.run(task)
  return queue.run(() => locks.request(`kv-e2ee:${userId}`, task))
}
