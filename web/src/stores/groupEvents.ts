import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dmApi } from '@/api/dm'
import type { GroupDmEventDto } from '@/types'

/**
 * C64 — grup DM üyelik olay satırları ("Ayla gruptan ayrıldı"). Mesaj DEĞİLDİR: okunmadı, bildirim, ses,
 * liste sıralaması üretmez; yalnız açık sohbetin akışında satır olarak çizilir.
 */
export const useGroupEventsStore = defineStore('groupEvents', () => {
  const byChannel = ref<Record<string, GroupDmEventDto[]>>({})

  async function load(channelId: string): Promise<void> {
    try {
      const res = await dmApi.getGroupEvents(channelId)
      // Yükleme sürerken soketten düşen olay kaybolmasın: id ile birleştir.
      const live = byChannel.value[channelId] ?? []
      const ids = new Set(res.data.map((e) => e.id))
      byChannel.value[channelId] = [...res.data, ...live.filter((e) => !ids.has(e.id))]
    } catch {
      // satırlar ek bilgi; hata sohbeti bozmaz
    }
  }

  function add(event: GroupDmEventDto): void {
    const list = byChannel.value[event.channelId] ?? []
    if (list.some((e) => e.id === event.id)) return
    byChannel.value[event.channelId] = [...list, event]
  }

  function clear(channelId: string): void {
    delete byChannel.value[channelId]
  }

  return { byChannel, load, add, clear }
})
