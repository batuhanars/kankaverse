import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFriendsStore } from '@/stores/friends';
import { useDmStore } from '@/stores/dm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { type FriendDto } from '@/api/friends';
import { extractErrorMessage } from '@/api/errors';
import { dmRouteParams } from '@/utils/dmRoute';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1d-0 contract §3.2 — "Kankalar" tam ekranı. "Sen" sekmesindeki hesap merkezi satırından
// açılır (üst seviye ayrı bir varış noktası DEĞİL — sözleşme §1). Liste zaten `(app)/_layout.tsx`
// mount'unda bir kez çekiliyor (sidebar rozeti için); burada tekrar `fetchAll()` çağrısı listeyi
// tazeler (ekrana her girişte bayat kalmasın).
export default function FriendsListScreen() {
  const router = useRouter();
  const friends = useFriendsStore((s) => s.friends);
  const state = useFriendsStore((s) => s.state);
  const errorMessage = useFriendsStore((s) => s.errorMessage);
  const fetchAll = useFriendsStore((s) => s.fetchAll);
  const removeFriend = useFriendsStore((s) => s.removeFriend);
  const createChannel = useDmStore((s) => s.createChannel);

  const [removeTarget, setRemoveTarget] = useState<FriendDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    useFriendsStore.setState({ state: 'loading' });
    fetchAll();
  }

  async function onMessage(friend: FriendDto) {
    setBusyId(friend.user.id);
    setActionError('');
    try {
      const channel = await createChannel(friend.user.id);
      router.push(dmRouteParams(channel));
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onConfirmRemove() {
    if (!removeTarget) return;
    setBusyId(removeTarget.user.id);
    setActionError('');
    try {
      await removeFriend(removeTarget.user.id);
      setRemoveTarget(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('friends.title') }} />

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

      {state === 'ready' && friends.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('friends.noFriends')}</Text>
        </View>
      )}

      {state === 'ready' && friends.length > 0 && (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.friendshipId}
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
                <View style={styles.actions}>
                  <Pressable disabled={busy} onPress={() => onMessage(item)} style={styles.dmButton}>
                    <Text style={styles.dmText}>{t('friends.dm')}</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => setRemoveTarget(item)} style={styles.removeButton}>
                    <Text style={styles.removeText}>{t('friends.remove')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      {removeTarget && (
        <ConfirmDialog
          message={t('friends.confirmRemove')}
          confirmLabel={t('friends.remove')}
          loading={busyId === removeTarget.user.id}
          onConfirm={onConfirmRemove}
          onCancel={() => setRemoveTarget(null)}
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
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  dmButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  removeButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
});
