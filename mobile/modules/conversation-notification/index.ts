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
  /** Simgesiz grup için çizilecek baş harf (yoksa null); grupta gönderen avatarı asla simge olmaz. */
  groupInitial: string | null;
  text: string;
  timestamp: number;
  /** Mevcut mesaj bildirim kanalı (push.ts MESSAGE_CHANNEL_ID). */
  notificationChannelId: string;
  /** "Ben" kişisinin adı (i18n mobile.notifications.me). */
  meName: string;
  /** Kendi statik avatar adresi (grup/ortam bildiriminde "ben" satırları için); yoksa null. */
  meAvatarUrl?: string | null;
  /** Vurgu rengi (app.json expo-notifications.color). */
  color: string | null;
  /** Dokunma yönlendirmesi için geri taşınır. */
  type: string | null;
  guildId: string | null;
  messageId: string | null;
  /** Cevapla eyleminin etiketi (i18n mobile.notifications.reply); yoksa eylem eklenmez. */
  replyLabel?: string | null;
};

export type ConversationTap = {
  /** Native artan kimlik: ayni dokunus olay + getInitialTap ile iki kez gelirse tekillestirilir. */
  tapId?: number;
  conversationId: string;
  type: string | null;
  guildId: string | null;
  messageId: string | null;
};

type TapEvents = { onTap: (tap: ConversationTap) => void };

declare class NativeConversationNotificationModule extends NativeModule<TapEvents> {
  show(params: ConversationNotificationParams): Promise<void>;
  dismiss(conversationId: string): Promise<void>;
  appendOwnReply?(
    conversationId: string,
    text: string,
    timestamp: number,
    meAvatarUrl: string | null,
  ): Promise<boolean>;
  getInitialTap(): ConversationTap | null;
}

const loaded =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeConversationNotificationModule>('ConversationNotification')
    : null;

/**
 * 🔴 2026-11-09 cihaz bulgusu: derleme klasöründe Kotlin modülü eski kalınca paket yeni JS + eski native
 * ile çıktı, `getInitialTap` yoktu ve uygulama açılışta çöktü. Modül ancak beklenen TÜM fonksiyonları
 * taşıyorsa kullanılır; eksikse yokmuş gibi davranılır (cihaz `format: 1` kalır, v1 bildirimleri alır).
 */
const native =
  loaded &&
  typeof loaded.show === 'function' &&
  typeof loaded.dismiss === 'function' &&
  typeof loaded.getInitialTap === 'function'
    ? loaded
    : null;

/** Yerel modül yüklü ve uyumlu mu (eski/uyumsuz derlemede false). Push kaydında `format: 2` buna bağlı. */
export const isConversationNotificationAvailable = native !== null;

export function showConversationNotification(params: ConversationNotificationParams): Promise<void> {
  return native?.show(params) ?? Promise.resolve();
}

export function dismissConversationNotification(conversationId: string): Promise<void> {
  return native?.dismiss(conversationId) ?? Promise.resolve();
}

/** bildirime "ben"den mesaj ekler. Bildirim yoksa/modül eskiyse false. */
export function appendOwnReplyToNotification(
  conversationId: string,
  text: string,
  timestamp: number,
  meAvatarUrl: string | null = null,
): Promise<boolean> {
  return native?.appendOwnReply?.(conversationId, text, timestamp, meAvatarUrl) ?? Promise.resolve(false);
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
