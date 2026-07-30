import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useNotificationsStore } from '@/stores/notifications';
import type { NotificationDto } from '@/api/notifications';
import { t } from '@/i18n';
import { theme } from '@/theme';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t('notification.now');
  const min = Math.floor(sec / 60);
  if (min < 60) return t('notification.minutesAgo', { n: min });
  const hour = Math.floor(min / 60);
  if (hour < 24) return t('notification.hoursAgo', { n: hour });
  const day = Math.floor(hour / 24);
  if (day < 7) return t('notification.daysAgo', { n: day });
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

function notificationText(n: NotificationDto): string {
  const actor = n.actor?.username ?? t('notification.someone');
  switch (n.type) {
    case 'MENTION':
      return t('notification.mention', { actor });
    case 'FRIEND_REQUEST':
      return t('notification.friendRequest', { actor });
    case 'FRIEND_ACCEPT':
      return t('notification.friendAccept', { actor });
    case 'GUILD_INVITE':
      return t('notification.guildInvite', { actor, guild: n.guildName ?? t('invite.unknownGuild') });
    default:
      return actor;
  }
}

// Sprint M1a contract §5 ekran 5 — liste + okunmamış vurgusu + dokunuşta ilgili kanala git.
// Yalnız MENTION tipinin mobilde bir hedefi var (kanal/DM mesaj ekranı); FRIEND_*/GUILD_INVITE
// hedefleri (kanka listesi, davet kabul ekranı) M1a kapsamında YOK — o satırlar bu yüzden
// tıklanabilir değil (mobile/CLAUDE.md "boş yüzey açma": hedefsiz dokunuş eklenmez).
export default function NotificationsScreen() {
  const router = useRouter();
  const items = useNotificationsStore((s) => s.items);
  const loading = useNotificationsStore((s) => s.loading);
  const loadingMore = useNotificationsStore((s) => s.loadingMore);
  const nextCursor = useNotificationsStore((s) => s.nextCursor);
  const fetchFirstPage = useNotificationsStore((s) => s.fetchFirstPage);
  const loadMore = useNotificationsStore((s) => s.loadMore);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  useEffect(() => {
    fetchFirstPage().then(() => markAllRead());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onItemPress(n: NotificationDto) {
    if (n.type !== 'MENTION' || !n.channelId) return;
    if (n.guildId) {
      router.push({ pathname: '/channel/[id]', params: { id: n.channelId, name: '' } });
    } else {
      router.push({
        pathname: '/dm/[id]',
        params: {
          id: n.channelId,
          title: n.actor?.username ?? t('notification.someone'),
          avatarUrl: n.actor?.avatarUrl ?? '',
          kind: 'dm',
          canMessage: 'true',
          selfBlocked: 'false',
        },
      });
    }
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <Text style={styles.title}>{t('notification.title')}</Text>

      {loading && items.length === 0 && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {!loading && items.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('notification.empty')}</Text>
        </View>
      )}

      {items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (nextCursor) loadMore();
          }}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.colors.textMuted} style={styles.loadMore} /> : null
          }
          renderItem={({ item }) => {
            const clickable = item.type === 'MENTION' && !!item.channelId;
            return (
              <Pressable
                disabled={!clickable}
                onPress={clickable ? () => onItemPress(item) : undefined}
                style={[styles.row, !item.readAt && styles.rowUnread]}
              >
                {item.actor?.avatarUrl ? (
                  <Image source={{ uri: item.actor.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarFallbackText}>
                      {(item.actor?.username ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.rowBody}>
                  <Text style={styles.text}>{notificationText(item)}</Text>
                  {item.preview && item.type !== 'GUILD_INVITE' ? (
                    <Text style={styles.preview} numberOfLines={1}>
                      {item.preview}
                    </Text>
                  ) : null}
                  <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
                </View>
                {!item.readAt && <View style={styles.unreadDot} />}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
    paddingBottom: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  loadMore: {
    marginVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
  },
  rowUnread: {
    backgroundColor: theme.colors.accentSubtle,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  preview: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  time: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent500,
    marginTop: 6,
  },
});
