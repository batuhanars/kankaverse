import appConfig from '../../app.json';
import { t } from '@/i18n';
import { setNotificationDefaults } from '../../modules/conversation-notification';
import { MESSAGE_CHANNEL_ID } from './push';

/** Vurgu rengi tek kaynak: app.json `expo-notifications` eklenti ayarı. */
export function accentColor(): string | null {
  for (const plugin of appConfig.expo.plugins as unknown[]) {
    if (Array.isArray(plugin) && plugin[0] === 'expo-notifications') {
      const color = (plugin[1] as { color?: unknown } | undefined)?.color;
      return typeof color === 'string' ? color : null;
    }
  }
  return null;
}

/**
 * E3 Rev.4 §11.2: etiket/renk/"ben" adı native tarafa önbelleklenir; süre dolarsa Kotlin genel metni bunlarla
 * çizer. D94: içerik gizleme ayarı ve gizli metin de aynı önbellekte (Kotlin yalnız okur). Ucuz tek köprü
 * çağrısı, hata sessiz. Görev başında ve ayar değişince çağrılır.
 */
export function cacheNotificationDefaults(hidePreview: boolean): Promise<void> {
  return setNotificationDefaults({
    notificationChannelId: MESSAGE_CHANNEL_ID,
    meName: t('mobile.notifications.me'),
    color: accentColor(),
    replyLabel: t('mobile.notifications.reply'),
    markReadLabel: t('mobile.notifications.markRead'),
    muteLabel: t('mobile.notifications.mute'),
    // C72: native arama bildirimi; gövde şablonları `{name}` ile ham, Kotlin yerine koyar.
    callTitle: t('mobile.call.incomingTitle'),
    callBody: t('mobile.call.incomingBody', { name: '{name}' }),
    callGroupTitle: t('mobile.call.incomingGroupTitle'),
    callGroupBody: t('mobile.call.incomingGroupBody', { name: '{name}' }),
    callRejectLabel: t('call.reject'),
    callJoinLabel: t('mobile.call.joinAction'),
    hidePreview,
    hiddenPreviewText: t('mobile.notifications.hiddenPreview'),
  }).catch(() => undefined);
}
