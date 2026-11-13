import { useState } from 'react';
import { Alert } from 'react-native';
import { extractErrorMessage } from '@/api/errors';
import { useDmStore } from '@/stores/dm';
import { ConfirmDialog } from '../ConfirmDialog';
import { t } from '@/i18n';

/**
 * C62 — eski grup sohbetini (gruptan ayrılan/çıkarılan) yalnız kendi listemden silme onayı.
 * DM satırı menüsü ve sohbet ekranı bandı aynı akışı kullanır; hata Türkçe uyarı olarak görünür.
 */
interface Props {
  groupId: string;
  onDeleted: () => void;
  onCancel: () => void;
}

export function DeleteDepartedDialog({ groupId, onDeleted, onCancel }: Props) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await useDmStore.getState().deleteDeparted(groupId);
      onDeleted();
    } catch (e) {
      setBusy(false);
      onCancel();
      Alert.alert(extractErrorMessage(e) || t('mobile.dm.departedDeleteError'));
    }
  }

  return (
    <ConfirmDialog
      message={t('mobile.dm.departedDeleteConfirm')}
      confirmLabel={t('mobile.dm.departedDelete')}
      loading={busy}
      onConfirm={confirm}
      onCancel={onCancel}
    />
  );
}
