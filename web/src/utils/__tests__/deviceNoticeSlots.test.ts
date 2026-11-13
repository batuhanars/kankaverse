import { describe, expect, it } from 'vitest'
import { noticeSlots } from '@/utils/deviceNoticeSlots'

const msg = (iso: string) => ({ createdAt: iso })
const msgs = [msg('2026-11-10T10:00:00Z'), msg('2026-11-10T12:00:00Z')]
const at = (iso: string) => ({ userId: 'u', count: 1, at: Date.parse(iso) })

describe('noticeSlots (E2 §3.3)', () => {
  it('satır, kendinden sonraki ilk mesajın önüne konur; en sondakiler listenin sonuna', () => {
    const slots = noticeSlots([at('2026-11-10T11:00:00Z'), at('2026-11-10T13:00:00Z')], msgs, false)
    expect([...slots.keys()]).toEqual([1, 2])
  })

  it('aynı aralıktaki satırlar zamana göre sıralı tek yuvada toplanır', () => {
    const slots = noticeSlots([at('2026-11-10T11:30:00Z'), at('2026-11-10T11:00:00Z')], msgs, false)
    expect(slots.get(1)?.map((n) => n.at)).toEqual([Date.parse('2026-11-10T11:00:00Z'), Date.parse('2026-11-10T11:30:00Z')])
  })

  it('en eski mesajdan önceki satır: sayfa başıysa en üstte, daha eski sayfa varsa çizilmez', () => {
    const early = at('2026-11-10T09:00:00Z')
    expect(noticeSlots([early], msgs, false).get(0)).toHaveLength(1)
    expect(noticeSlots([early], msgs, true).size).toBe(0)
  })

  it('mesaj yokken satırlar yine de çizilir (indeks 0)', () => {
    expect(noticeSlots([at('2026-11-10T09:00:00Z')], [], false).get(0)).toHaveLength(1)
  })
})
