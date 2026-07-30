import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { usersApi, type UserCardDto } from '@/api/users';
import { blocksApi } from '@/api/blocks';
import { friendsApi } from '@/api/friends';
import { useFriendsStore } from '@/stores/friends';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from './ConfirmDialog';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  userId: string;
  username: string;
  avatarUrl: string | null;
  onClose: () => void;
  /** Engelle/arkadaşlıktan-çıkar/engel-kaldır başarıyla bittiğinde çağırır — çağıran ekran (DM
   *  başlığı) `canMessage`/`selfBlocked` durumunu tazeler (sözleşme DoD #9: giriş kutusu anında kapanır). */
  onChanged?: () => void;
}

// Sprint M1a — DM başlığında karşı tarafın adına/avatarına dokununca açılan profil kartı; M1a'da
// SALT OKUNURDU (yalnız route'tan geçen ad/avatar gösteriliyordu, `GET /users/:id/card` hiç
// çağrılmıyordu). Sprint M1b contract §3.6 — kart artık gerçek kartı çeker (`friendStatus` +
// `selfBlocked` kararı belirler) ve iki aksiyon ekler: Engelle / Arkadaşlıktan Çıkar (ikisi de
// onaylı) + Engeli Kaldır (onaysız, web ile aynı). Kullanıcı adıyla arama/tıkla-ekle YOK — sözleşme
// §2 endpoint tablosunda `by-user` ucu yok, bu kart "arkadaş ekle" düğmesi TAŞIMAZ.
export function ProfileCardModal({ userId, username, avatarUrl, onClose, onChanged }: Props) {
  const [card, setCard] = useState<UserCardDto | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmAction, setConfirmAction] = useState<'block' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    usersApi
      .getCard(userId)
      .then((c) => {
        if (!cancelled) setCard(c);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(extractErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function doBlock() {
    setBusy(true);
    setActionError('');
    try {
      await blocksApi.block(userId);
      useFriendsStore.getState().removeLocal(userId);
      onChanged?.();
      setConfirmAction(null);
      onClose();
    } catch (e) {
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  async function doRemoveFriend() {
    setBusy(true);
    setActionError('');
    try {
      await friendsApi.remove(userId);
      useFriendsStore.getState().removeLocal(userId);
      onChanged?.();
      setConfirmAction(null);
      onClose();
    } catch (e) {
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  async function doUnblock() {
    setBusy(true);
    setActionError('');
    try {
      await blocksApi.unblock(userId);
      onChanged?.();
      setCard((c) => (c ? { ...c, selfBlocked: false } : c));
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const showActions = card && card.friendStatus !== 'self';

  return (
    <>
      <Modal transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.card} onPress={() => {}}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.username}>{username}</Text>

            {!card && !loadError && <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} />}
            {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

            {showActions && (
              <View style={styles.actions}>
                {card.selfBlocked ? (
                  <Pressable disabled={busy} onPress={doUnblock} style={styles.linkButton}>
                    <Text style={styles.linkButtonText}>{t('dm.unblock')}</Text>
                  </Pressable>
                ) : (
                  <>
                    {card.friendStatus === 'friends' && (
                      <Pressable disabled={busy} onPress={() => setConfirmAction('remove')} style={styles.dangerButton}>
                        <Text style={styles.dangerButtonText}>{t('friends.remove')}</Text>
                      </Pressable>
                    )}
                    <Pressable disabled={busy} onPress={() => setConfirmAction('block')} style={styles.dangerButton}>
                      <Text style={styles.dangerButtonText}>{t('friends.block')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}

            {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>{t('common.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {confirmAction && (
        <ConfirmDialog
          message={confirmAction === 'block' ? t('friends.confirmBlock') : t('friends.confirmRemove')}
          confirmLabel={confirmAction === 'block' ? t('friends.block') : t('friends.remove')}
          loading={busy}
          onConfirm={confirmAction === 'block' ? doBlock : doRemoveFriend}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.bgOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.layout.panelGap,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    padding: theme.layout.panelGap * 1.5,
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 12,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    marginBottom: theme.layout.panelGap,
  },
  spinner: {
    marginBottom: theme.layout.panelGap,
  },
  actions: {
    width: '100%',
    gap: 8,
    marginBottom: theme.layout.panelGap,
  },
  dangerButton: {
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  linkButtonText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    textAlign: 'center',
    marginBottom: 8,
  },
  closeButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: theme.layout.panelGap,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
