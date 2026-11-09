import { requireOptionalNativeModule, NativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

// C50: MessagingStyle sohbet bildirimi (WhatsApp tarzı). Yalnız Android.
// Modül yalnız çizer; metin/kime-gösterilir kararı JS'te (conversationPush.ts).

export type ConversationNotificationParams = {
  conversationId: string;
  conversationTitle: string | null;
  isGroup: boolean;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  conversationIconUrl: string | null;
  text: string;
  timestamp: number;
  /** Mevcut mesaj bildirim kanalı (push.ts MESSAGE_CHANNEL_ID). */
  notificationChannelId: string;
  /** "Ben" kişisinin adı (i18n mobile.notifications.me). */
  meName: string;
  /** Vurgu rengi (app.json expo-notifications.color). */
  color: string | null;
  /** Dokunma yönlendirmesi için geri taşınır. */
  type: string | null;
  guildId: string | null;
  messageId: string | null;
};

export type ConversationTap = {
  conversationId: string;
  type: string | null;
  guildId: string | null;
  messageId: string | null;
};

type TapEvents = { onTap: (tap: ConversationTap) => void };

declare class NativeConversationNotificationModule extends NativeModule<TapEvents> {
  show(params: ConversationNotificationParams): Promise<void>;
  dismiss(conversationId: string): Promise<void>;
  getInitialTap(): ConversationTap | null;
}

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeConversationNotificationModule>('ConversationNotification')
    : null;

/** Yerel modül yüklü mü (eski/uyumsuz derlemede false). Push kaydında `format: 2` buna bağlı. */
export const isConversationNotificationAvailable = native !== null;

export function showConversationNotification(params: ConversationNotificationParams): Promise<void> {
  return native?.show(params) ?? Promise.resolve();
}

export function dismissConversationNotification(conversationId: string): Promise<void> {
  return native?.dismiss(conversationId) ?? Promise.resolve();
}

/** Uygulamayı bildirime dokunarak açan intent (soğuk açılış); bir kez teslim edilir. */
export function getInitialConversationTap(): ConversationTap | null {
  return native?.getInitialTap() ?? null;
}

/** Uygulama açıkken/arka plandayken gelen dokunma. Dönen fonksiyon aboneliği kaldırır. */
export function addConversationTapListener(listener: (tap: ConversationTap) => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener('onTap', listener);
  return () => sub.remove();
}
