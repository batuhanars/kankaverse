import type { DeviceNotice } from '@kankaverse/e2ee-client'

/**
 * E2 §3.3 — "yeni cihaz eklendi" satırlarının mesaj listesindeki yeri: `index` = o mesajdan ÖNCE çizilir,
 * `messages.length` = son mesajdan sonra. Satır zamanı en eski yüklü mesajdan öncesiyse ve daha eski sayfa
 * varsa çizilmez (ayraçla aynı kural: yanlış yeri göstermektense hiç göstermez).
 */
export function noticeSlots(
  notices: DeviceNotice[],
  messages: { createdAt: string }[],
  hasMore: boolean,
): Map<number, DeviceNotice[]> {
  const slots = new Map<number, DeviceNotice[]>()
  for (const n of [...notices].sort((a, b) => a.at - b.at)) {
    let i = messages.findIndex((m) => Date.parse(m.createdAt) > n.at)
    if (i === -1) i = messages.length
    if (i === 0 && hasMore) continue
    slots.set(i, [...(slots.get(i) ?? []), n])
  }
  return slots
}
