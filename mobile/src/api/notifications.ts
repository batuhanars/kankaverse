import http from './http';

// Sprint M1a contract §3 + api/src/modules/notifications/notifications.controller.ts.
// M1a'da yalnız üç uç bağlıydı (GET list · GET unread-count · POST read-all) ve tekil okundu
// (`:id/read`) bilinçle dışarıda bırakılmıştı. Sprint M1d-0 DoD turunda (sahip bulgusu 2026-07-31)
// tekil ucun eksikliği kusura dönüştü: bildirime dokunmak yönlendiriyor ama okundu işaretlemiyordu.
// Web bu ucu Sprint C1'den beri kullanıyor (NotificationBell.vue → markRead(n.id)); mobil ona hizalandı.
// Tercih (prefs) uçları hâlâ bağlı DEĞİL.
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
};
