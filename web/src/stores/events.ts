import { defineStore } from 'pinia'
import { ref } from 'vue'
import { eventsApi, type CreateEventPayload, type UpdateEventPayload } from '@/api/events'
import type { EventDto } from '@/types'

// Sprint V3 Etkinlikler §8 / Motor §4 — guild başına etkinlik listesi.
// Liste daima occurrenceStartAt ARTAN sırada tutulur (backend de böyle döner; ilgili örneğe göre
// sıralama → tekrarlayan seriler bir sonraki örneğiyle doğru konumlanır). WS upsert sonrası yeniden sıralanır.
function byStartAsc(a: EventDto, b: EventDto): number {
  return new Date(a.occurrenceStartAt).getTime() - new Date(b.occurrenceStartAt).getTime()
}

export const useEventsStore = defineStore('events', () => {
  const eventsByGuild = ref<Record<string, EventDto[]>>({})

  function eventsFor(guildId: string): EventDto[] {
    return eventsByGuild.value[guildId] ?? []
  }

  function countFor(guildId: string): number {
    return (eventsByGuild.value[guildId] ?? []).length
  }

  async function fetchEvents(guildId: string): Promise<void> {
    const res = await eventsApi.list(guildId)
    eventsByGuild.value[guildId] = [...res.data].sort(byStartAsc)
  }

  // ── WS / yerel reconcile ──
  function upsertEvent(event: EventDto): void {
    const list = eventsByGuild.value[event.guildId] ?? []
    const idx = list.findIndex((e) => e.id === event.id)
    let next: EventDto[]
    if (idx !== -1) {
      next = [...list]
      next[idx] = event
    } else {
      next = [...list, event]
    }
    eventsByGuild.value[event.guildId] = next.sort(byStartAsc)
  }

  function removeEventLocal(guildId: string, eventId: string): void {
    const list = eventsByGuild.value[guildId]
    if (!list) return
    eventsByGuild.value[guildId] = list.filter((e) => e.id !== eventId)
  }

  function findGuildIdByEvent(eventId: string): string | undefined {
    for (const [guildId, events] of Object.entries(eventsByGuild.value)) {
      if (events.some((e) => e.id === eventId)) return guildId
    }
    return undefined
  }

  // ── CRUD action'ları (yanıt EventDto → upsert) ──
  async function createEvent(guildId: string, payload: CreateEventPayload): Promise<EventDto> {
    const res = await eventsApi.create(guildId, payload)
    upsertEvent(res.data)
    return res.data
  }

  async function updateEvent(eventId: string, payload: UpdateEventPayload): Promise<EventDto> {
    const res = await eventsApi.update(eventId, payload)
    upsertEvent(res.data)
    return res.data
  }

  async function deleteEvent(eventId: string, guildId: string): Promise<void> {
    await eventsApi.delete(eventId)
    removeEventLocal(guildId, eventId)
  }

  /**
   * "İlgileniyor" toggle — optimistik. Önce yerel olarak interestedByMe/Count'u
   * çevir, sonra sunucudan otoritatif EventDto ile reconcile et; hata → eski hâle dön.
   */
  async function toggleInterest(eventId: string, guildId: string): Promise<void> {
    const list = eventsByGuild.value[guildId]
    if (!list) return
    const idx = list.findIndex((e) => e.id === eventId)
    if (idx === -1) return
    const prev = list[idx]
    const willInterest = !prev.interestedByMe

    // Optimistik güncelle
    const optimistic: EventDto = {
      ...prev,
      interestedByMe: willInterest,
      interestedCount: Math.max(0, prev.interestedCount + (willInterest ? 1 : -1)),
    }
    const next = [...list]
    next[idx] = optimistic
    eventsByGuild.value[guildId] = next

    try {
      const res = willInterest
        ? await eventsApi.addInterest(eventId)
        : await eventsApi.removeInterest(eventId)
      upsertEvent(res.data) // otoritatif sayaç/durum
    } catch (e) {
      // Geri al
      const cur = eventsByGuild.value[guildId]
      if (cur) {
        const i = cur.findIndex((ev) => ev.id === eventId)
        if (i !== -1) {
          const reverted = [...cur]
          reverted[i] = prev
          eventsByGuild.value[guildId] = reverted
        }
      }
      throw e
    }
  }

  return {
    eventsByGuild,
    eventsFor,
    countFor,
    fetchEvents,
    upsertEvent,
    removeEventLocal,
    findGuildIdByEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    toggleInterest,
  }
})
