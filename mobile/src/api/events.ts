import http from './http';

// Sprint M1j sözleşme §2 — alanlar backend `EventDto` şeklinden (events.service.ts `toEventDto`)
// ve web `types/index.ts` EventDto'sundan birebir okundu. Yeni uç YOK; V3'te yazılan hat aynen
// kullanılıyor.

export const EventLocationType = {
  VOICE_CHANNEL: 'VOICE_CHANNEL',
  EXTERNAL: 'EXTERNAL',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type EventLocationType = (typeof EventLocationType)[keyof typeof EventLocationType];

export const EventRecurrence = {
  NONE: 'NONE',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type EventRecurrence = (typeof EventRecurrence)[keyof typeof EventRecurrence];

export type EventStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELED';

export interface EventDto {
  id: string;
  guildId: string;
  creatorId: string;
  name: string;
  description: string | null;
  locationType: EventLocationType;
  channelId: string | null;
  channelName: string | null;
  externalLocation: string | null;
  /** ÇAPA tarih — tekrarlayan etkinlikte GÖSTERİLMEZ, `occurrenceStartAt` gösterilir. */
  startAt: string;
  endAt: string | null;
  /**
   * 🔴 Kartta/önizlemede kullanılan tarih. Tekrarlayan etkinliğin "bir sonraki" örneğini backend
   * hesaplar (`occurrence.util.ts`); istemci **yeniden hesaplamaz** (sözleşme §2).
   */
  occurrenceStartAt: string;
  occurrenceEndAt: string | null;
  recurrence: EventRecurrence;
  status: EventStatus;
  interestedCount: number;
  interestedByMe: boolean;
  createdAt: string;
  /** Yalnız tarama-CLEAN'de dolu presigned GET URL; null ise kapak gösterilmez. */
  coverImageUrl: string | null;
}

export interface CreateEventBody {
  name: string;
  description?: string;
  locationType: EventLocationType;
  /** Yalnız VOICE_CHANNEL'da gönderilir. */
  channelId?: string;
  /** Yalnız EXTERNAL'da gönderilir. */
  externalLocation?: string;
  startAt: string;
  /** Opsiyonel bitiş. Update'te: `undefined` → değişmez · `null` → kaldır · string → yeni değer. */
  endAt?: string | null;
  recurrence?: EventRecurrence;
}

/**
 * 🔴 `coverImageId` bilinçli olarak bu tipte YOK (sözleşme §2).
 *
 * Backend semantiği: `undefined` → kapak değişmez · `null` → **kapağı siler** · string → yeni kapak.
 * Mobilde kapak yükleme yüzeyi yok (yalnız gösterim), dolayısıyla alanı payload'a koymanın tek
 * sonucu web'den yüklenmiş kapağı sessizce silmek olurdu. Alan tipe hiç girmesin ki yanlışlıkla
 * gönderilemesin.
 */
export type UpdateEventBody = Partial<CreateEventBody>;

export const eventsApi = {
  async listByGuild(guildId: string): Promise<EventDto[]> {
    const res = await http.get<EventDto[]>(`/guilds/${guildId}/events`);
    return res.data;
  },
  /** Düzenleme formunun veri kaynağı — etkinliği route parametresinde serileştirmek yerine. */
  async get(eventId: string): Promise<EventDto> {
    const res = await http.get<EventDto>(`/events/${eventId}`);
    return res.data;
  },
  async create(guildId: string, body: CreateEventBody): Promise<EventDto> {
    const res = await http.post<EventDto>(`/guilds/${guildId}/events`, body);
    return res.data;
  },
  async update(eventId: string, body: UpdateEventBody): Promise<EventDto> {
    const res = await http.patch<EventDto>(`/events/${eventId}`, body);
    return res.data;
  },
  async remove(eventId: string): Promise<null> {
    const res = await http.delete<null>(`/events/${eventId}`);
    return res.data;
  },
  /** İdempotent — iki uç da güncel `EventDto` döner (sayaç sunucudan gelir). */
  async addInterest(eventId: string): Promise<EventDto> {
    const res = await http.post<EventDto>(`/events/${eventId}/interest`);
    return res.data;
  },
  async removeInterest(eventId: string): Promise<EventDto> {
    const res = await http.delete<EventDto>(`/events/${eventId}/interest`);
    return res.data;
  },
};
