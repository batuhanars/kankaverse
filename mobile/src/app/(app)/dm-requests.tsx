import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { dmApi, type MessageRequestDto } from '@/api/dm';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'error' | 'ready';

// Sprint M1a contract §5 ekran 4 + §0 — DM istekleri: liste + kabul/ret. Backend uçları hazır
// (contract girişi: mobilde görünmezse kullanıcı isteği hiç göremez — "dilsizlik" T&S açısından
// kabul edilemez). "Reddet ve engelle" (block) web'de var ama DoD burada yalnız "kabul/ret" ister —
// kapsam minimalinde tutuldu (bonus, çekirdek değil).
export default function DmRequestsScreen() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<MessageRequestDto[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  // react-hooks/set-state-in-effect — bkz. home.tsx fetchGuilds yorumu.
  const fetchRequests = useCallback(() => {
    dmApi
      .listRequests()
      .then((list) => {
        setItems(list);
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  function retry() {
    setState('loading');
    fetchRequests();
  }

  async function accept(item: MessageRequestDto) {
    setActingId(item.channelId);
    try {
      await dmApi.acceptRequest(item.channelId);
      setItems((prev) => prev.filter((r) => r.channelId !== item.channelId));
      router.push({
        pathname: '/dm/[id]',
        params: {
          id: item.channelId,
          title: item.requester?.username ?? t('notification.someone'),
          avatarUrl: item.requester?.avatarUrl ?? '',
          otherUserId: item.requester?.id ?? '',
          kind: 'dm',
          canMessage: 'true',
          selfBlocked: 'false',
        },
      });
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setActingId(null);
    }
  }

  async function reject(channelId: string) {
    setActingId(channelId);
    try {
      await dmApi.rejectRequest(channelId, false);
      setItems((prev) => prev.filter((r) => r.channelId !== channelId));
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setActingId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('messageRequests.title') }} />

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

      {state === 'ready' && items.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{t('messageRequests.emptyTitle')}</Text>
          <Text style={styles.emptyHint}>{t('messageRequests.emptyHint')}</Text>
        </View>
      )}

      {state === 'ready' && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.channelId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const busy = actingId === item.channelId;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  {item.requester?.avatarUrl ? (
                    <Image source={{ uri: item.requester.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarFallbackText}>
                        {(item.requester?.username ?? '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.username}>{item.requester?.username ?? t('notification.someone')}</Text>
                </View>
                {item.preview ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    {item.preview}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <Pressable disabled={busy} onPress={() => accept(item)} style={[styles.acceptButton, busy && styles.disabled]}>
                    <Text style={styles.acceptText}>{t('messageRequests.accept')}</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => reject(item.channelId)} style={[styles.rejectButton, busy && styles.disabled]}>
                    <Text style={styles.rejectText}>{t('messageRequests.reject')}</Text>
                  </Pressable>
                </View>
                <Text style={styles.privacyNote}>{t('messageRequests.privacyNote')}</Text>
              </View>
            );
          }}
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
    fontSize: theme.fontSize.base,
    textAlign: 'center',
    marginBottom: theme.layout.panelGap,
  },
  retryButton: {
    minHeight: theme.layout.control,
    paddingHorizontal: theme.layout.panelGap,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  list: {
    padding: theme.layout.panelGap,
  },
  card: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    padding: theme.layout.panelGap,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  preview: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  acceptButton: {
    flex: 1,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  privacyNote: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    textAlign: 'center',
  },
});
