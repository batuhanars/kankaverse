import { requireOptionalNativeModule, NativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

// SPIKE (spike/data-only-push): MessagingStyle sohbet bildirimi. Yalniz Android.

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
  /** Mevcut mesaj bildirim kanali (push.ts MESSAGE_CHANNEL_ID). */
  notificationChannelId: string;
};

declare class NativeConversationNotificationModule extends NativeModule {
  show(params: ConversationNotificationParams): Promise<void>;
}

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeConversationNotificationModule>('ConversationNotification')
    : null;

export function showConversationNotification(params: ConversationNotificationParams): Promise<void> {
  return native?.show(params) ?? Promise.resolve();
}
