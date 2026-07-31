import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { usersApi, type UserCardDto } from '@/api/users';
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
// onaylı) + Engeli Kaldır (onaysız, web ile aynı).
//
// M1d-0 R1 (sahip kararı 2026-07-31) — kart artık **Kanka Ekle** de taşır (tetikleyici: grup DM'de
// kanka olmadığın üyeye ulaşma yolu yoktu). Kapıyı açan şey düğme değil backend kuralı: USER_CLICK
// artık ortak grup DM'i de "ortak alan" sayıyor — gerekçe `friend-permission.service.ts` Kural 6a-2
// (R7). Kullanıcı adıyla ARAMA hâlâ YOK; ret JENERİK, sebep/statü sızmaz.
export function ProfileCardModal({ userId, username, avatarUrl, onClose, onChanged }: Props) {
  const [card, setCard] = useState<UserCardDto | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmAction, setConfirmAction] = useState<'block' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [requestSent, setRequestSent] = useState(false);

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

  // Sprint M1d-0 DoD turu (2026-07-31) — üç mutasyon da artık `useFriendsStore` üzerinden gidiyor.
  // Önceden kart `blocksApi`/`friendsApi`'yi DOĞRUDAN çağırıyordu; store'un engel/kanka mutasyonlarına
  // bağladığı yan etki (DM `canMessage`/`selfBlocked` bayraklarının tazelenmesi) bu yüzden bu yoldan
  // hiç çalışmıyordu. Yan etkinin tek sahibi store; kart yalnız çağırır.
  async function doBlock() {
    setBusy(true);
    setActionError('');
    try {
      await useFriendsStore.getState().block(userId);
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
      await useFriendsStore.getState().removeFriend(userId);
      onChanged?.();
      setConfirmAction(null);
      onClose();
    } catch (e) {
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  async function doSendRequest() {
    setBusy(true);
    setActionError('');
    try {
      await useFriendsStore.getState().sendRequestByUser(userId);
      setRequestSent(true);
    } catch {
      // Jenerik (DM başlığındaki tıkla-ekle ile aynı): sunucunun ret sebebi GÖSTERİLMEZ. USER_NOT_FOUND
      // "yok / blok / minör / ortak alan yok" ayrımını zaten silmiş durumda; istemci de tahmin etmez.
      setActionError(t('friends.addFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function doUnblock() {
    setBusy(true);
    setActionError('');
    try {
      await useFriendsStore.getState().unblock(userId);
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
                    {/* Kanka Ekle yalnız `none` durumunda. `pending_in` (karşı taraf zaten istek
                        atmış) için düğme koymadım: kabul akışı istekler ekranında, burada ikinci bir
                        kabul yüzeyi uydurmak olurdu. Gönderim sonrası düğme yerini bilgi metnine
                        bırakır — sunucu durumu değişti, sessizce kaybolması kullanıcıyı şüphede bırakır. */}
                    {requestSent || card.friendStatus === 'pending_out' ? (
                      <Text style={styles.pendingText}>{t('friends.requestSent')}</Text>
                    ) : (
                      card.friendStatus === 'none' && (
                        <Pressable disabled={busy} onPress={doSendRequest} style={styles.primaryButton}>
                          <Text style={styles.primaryButtonText}>{t('friends.add')}</Text>
                        </Pressable>
                      )
                    )}
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
  // Kanka Ekle olumlu/birincil aksiyon → dolu Kor düğme; engelle/çıkar yıkıcı → kenarlıklı kırmızı.
  // Aynı görünümü paylaşmaları, yanlışlıkla yıkıcı olana basma riskini artırırdı.
  primaryButton: {
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  pendingText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingVertical: 6,
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
