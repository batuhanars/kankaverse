import { useState } from 'react';
import { ChannelType, type ChannelSummaryDto } from '@/api/channels';
import { NotifTargetType, type NotificationLevel } from '@/api/notifications';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { SelectSheet } from '@/components/guild/SelectSheet';
import { getMuteDurationOptions, getNotificationLevelOptions, muteMinutesFromValue } from '@/utils/notifPrefUi';
import { ChannelMenuSheet } from './ChannelMenuSheet';
import { t } from '@/i18n';

interface Props {
  /** Uzun basılan kanal; null ise panel kapalı. */
  channel: ChannelSummaryDto | null;
  guildId: string;
  guildName: string;
  guildIconUrl?: string | null;
  canManage: boolean;
  onClose: () => void;
  onMarkRead: (channel: ChannelSummaryDto) => void;
  onEdit: (channel: ChannelSummaryDto) => void;
}

/**
 * Sprint M2b §4.2 — kanal panelinin yerleşimi. `DmMenuHost`ın kanal eşdeğeri (aynı gerekçe: `home.tsx`
 * yalnız "hangi kanala uzun basıldı" bilgisini tutar; panelin iç akışı — sustur süresi/seviye seçici,
 * ikisi de yeni bu sprintte — buraya taşındı, aksi hâlde ana ekran 300 satır eşiğini fazlasıyla aşardı).
 *
 * Süre/seviye seçici `ChannelMenuSheet`in ÜSTÜNE değil YERİNE açılır (`subSheet` — `DmMenuHost` ile
 * birebir aynı desen): iki `Modal` aynı anda görünseydi arka arkaya iki karartılmış perde binerdi.
 * `channel` prop'u BURADA sıfırlanmaz, yalnız hangi katman göründüğü değişir.
 */
export function ChannelMenuHost({
  channel,
  guildId,
  guildName,
  guildIconUrl,
  canManage,
  onClose,
  onMarkRead,
  onEdit,
}: Props) {
  const [subSheet, setSubSheet] = useState<'none' | 'mute' | 'level'>('none');

  const channelId = channel?.id ?? '';
  // `muted`/`mutedUntil` kanalın KENDİ kaydı (fallback yok — web `useChannelMenuActions.isChannelMuted`
  // ile aynı kural); `level` kanalın kaydı yoksa ortama düşer (§3).
  const muted = useNotificationPrefsStore((s) => s.isMuted(NotifTargetType.CHANNEL, channelId));
  const mutedUntil = useNotificationPrefsStore((s) =>
    s.mutedUntilFor(NotifTargetType.CHANNEL, channelId),
  );
  const level = useNotificationPrefsStore((s) =>
    s.effectiveLevel(NotifTargetType.CHANNEL, channelId, channel?.guildId),
  );

  function closeAll() {
    setSubSheet('none');
    onClose();
  }

  // Hata SESSİZ yutulur: bu geçici bir menü, store zaten iyimser yazıp hatada eski değere geri
  // alıyor (kullanıcı değişikliğin tutmadığını görür). Kalıcı ekran (`guild-notifications.tsx`)
  // hatayı Türkçe mesajla görünür gösteriyor — sözleşme §4.4 yalnız o ekran için bunu istiyor.
  function onMutePress(currentlyMuted: boolean) {
    if (!channel) return;
    if (currentlyMuted) {
      void useNotificationPrefsStore
        .getState()
        .setPref({ targetType: NotifTargetType.CHANNEL, targetId: channel.id, muted: false, mutedUntil: null })
        .catch(() => {});
      closeAll();
      return;
    }
    setSubSheet('mute');
  }

  function onMuteDurationSelect(value: string) {
    if (channel) {
      const minutes = muteMinutesFromValue(value);
      const nextMutedUntil = minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString();
      void useNotificationPrefsStore
        .getState()
        .setPref({
          targetType: NotifTargetType.CHANNEL,
          targetId: channel.id,
          muted: true,
          mutedUntil: nextMutedUntil,
        })
        .catch(() => {});
    }
    closeAll();
  }

  function onLevelSelect(value: string) {
    if (channel) {
      void useNotificationPrefsStore
        .getState()
        .setPref({ targetType: NotifTargetType.CHANNEL, targetId: channel.id, level: value as NotificationLevel })
        .catch(() => {});
    }
    closeAll();
  }

  return (
    <>
      <ChannelMenuSheet
        visible={!!channel && subSheet === 'none'}
        channelName={channel?.name ?? ''}
        // PM takibi (2026-08-07) — ses kanalının mesajı yok, "Okundu İşaretle" oraya ait değil
        // (tıklayınca bir şey olduğunu sanan kullanıcı — boş yüzey). Sheet bu bayrağa göre yalnız
        // O maddeyi gizler, başka bir eylem eklenmedi.
        isVoice={channel?.type === ChannelType.GUILD_VOICE}
        guildId={guildId}
        guildName={guildName}
        guildIconUrl={guildIconUrl}
        canManage={canManage}
        muted={muted}
        mutedUntil={mutedUntil}
        onClose={closeAll}
        onMarkRead={() => {
          if (channel) onMarkRead(channel);
          closeAll();
        }}
        onEdit={() => {
          if (channel) onEdit(channel);
          closeAll();
        }}
        onMutePress={onMutePress}
        onLevelPress={() => setSubSheet('level')}
      />

      {subSheet === 'mute' && channel && (
        <SelectSheet
          title={t('channelMenu.mute')}
          options={getMuteDurationOptions()}
          selected=""
          onSelect={onMuteDurationSelect}
          onClose={closeAll}
        />
      )}

      {subSheet === 'level' && channel && (
        <SelectSheet
          title={t('guildMenu.notifications')}
          options={getNotificationLevelOptions()}
          selected={level}
          onSelect={onLevelSelect}
          onClose={closeAll}
        />
      )}
    </>
  );
}
