import { useState } from 'react';
import { dmApi, type DmChannelDto } from '@/api/dm';
import { useDmStore } from '@/stores/dm';
import { useFriendsStore } from '@/stores/friends';
import { useReportStore } from '@/stores/report';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { NotifTargetType, type NotificationLevel } from '@/api/notifications';
import { channelTitle } from '@/utils/channelTitle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SelectSheet } from '@/components/guild/SelectSheet';
import { getMuteDurationOptions, getNotificationLevelOptions, muteMinutesFromValue } from '@/utils/notifPrefUi';
import { DmMenuSheet } from './DmMenuSheet';
import { DeleteDepartedDialog } from '@/components/dm/DeleteDepartedDialog';
import { t } from '@/i18n';

/**
 * DM panelinin yerleşimi: paneli, onayı ve aksiyonlarını bir arada tutar.
 *
 * Ana ekrandan ayrıldı (M1d-C): `home.tsx` yalnız "hangi DM'e uzun basıldı" bilgisini tutuyor,
 * panelin iç akışı (temizleme onayı, okundu işaretleme) buraya taşındı — aksi hâlde ana ekran
 * 300 satır eşiğini aşıyordu ve bir sohbet panelinin iç durumu ana ekranın işi değil.
 */
interface Props {
  /** Uzun basılan DM; null ise panel kapalı. */
  channel: DmChannelDto | null;
  onClose: () => void;
  /** İlk satır — M3b §2.1 ile **DM detay ekranı** (sohbet başlığına dokunmakla aynı hedef). */
  onOpenDetails: (channel: DmChannelDto) => void;
  onAddFriend: () => void;
}

/** Ana panel mi, yoksa üstüne açılan süre/seviye seçici mi görünüyor. */
type SubSheet = 'none' | 'mute' | 'level';

export function DmMenuHost({ channel, onClose, onOpenDetails, onAddFriend }: Props) {
  const [clearTarget, setClearTarget] = useState<DmChannelDto | null>(null);
  const [clearing, setClearing] = useState(false);
  // C62 — eski grupta uzun basma menüsü yalnız "Sohbeti sil"; onay kendi diyaloğunda.
  const [deleteDepartedId, setDeleteDepartedId] = useState<string | null>(null);
  // Sprint M2b §4.1 — süre/seviye seçici, `DmMenuSheet`in ÜSTÜNE değil YERİNE açılır (tek modal
  // katmanı — iki `Modal` aynı anda görünür olsaydı arka arkaya iki karartılmış perde binerdi).
  // `channel` (ebeveynin `menuDm`'i) BURADA sıfırlanmaz; yalnız hangi katmanın göründüğü değişir —
  // aksi halde seçici açılırken hedef kanal referansı da kaybolurdu.
  const [subSheet, setSubSheet] = useState<SubSheet>('none');

  const dmChannelId = channel?.id ?? '';
  const muted = useNotificationPrefsStore((s) => s.isMuted(NotifTargetType.CHANNEL, dmChannelId));
  const mutedUntil = useNotificationPrefsStore((s) =>
    s.mutedUntilFor(NotifTargetType.CHANNEL, dmChannelId),
  );
  // DM'in bağlı olduğu bir ortam yok → fallback GUILD'i yok, yalnız kendi kaydı veya varsayılan.
  const level = useNotificationPrefsStore((s) => s.effectiveLevel(NotifTargetType.CHANNEL, dmChannelId));

  // 🔴 Sprint M3b §4 — kusur düzeltmesi (sahip ekran görüntüsü 2026-08-04). Kapı yalnız
  // `channel?.type === 'DM'` idi: "1-1 DM mi" sorusuna bakıp "zaten kanka mıyız" sorusunu hiç
  // sormuyordu, bu yüzden kankanın DM panelinde de "Kanka Ekle" duruyordu. Web'deki kapı
  // (`DmConversation.showAddFriend`) üç şart taşıyor: kanka değil + ben engellememişim + istek
  // gönderilmemiş. Aynı üçü burada da uygulanıyor — veri zaten elde, yeni istek atılmıyor.
  //
  // Web'in yerel `addFriendSent` bayrağının mobil karşılığı store'daki GİDEN istek kaydı:
  // mobilde "Kanka Ekle" satırı inline gönderim yapmıyor, `/friends-add` ekranına götürüyor →
  // panele dönüldüğünde yerel bir bayrak zaten yaşamıyor olurdu. `requests` listesi sunucudan
  // geliyor ve `direction` taşıyor, yani daha dayanıklı bir kaynak.
  //
  // 🔴 T&S: "o beni engelledi" durumu buraya HİÇ girmiyor (`selfBlocked` yalnız "ben engelledim").
  // Gizleme sebebi kullanıcıya açıklanmaz; ret zaten sunucuda jenerik.
  const otherUserId = channel?.type === 'DM' ? channel.otherUser.id : null;
  const isFriend = useFriendsStore((s) => !!otherUserId && s.friends.some((f) => f.user.id === otherUserId));
  const requestSent = useFriendsStore(
    (s) => !!otherUserId && s.requests.some((r) => r.direction === 'outgoing' && r.user.id === otherUserId),
  );
  const canAddFriend =
    channel?.type === 'DM' && !channel.selfBlocked && !isFriend && !requestSent;

  async function onConfirmClear() {
    if (!clearTarget) return;
    setClearing(true);
    try {
      await useDmStore.getState().clearChannel(clearTarget.id);
      setClearTarget(null);
    } finally {
      setClearing(false);
    }
  }

  /** Tüm panel/seçici katmanlarını kapatır (ebeveynin `menuDm`'ini de sıfırlar). */
  function closeAll() {
    setSubSheet('none');
    onClose();
  }

  // Sustur/seviye — menü geçici bir sheet olduğu için hata SESSİZ yutulur (store zaten iyimser
  // yazıp hatada geri alıyor; kullanıcı görür ki değişiklik tutmadı). Kalıcı ekranda (guild-notifications)
  // hata görünür gösteriliyor, burada değil — sözleşme §4.4 yalnız o ekran için Türkçe mesaj istiyor.
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
        .setPref({ targetType: NotifTargetType.CHANNEL, targetId: channel.id, muted: true, mutedUntil: nextMutedUntil })
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
      <DmMenuSheet
        visible={!!channel && subSheet === 'none'}
        departedOnly={channel?.type === 'GROUP_DM' && !!channel.departed}
        title={channel ? channelTitle(channel) : ''}
        hasUnread={!!channel?.unread}
        // Kanka Ekle yalnız 1-1 DM'de VE henüz kanka olunmamışsa (§4 — yukarıdaki kapı).
        canAddFriend={canAddFriend}
        muted={muted}
        mutedUntil={mutedUntil}
        onClose={closeAll}
        onDetails={() => {
          const c = channel;
          closeAll();
          if (c) onOpenDetails(c);
        }}
        onAddFriend={() => {
          closeAll();
          onAddFriend();
        }}
        onMarkRead={() => {
          const c = channel;
          closeAll();
          if (!c) return;
          // Hata sessiz: okundu işaretleme kritik değil, kullanıcıyı hata ekranıyla durdurmaya değmez.
          void dmApi.markRead(c.id).catch(() => {});
          // Rozet sunucu yanıtını beklemeden düşsün (DM ekranıyla aynı desen).
          useDmStore.getState().clearUnread(c.id);
        }}
        onClear={() => {
          if (channel?.type === 'GROUP_DM' && channel.departed) setDeleteDepartedId(channel.id);
          else setClearTarget(channel);
          closeAll();
        }}
        canReport={!!otherUserId}
        onReport={() => {
          const id = otherUserId;
          closeAll();
          if (id) useReportStore.getState().openReport({ targetType: 'USER', targetId: id });
        }}
        onMutePress={onMutePress}
        onLevelPress={() => setSubSheet('level')}
      />

      {deleteDepartedId && (
        <DeleteDepartedDialog
          groupId={deleteDepartedId}
          onCancel={() => setDeleteDepartedId(null)}
          onDeleted={() => setDeleteDepartedId(null)}
        />
      )}

      {clearTarget && (
        <ConfirmDialog
          message={t('dm.clearConfirmMsg')}
          confirmLabel={t('dm.clearButton')}
          loading={clearing}
          onConfirm={onConfirmClear}
          onCancel={() => setClearTarget(null)}
        />
      )}

      {subSheet === 'mute' && channel && (
        <SelectSheet
          title={t('mobile.dm.muteLabel')}
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
