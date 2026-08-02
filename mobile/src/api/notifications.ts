import http from './http';

// Sprint M1a contract §3 + api/src/modules/notifications/notifications.controller.ts.
// M1a'da yalnız üç uç bağlıydı (GET list · GET unread-count · POST read-all) ve tekil okundu
// (`:id/read`) bilinçle dışarıda bırakılmıştı. Sprint M1d-0 DoD turunda (sahip bulgusu 2026-07-31)
// tekil ucun eksikliği kusura dönüştü: bildirime dokunmak yönlendiriyor ama okundu işaretlemiyordu.
// Web bu ucu Sprint C1'den beri kullanıyor (NotificationBell.vue → markRead(n.id)); mobil ona hizalandı.
// Sprint M2b — tercih (prefs) uçları da bağlandı (aşağıda); backend R12'de yazılmıştı, mobilde hiç
// kullanılmıyordu.
export const NotificationType = {
  MENTION: 'MENTION',
  FRIEND_REQUEST: 'FRIEND_REQUEST',
  FRIEND_ACCEPT: 'FRIEND_ACCEPT',
  GUILD_INVITE: 'GUILD_INVITE',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- enum-like const+type deseni, bkz. api/channels.ts
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export interface NotificationActorDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  actor: NotificationActorDto | null;
  guildId: string | null;
  guildName?: string | null;
  channelId: string | null;
  messageId: string | null;
  preview: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  items: NotificationDto[];
  nextCursor: string | null;
}

// Sprint M2b §2 — bildirim tercihleri (GET/PUT /notifications/prefs). Web
// `web/src/types/index.ts`den birebir (`NotifTargetType`/`NotificationLevel`/`NotificationPrefDto`);
// yeni backend alanı YOK, yalnız mobilde hiç tiplenmemişti.
export const NotifTargetType = {
  GUILD: 'GUILD',
  CHANNEL: 'CHANNEL',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- enum-like const+type deseni, bkz. channels.ts
export type NotifTargetType = (typeof NotifTargetType)[keyof typeof NotifTargetType];

export const NotificationLevel = {
  ALL: 'ALL',
  MENTIONS: 'MENTIONS',
  NONE: 'NONE',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type NotificationLevel = (typeof NotificationLevel)[keyof typeof NotificationLevel];

export interface NotificationPrefDto {
  targetType: NotifTargetType;
  targetId: string;
  muted: boolean;
  // ISO; null = süresiz (muted true iken). Geçmişse mute BİTMİŞ sayılır (§3 çözümleme kuralı).
  mutedUntil: string | null;
  level: NotificationLevel;
}

// PUT gövdesi — sözleşme §2 "verilmeyen alan korunur" (kısmi update, tüm alanlar opsiyonel).
export interface SetNotificationPrefBody {
  targetType: NotifTargetType;
  targetId: string;
  muted?: boolean;
  mutedUntil?: string | null;
  level?: NotificationLevel;
}

export const notificationsApi = {
  async list(cursor?: string): Promise<NotificationListResult> {
    const res = await http.get<NotificationListResult>('/notifications', {
      params: cursor ? { cursor } : undefined,
    });
    return res.data;
  },
  async unreadCount(): Promise<{ count: number }> {
    const res = await http.get<{ count: number }>('/notifications/unread-count');
    return res.data;
  },
  async markAllRead(): Promise<{ count: number }> {
    const res = await http.post<{ count: number }>('/notifications/read');
    return res.data;
  },
  async markRead(id: string): Promise<NotificationDto> {
    const res = await http.post<NotificationDto>(`/notifications/${id}/read`);
    return res.data;
  },
  async getPrefs(): Promise<NotificationPrefDto[]> {
    const res = await http.get<NotificationPrefDto[]>('/notifications/prefs');
    return res.data;
  },
  /** Upsert; kısmi update — yalnız gönderilen alanlar değişir. */
  async setPref(body: SetNotificationPrefBody): Promise<NotificationPrefDto> {
    const res = await http.put<NotificationPrefDto>('/notifications/prefs', body);
    return res.data;
  },
};
