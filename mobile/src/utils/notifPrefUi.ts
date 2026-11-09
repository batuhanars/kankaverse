import type { SelectOption } from '@/components/guild/SelectSheet';
import { NotificationLevel } from '@/api/notifications';
import { t } from '@/i18n';

/**
 * Sprint M2b — bildirim tercihi UI yardımcıları. Süre seçenekleri + biçimlendirme üç panelde
 * (DM menüsü · Kanal menüsü · Ortam bildirim ekranı) BİREBİR aynı gerekiyor — Rule of Three üçüncü
 * kullanımda dolduğu için burada tek kaynağa çıkarıldı (web `MuteDurationFlyout.vue` karşılığı).
 */

/** C55: bildirimden "Sessize al" süresi (dakika); süre listesindeki 8 saat seçeneğiyle aynı sabit. */
export const NOTIFICATION_QUICK_MUTE_MINUTES = 480;

/** `SelectSheet` süre seçenekleri — sözleşme §4.5, i18n anahtarları zaten var. `'forever'` = süresiz. */
export function getMuteDurationOptions(): SelectOption[] {
  return [
    { value: '15', label: t('guildMenu.mute15m') },
    { value: '60', label: t('guildMenu.mute1h') },
    { value: '180', label: t('guildMenu.mute3h') },
    { value: String(NOTIFICATION_QUICK_MUTE_MINUTES), label: t('guildMenu.mute8h') },
    { value: '1440', label: t('guildMenu.mute24h') },
    { value: 'forever', label: t('guildMenu.muteForever') },
  ];
}

/** `getMuteDurationOptions()` seçim değerini dakikaya çevirir — `null` = süresiz. */
export function muteMinutesFromValue(value: string): number | null {
  return value === 'forever' ? null : Number(value);
}

/** `SelectSheet` seviye seçenekleri — sözleşme §4.6, i18n anahtarları zaten var. */
export function getNotificationLevelOptions(): SelectOption[] {
  return [
    { value: NotificationLevel.ALL, label: t('guildMenu.notificationsAll') },
    { value: NotificationLevel.MENTIONS, label: t('guildMenu.notificationsMentions') },
    { value: NotificationLevel.NONE, label: t('guildMenu.notificationsNone') },
  ];
}

/**
 * Susturma bitiş etiketi — web `MuteDurationFlyout.vue` `untilLabel` computed'inin mobil karşılığı,
 * AYNI biçim (tr-TR yereli, bugünse yalnız saat, değilse "{gün} {ay}" öneki).
 */
export function muteUntilLabel(mutedUntil: string | null): string {
  if (!mutedUntil) return t('guildMenu.muteUntilForever');
  const d = new Date(mutedUntil);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const date = sameDay ? '' : `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} `;
  return t('guildMenu.muteUntil', { when: `${date}${time}` });
}
