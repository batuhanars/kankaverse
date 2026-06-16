import { NotificationType } from '@prisma/client';

/** §5 — NotificationDto: istemciye dönen bildirim şekli. */
export interface NotificationDto {
  id: string;
  type: NotificationType; // MENTION | FRIEND_REQUEST | FRIEND_ACCEPT | GUILD_INVITE
  actor: { id: string; username: string; avatarUrl: string | null } | null; // read-time User join (taze); SetNull → null
  guildId: string | null;
  guildName?: string | null; // GUILD_INVITE (ve guildId taşıyan bildirimler) için read-time guild.name çözümü
  channelId: string | null;
  messageId: string | null;
  preview: string | null; // GUILD_INVITE: davet KODU (frontend /invite/${preview} kurar)
  readAt: string | null; // null = okunmamış
  createdAt: string;
}

/** create() girdisi — userId ayrı parametre, geri kalanı buradan. */
export interface CreateNotificationData {
  type: NotificationType;
  actorId?: string;
  guildId?: string;
  channelId?: string;
  messageId?: string;
  preview?: string;
}
