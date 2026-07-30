import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useFriendsStore } from '@/stores/friends';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { type BlockedUserDto } from '@/api/blocks';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1d-0 contract §3.3 — "Engellenenler" tam ekranı. Bu sprintin varlık sebebi: mobilde
// birini engelleyip hiç DM'leşmemişsen, engelleme arkadaşlığı da sildiği için o kişi hiçbir
// yüzeyde görünmüyordu → engeli kaldırmanın yolu yoktu (geri alınamaz işlem). Bu ekran o tek
// yönlü kapıyı kapatır.
//
// 🔴 Yalnız BENİM engellediklerim listelenir — `GET /blocks` zaten `blockerId` filtreli
// (`blocks.service.ts` `getBlocks`); "beni kim engelledi" sunucudan hiç dönmez, istemci tahmin
// etmeye çalışmaz (G3 blok belirsizliği kuralı).
export default function BlockedListScreen() {
  const blocked = useFriendsStore((s) => s.blocked);
  const state = useFriendsStore((s) => s.blockedState);
  const errorMessage = useFriendsStore((s) => s.blockedErrorMessage);
  const fetchBlocked = useFriendsStore((s) => s.fetchBlocked);
  const unblock = useFriendsStore((s) => s.unblock);

  const [unblockTarget, setUnblockTarget] = useState<BlockedUserDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    fetchBlocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    useFriendsStore.setState({ blockedState: 'loading' });
    fetchBlocked();
  }

  async function onConfirmUnblock() {
    if (!unblockTarget) return;
    setBusyId(unblockTarget.user.id);
    setActionError('');
    try {
      await unblock(unblockTarget.user.id);
      setUnblockTarget(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.flex}>
      {/* `friends.tabBlocked` web'de sekme etiketiydi ("Engellenmiş") — burada ekran başlığı
          olarak reuse edildi; sözleşme §5 yeni anahtar beklemiyor. */}
      <Stack.Screen options={{ title: t('friends.tabBlocked') }} />

      {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && blocked.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('friends.noBlocked')}</Text>
        </View>
      )}

      {state === 'ready' && blocked.length > 0 && (
        <FlatList
          data={blocked}
          keyExtractor={(item) => item.user.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const busy = busyId === item.user.id;
            return (
              <View style={styles.row}>
                {item.user.avatarUrl ? (
                  <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarFallbackText}>{item.user.username.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.name} numberOfLines={1}>
                  {item.user.username}
                </Text>
                <Pressable disabled={busy} onPress={() => setUnblockTarget(item)} style={styles.unblockButton}>
                  <Text style={styles.unblockText}>{t('friends.unblock')}</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      {unblockTarget && (
        <ConfirmDialog
          message={t('mobile.friends.confirmUnblock')}
          confirmLabel={t('friends.unblock')}
          loading={busyId === unblockTarget.user.id}
          onConfirm={onConfirmUnblock}
          onCancel={() => setUnblockTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: 10,
  },
  actionError: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
  },
  retryButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  list: {
    padding: theme.layout.panelGap,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  unblockButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
});
