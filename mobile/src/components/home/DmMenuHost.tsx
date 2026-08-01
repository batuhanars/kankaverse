import { useState } from 'react';
import { dmApi, type DmChannelDto } from '@/api/dm';
import { useDmStore } from '@/stores/dm';
import { channelTitle } from '@/utils/channelTitle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DmMenuSheet } from './DmMenuSheet';
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
  /** Profil satırı — sohbet ekranındaki kartın aynısı (aynı hedefe iki giriş, yeni yüzey değil). */
  onOpenDm: (channel: DmChannelDto) => void;
  onAddFriend: () => void;
}

export function DmMenuHost({ channel, onClose, onOpenDm, onAddFriend }: Props) {
  const [clearTarget, setClearTarget] = useState<DmChannelDto | null>(null);
  const [clearing, setClearing] = useState(false);

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

  return (
    <>
      <DmMenuSheet
        visible={!!channel}
        title={channel ? channelTitle(channel) : ''}
        hasUnread={!!channel?.unread}
        // Kanka Ekle yalnız 1-1 DM'de: grup DM'de tek bir "karşı taraf" yok → hiç render edilmez.
        canAddFriend={channel?.type === 'DM'}
        onClose={onClose}
        onProfile={() => {
          const c = channel;
          onClose();
          if (c) onOpenDm(c);
        }}
        onAddFriend={() => {
          onClose();
          onAddFriend();
        }}
        onMarkRead={() => {
          const c = channel;
          onClose();
          if (!c) return;
          // Hata sessiz: okundu işaretleme kritik değil, kullanıcıyı hata ekranıyla durdurmaya değmez.
          void dmApi.markRead(c.id).catch(() => {});
          // Rozet sunucu yanıtını beklemeden düşsün (DM ekranıyla aynı desen).
          useDmStore.getState().clearUnread(c.id);
        }}
        onClear={() => {
          setClearTarget(channel);
          onClose();
        }}
      />

      {clearTarget && (
        <ConfirmDialog
          message={t('dm.clearConfirmMsg')}
          confirmLabel={t('dm.clearButton')}
          loading={clearing}
          onConfirm={onConfirmClear}
          onCancel={() => setClearTarget(null)}
        />
      )}
    </>
  );
}
