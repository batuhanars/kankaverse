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
  // Sprint R14 — ortamda yeni etkinlik oluşturuldu (`preview` = etkinlik adı)
  EVENT_CREATED: 'EVENT_CREATED',
  // C46 — mesajına tepki verildi (`preview` = emoji + mesaj önizlemesi)
  REACTION: 'REACTION',
  // C49 — yapay zeka video arka planda bitti / üretilemedi (`preview` = istem, `aiVideoId` dolu)
  AI_VIDEO_READY: 'AI_VIDEO_READY',
  AI_VIDEO_FAILED: 'AI_VIDEO_FAILED',
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
  aiVideoId: string | null;
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
  // Sprint R14 — yalnız GUILD satırında anlamlı; CHANNEL satırında sunucu her zaman false döner.
  suppressEveryone: boolean;
  suppressEvents: boolean;
  // R15 — rol bahsetmelerini sustur (yine yalnız GUILD).
  suppressRoleMentions: boolean;
}

// PUT gövdesi — sözleşme §2 "verilmeyen alan korunur" (kısmi update, tüm alanlar opsiyonel).
export interface SetNotificationPrefBody {
  targetType: NotifTargetType;
  targetId: string;
  muted?: boolean;
  mutedUntil?: string | null;
  level?: NotificationLevel;
  // R14 — sunucu bu ikisini yalnız targetType=GUILD ile kabul eder (aksi 400 INVALID_PREF_TARGET).
  suppressEveryone?: boolean;
  suppressEvents?: boolean;
  suppressRoleMentions?: boolean;
}

// Sprint M3 §2.2 — push token uçları. Gövde/imza sözleşmeden birebir (`CreatePushTokenDto`,
// `api/src/modules/notifications/dto/push-token.dto.ts`): `token` Expo biçimi
// (`ExponentPushToken[...]`), `platform` yalnız 'android'|'ios' (bugün yalnız android yazılır),
// `deviceName` teşhis amaçlı ve kullanıcıya gösterilmez.
export interface RegisterPushTokenBody {
  token: string;
  platform: 'android' | 'ios';
  deviceName?: string;
  /** C50: 2 = cihaz veri-yalnız mesaj push'u (v2) çizebilir. Verilmezse sunucu 1 sayar. */
  format?: 1 | 2;
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
  /** Upsert (token unique; userId çağırandan taşınır — bkz. contract §2.1 T&S notu). */
  async registerPushToken(body: RegisterPushTokenBody): Promise<null> {
    const res = await http.post<null>('/notifications/push-tokens', body);
    return res.data;
  },
  /** Yalnız kendi token'ını siler; başkasınınki/yok → 404 (sessizce yutulur, bkz. notifications/push.ts). */
  async deletePushToken(token: string): Promise<null> {
    const res = await http.delete<null>(`/notifications/push-tokens/${encodeURIComponent(token)}`);
    return res.data;
  },
};
