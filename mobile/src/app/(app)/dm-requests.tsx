import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { dmApi } from '@/api/dm';
import { useDmStore } from '@/stores/dm';
import { showToast } from '@/stores/toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RequestAvatar } from '@/components/dm/RequestAvatar';
import { extractErrorMessage } from '@/api/errors';
import { useRequestPreviews } from '@/components/home/useRequestPreviews';
import { formatAgo } from '@/utils/formatAgo';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'error' | 'ready';

// Sprint M1a §5 ekran 4 — DM istekleri. C75 Rev.7: kart yığını yerine e-posta kutusu gibi sıkı liste;
// içerik ve Kabul / Reddet / Engelle düğmeleri detay ekranında (`dm-request/[channelId]`). Neden:
// kartlar ekranı 2-3 istekte dolduruyordu ve "görüldü" artık isteğin detayı açılınca düşüyor
// (sayfa açılınca değil), liste görmek bir isteği okumuş saymak değil.
export default function DmRequestsScreen() {
  const router = useRouter();
  // C75: bildirim/push `?channel=<id>` ile gelir; o isteğin detayı bir kez açılır.
  const { channel: focusChannelId } = useLocalSearchParams<{ channel?: string }>();
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  // C75 Rev.7: liste doğrudan store'dan okunur. Eskiden ekran ilk çekimi yerel bir kopyada tutup
  // store ile yalnız SÜZÜYORDU: silinen istek kalkıyor, yeni gelen ise hiç eklenmiyordu (sahip bulgusu).
  // Store `dm.request` soket olayıyla tazelendiği için yeni istek artık anında düşer.
  const items = useDmStore((s) => s.requests);
  /** "Tümünü reddet" onayı açıkken dondurulan kimlikler (null = kapalı). */
  const [rejectAllIds, setRejectAllIds] = useState<string[] | null>(null);
  const [rejectingAll, setRejectingAll] = useState(false);
  const focusOpened = useRef(false);

  // react-hooks/set-state-in-effect: bkz. home.tsx fetchGuilds yorumu.
  const fetchRequests = useCallback(() => {
    dmApi
      .listRequests()
      .then((list) => {
        useDmStore.setState({
          requests: list,
          requestCount: list.length,
          unseenRequestCount: list.filter((r) => r.unseen === true).length,
        });
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

  const openDetail = useCallback(
    (channelId: string) => router.push({ pathname: '/dm-request/[channelId]', params: { channelId } }),
    [router],
  );

  // Bildirimden gelindiyse kullanıcı o isteğe zaten dokunmuştur: detayı bir kez aç (geri → bu liste).
  useEffect(() => {
    if (state !== 'ready' || !focusChannelId || focusOpened.current) return;
    focusOpened.current = true;
    if (items.some((r) => r.channelId === focusChannelId)) openDetail(focusChannelId);
  }, [state, focusChannelId, items, openDetail]);

  const previewOf = useRequestPreviews(items);

  function retry() {
    setState('loading');
    fetchRequests();
  }

  /** Onay anındaki kimlikler gönderilir; arada gelen (görülmemiş) istek bu ret'e girmez. */
  async function rejectAll() {
    if (!rejectAllIds) return;
    setRejectingAll(true);
    try {
      const n = await useDmStore.getState().rejectRequestsBatch(rejectAllIds);
      showToast(t('messageRequests.rejectedAll', { n }));
    } catch (e) {
      showToast(extractErrorMessage(e));
    } finally {
      setRejectingAll(false);
      setRejectAllIds(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: t('messageRequests.title'),
          headerRight:
            state === 'ready' && items.length >= 2
              ? () => (
                  <Pressable
                    onPress={() => setRejectAllIds(items.map((r) => r.channelId))}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.headerAction}>{t('messageRequests.rejectAll')}</Text>
                  </Pressable>
                )
              : undefined,
        }}
      />

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
            const unseen = item.unseen === true;
            return (
              <Pressable
                onPress={() => openDetail(item.channelId)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <RequestAvatar requester={item.requester} size={40} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    {/* Görülmemiş: kalın ad + parlak önizleme + Kor nokta (web ile aynı işaret dili). */}
                    <Text style={[styles.username, unseen && styles.usernameUnseen]} numberOfLines={1}>
                      {item.requester?.username ?? t('notification.someone')}
                    </Text>
                    <Text style={styles.time}>{formatAgo(item.createdAt)}</Text>
                  </View>
                  <Text style={[styles.preview, unseen && styles.previewUnseen]} numberOfLines={1}>
                    {previewOf(item)}
                  </Text>
                </View>
                {unseen && <View style={styles.dot} accessibilityLabel={t('messageRequests.unseenLabel')} />}
              </Pressable>
            );
          }}
        />
      )}

      {rejectAllIds && (
        <ConfirmDialog
          title={t('messageRequests.rejectAllConfirmTitle')}
          message={t('messageRequests.rejectAllConfirmMessage', { n: rejectAllIds.length })}
          confirmLabel={t('messageRequests.rejectAll')}
          loading={rejectingAll}
          onConfirm={() => void rejectAll()}
          onCancel={() => setRejectAllIds(null)}
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
  headerAction: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  list: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 10,
    minHeight: 64,
  },
  rowPressed: {
    backgroundColor: theme.colors.bgElevated,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  username: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  usernameUnseen: {
    fontWeight: '700',
  },
  time: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  preview: {
    marginTop: 2,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  previewUnseen: {
    color: theme.colors.textSecondary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent500,
  },
});
