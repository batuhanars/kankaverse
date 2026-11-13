import type { GroupDmEventDto } from '@/types'

/**
 * C64 — olay satırlarının mesaj listesindeki yeri (`noticeSlots` ile aynı kural): `index` = o mesajdan ÖNCE
 * çizilir, `messages.length` = son mesajdan sonra. Olay en eski yüklü mesajdan eskiyse ve daha eski sayfa
 * varsa çizilmez (sayfa yüklenince görünür).
 */
export function groupEventSlots(
  events: GroupDmEventDto[],
  messages: { createdAt: string }[],
  hasMore: boolean,
): Map<number, GroupDmEventDto[]> {
  const slots = new Map<number, GroupDmEventDto[]>()
  const sorted = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  for (const e of sorted) {
    const at = Date.parse(e.createdAt)
    let i = messages.findIndex((m) => Date.parse(m.createdAt) > at)
    if (i === -1) i = messages.length
    if (i === 0 && hasMore) continue
    slots.set(i, [...(slots.get(i) ?? []), e])
  }
  return slots
}
