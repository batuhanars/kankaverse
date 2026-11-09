// C50 — veri-yalnız mesaj push'u (v2) veri biçimi. Sözleşme: SPRINT_C50 §1.
// Telefonda arka plan görevi bu nesneyi alır, bildirimi istemci çizer; sunucu title/body göndermez.

/** FCM 4 KB sınırı için önizleme üst sınırı. */
export const V2_TEXT_MAX = 200;
/** İstemciye giden "okundu" mesajındaki en çok sohbet sayısı. */
export const V2_READ_MAX_IDS = 50;
/** Bekleyen v2 bildirim işareti ömrü (7 gün). */
export const V2_PENDING_TTL_SECONDS = 7 * 24 * 60 * 60;

export type V2MessageType = 'DM_MESSAGE' | 'CHANNEL_MESSAGE' | 'MENTION';

export interface V2MessageData {
  v: 2;
  kind: 'message';
  type: V2MessageType;
  conversationId: string;
  guildId: string | null;
  messageId: string | null;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  isGroup: boolean;
  conversationTitle: string | null;
  conversationIconUrl: string | null;
  text: string;
  timestamp: number;
}

export interface V2ReadData {
  v: 2;
  kind: 'read';
  conversationIds: string[];
}

/** C53 — gelen 1-1 arama. Anahtar `callChannelId` (asla `channelId`: expo-notifications onu Android kanalı sanır). */
export interface V2CallData {
  v: 2;
  kind: 'call';
  callChannelId: string;
  callerId: string;
  callerName: string;
  callerAvatarUrl: string | null;
}

/** C53 — arama bitti (iptal / başka cihazda kabul-ret): istemci zili kapatır. */
export interface V2CallEndData {
  v: 2;
  kind: 'call_end';
  callChannelId: string;
}

/** Redis anahtarı: bu kullanıcıya bu sohbet için v2 bildirimi gönderildi (okundu push'u buna bakar). */
export function v2PendingKey(userId: string, conversationId: string): string {
  return `push:pending:${userId}:${conversationId}`;
}

/** 200 karakteri aşan metin `…` ile kısalır. */
export function clampV2Text(text: string): string {
  return text.length > V2_TEXT_MAX ? `${text.slice(0, V2_TEXT_MAX - 1)}…` : text;
}

/** `messageDto.createdAt` (ISO) → ms; çözülemezse şimdiki an. */
export function v2Timestamp(createdAt: unknown): number {
  const ms =
    typeof createdAt === 'string' || createdAt instanceof Date ? +new Date(createdAt) : NaN;
  return Number.isFinite(ms) ? ms : Date.now();
}

/** Ortam kanalı başlığı: "#kanal · Ortam Adı" (kanal adı yoksa yedek ad, v1 başlığıyla aynı kural). */
export function channelConversationTitle(
  channelName: string | null | undefined,
  guildName: string | null | undefined,
  fallback: string,
): string {
  return [channelName ? `#${channelName}` : fallback, guildName].filter(Boolean).join(' · ');
}
