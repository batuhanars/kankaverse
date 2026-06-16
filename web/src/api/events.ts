import http from './axios'
import type { EventDto, EventRecurrence } from '@/types'

// Sprint V3 Etkinlikler Sözleşmesi §6 — CreateEventDto (frontend payload eşi).
// channelId yalnız VOICE_CHANNEL'da, externalLocation yalnız EXTERNAL'da gönderilir.
export interface CreateEventPayload {
  name: string
  description?: string
  locationType: 'VOICE_CHANNEL' | 'EXTERNAL'
  channelId?: string
  externalLocation?: string
  startAt: string // ISO
  endAt?: string // ISO
  // Motor fazı: backend artık NONE|DAILY|WEEKLY|MONTHLY kabul ediyor.
  recurrence?: EventRecurrence
  // Sprint V3 Etkinlik Kapak Görseli §4 — presign sonrası attachmentId.
  // Update: undefined → değişmez · null → kaldır · string → yeni kapak.
  coverImageId?: string | null
}

// UpdateEventDto = PartialType(CreateEventDto)
export type UpdateEventPayload = Partial<CreateEventPayload>

export const eventsApi = {
  list(guildId: string) {
    return http.get<EventDto[]>(`/guilds/${guildId}/events`)
  },
  get(eventId: string) {
    return http.get<EventDto>(`/events/${eventId}`)
  },
  create(guildId: string, payload: CreateEventPayload) {
    return http.post<EventDto>(`/guilds/${guildId}/events`, payload)
  },
  update(eventId: string, payload: UpdateEventPayload) {
    return http.patch<EventDto>(`/events/${eventId}`, payload)
  },
  delete(eventId: string) {
    return http.delete<null>(`/events/${eventId}`)
  },
  addInterest(eventId: string) {
    return http.post<EventDto>(`/events/${eventId}/interest`)
  },
  removeInterest(eventId: string) {
    return http.delete<EventDto>(`/events/${eventId}/interest`)
  },
}
