import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import type { DmChannelDto } from '@/api/dm';
import { groupRoleOf } from '@/utils/groupRoles';
import { useAuthStore } from '@/stores/auth';
import { useDmStore } from '@/stores/dm';
import { useFriendsStore } from '@/stores/friends';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from '../ConfirmDialog';
import { channelTitle } from '@/utils/channelTitle';
import { DmMoreSheet } from './DmMoreSheet';
import { AddMemberSheet, RenameGroupSheet } from './GroupEditSheets';
import { t } from '@/i18n';

interface Props {
  channel: DmChannelDto;
  visible: boolean;
  onClose: () => void;
}

/** Ana panel mi, yoksa üstüne değil YERİNE açılan alt akış mı görünüyor (`DmMenuHost` deseni). */
type SubSheet = 'none' | 'addMember' | 'rename';

/**
 * Sprint M3b §2.4 — DM detay ekranındaki ⋯ menüsünün **yerleşimi**: panel + onaylar + üye ekleme
 * seçicisi + yeniden adlandırma. `DmMenuHost` ile aynı desen ve aynı gerekçe: ekranın kendisi yalnız
 * "menü açık mı" bilgisini tutar, akışın içi buraya toplanır (aksi hâlde detay ekranı 300 satırı
 * aşardı).
 *
 * Buradaki dört grup aksiyonu `group/[id].tsx`in dibinden **taşındı** (o ekran kaldırıldı); yetki
 * kuralı ve onaylar aynen korundu — tek dokunuşla gruptan çıkma / grup silme YOK.
 *
 * 🔴 Alt akışlar panelin ÜSTÜNE değil YERİNE açılır (`subSheet`): iki `Modal` aynı anda görünür
 * olsaydı arka arkaya iki karartılmış perde binerdi (M2b §4.1'de kayda geçen ders).
 */
export function DmMoreHost({ channel, visible, onClose }: Props) {
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const friends = useFriendsStore((s) => s.friends);
  const fetchFriends = useFriendsStore((s) => s.fetchAll);

  const [subSheet, setSubSheet] = useState<SubSheet>('none');
  const [confirm, setConfirm] = useState<'clear' | 'leave' | 'delete' | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyFriendId, setBusyFriendId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Üye Ekle seçicisi kanka listesine dayanıyor; ekran (app)/_layout mount'unda bir kez çekiyor
  // ama detay ekranına derin linkle de gelinebiliyor — tazeleme ucuz, liste bayat kalmasın.
  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const isGroup = channel.type === 'GROUP_DM';
  const isOwner = isGroup && authUser?.id === channel.ownerId;
  const addableFriends = isGroup
    ? friends.filter((f) => !channel.members.find((m) => m.id === f.user.id))
    : [];

  /** Tüm katmanları kapatır (ebeveynin "menü açık" bayrağını da sıfırlar). */
  function closeAll() {
    setSubSheet('none');
    setActionError('');
    onClose();
  }

  async function onConfirmClear() {
    setBusy(true);
    setActionError('');
    try {
      await useDmStore.getState().clearChannel(channel.id);
      setConfirm(null);
    } catch (e) {
      // Onay kutusu kapanır ve hata ana panelde görünür: `ConfirmDialog`ın hata yüzeyi yok, açık
      // bırakılsaydı kullanıcı neden olmadığını hiç göremezdi.
      setConfirm(null);
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmLeave() {
    setBusy(true);
    setActionError('');
    try {
      await useDmStore.getState().leaveGroup(channel.id);
      setConfirm(null);
      // Gruptan çıkınca bu ekranın dayandığı kanal artık yok → ana ekrana dön (eski davranış).
      // D34 (PLAN.md) — eski `replace('/home')` yalnız ÜSTTEKİ ekranı (dm-details) değiştiriyordu;
      // altta duran `dm/[id]` (artık var olmayan gruba ait) yığında kalıyordu, geri tuşu ölü sohbete
      // düşürüyordu. `dismissAll` önce yığını en alta (tabs kökü) indiriyor, `replace` sonra Ana
      // Sayfa sekmesinde olduğumuzu garanti ediyor. Kayıt notu gereği bu yalnız bu dalı düzeltir —
      // genel gezinme davranışına dokunulmadı.
      router.dismissAll();
      router.replace('/home');
    } catch (e) {
      setConfirm(null);
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  async function onConfirmDelete() {
    setBusy(true);
    setActionError('');
    try {
      await useDmStore.getState().deleteGroup(channel.id);
      setConfirm(null);
      // D34 — bkz. `onConfirmLeave` üstündeki not; grup silindiğinde de aynı ölü-sohbet kusuru.
      router.dismissAll();
      router.replace('/home');
    } catch (e) {
      setConfirm(null);
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  async function onAddMember(userId: string) {
    setBusyFriendId(userId);
    setActionError('');
    try {
      await useDmStore.getState().addGroupMember(channel.id, userId);
      closeAll();
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusyFriendId(null);
    }
  }

  async function onRename() {
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    setActionError('');
    try {
      await useDmStore.getState().renameGroup(channel.id, name);
      closeAll();
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DmMoreSheet
        visible={visible && subSheet === 'none' && !confirm}
        title={channelTitle(channel)}
        isGroup={isGroup}
        isOwner={isOwner}
        canRename={isGroup && groupRoleOf(channel, authUser?.id) !== 'member'}
        errorMessage={actionError}
        onClose={closeAll}
        onClear={() => setConfirm('clear')}
        onAddMember={() => setSubSheet('addMember')}
        onRename={() => {
          setRenameValue(channel.type === 'GROUP_DM' ? (channel.name ?? '') : '');
          setSubSheet('rename');
        }}
        onLeave={() => setConfirm('leave')}
        onDelete={() => setConfirm('delete')}
      />

      {confirm === 'clear' && (
        <ConfirmDialog
          message={t('dm.clearConfirmMsg')}
          confirmLabel={t('dm.clearButton')}
          loading={busy}
          onConfirm={onConfirmClear}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'leave' && (
        <ConfirmDialog
          message={t('group.leaveConfirm')}
          confirmLabel={t('group.leaveAction')}
          loading={busy}
          onConfirm={onConfirmLeave}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          message={t('group.deleteConfirm')}
          confirmLabel={t('group.deleteAction')}
          loading={busy}
          onConfirm={onConfirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}

      {subSheet === 'addMember' && (
        <AddMemberSheet
          friends={addableFriends}
          busyFriendId={busyFriendId}
          errorMessage={actionError}
          onSelect={onAddMember}
          onClose={closeAll}
        />
      )}

      {subSheet === 'rename' && (
        <RenameGroupSheet
          value={renameValue}
          onChangeValue={setRenameValue}
          busy={busy}
          errorMessage={actionError}
          onSubmit={onRename}
          onClose={closeAll}
        />
      )}
    </>
  );
}
