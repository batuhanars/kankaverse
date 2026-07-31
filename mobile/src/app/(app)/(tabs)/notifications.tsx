import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
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
// M1a'da yalnız MENTION'ın hedefi vardı; M1b Arkadaş Ekle ekranını getirdiği için **FRIEND_REQUEST de
// tıklanabilir oldu**. Sprint M1d-0 contract §3.2 — Kankalar ekranı geldiği için **FRIEND_ACCEPT de
// tıklanabilir oldu** (M1b'de hedefi yoktu, bilinçle bırakılmıştı). GUILD_INVITE hâlâ hedefsiz (davet
// kabul ekranı yok, hedefi M1d'de gelir) → tıklanabilir DEĞİL; "boş yüzey açma" gereği hedef uydurulmaz.
export default function NotificationsScreen() {
  const router = useRouter();
  const items = useNotificationsStore((s) => s.items);
  const loading = useNotificationsStore((s) => s.loading);
  const loadingMore = useNotificationsStore((s) => s.loadingMore);
  const nextCursor = useNotificationsStore((s) => s.nextCursor);
  const fetchFirstPage = useNotificationsStore((s) => s.fetchFirstPage);
  const loadMore = useNotificationsStore((s) => s.loadMore);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const markRead = useNotificationsStore((s) => s.markRead);

  // Sprint M1d-0 DoD turu (sahip bulgusu 2026-07-31) — okundu işaretleme MOUNT'ta değil, her
  // ODAKLANMADA çalışır. Kusurun kökü: sekme ekranları Expo Router'da oturum boyunca mount'lu kalır,
  // yani `useEffect(..., [])` bir kez çalışıp bir daha çalışmıyordu → o andan sonra gelen HİÇBİR
  // bildirim okundu olmuyordu (uygulama yeniden açılana kadar rozet kırmızı kalıyordu). Web'de aynı
  // iş panel her açılışında oluyor (NotificationBell.vue); mobilde panelin karşılığı sekmenin
  // odaklanmasıdır. Liste sırayla tazelenir (`fetchFirstPage` → `markAllRead`): ters sırada
  // markAllRead'in yerel damgası, sonradan gelen listeye yetişemez ve satırlar okunmamış görünürdü.
  useFocusEffect(
    useCallback(() => {
      fetchFirstPage().then(() => markAllRead());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  function onItemPress(n: NotificationDto) {
    // Dokunulan bildirim okundu işaretlenir (web NotificationBell.vue ile aynı semantik). Odaklanma
    // kancası çoğu durumu zaten kapatır; bu satır sekme ZATEN odaktayken gelen bildirimi karşılar —
    // o durumda odaklanma olayı bir daha tetiklenmez, dokunuş tek sinyaldir.
    void markRead(n.id);
    // Kanka isteği bildirimi artık ÖLÜ DEĞİL (sahip bulgusu 2026-07-30). M1a'da tıklanamazdı çünkü
    // gidilecek bir yer yoktu; M1b Arkadaş Ekle ekranını getirdi, hedef artık var. Sahip tam olarak
    // burada takıldı: rozet Bildirimler'de çıkıyor, dokununca hiçbir şey olmuyordu.
    if (n.type === 'FRIEND_REQUEST') {
      router.push('/friends-add');
      return;
    }
    // Sprint M1d-0 — Kankalar ekranı geldi, FRIEND_ACCEPT artık hedefli.
    if (n.type === 'FRIEND_ACCEPT') {
      router.push('/friends-list');
      return;
    }
    // GUILD_INVITE hâlâ hedefsiz: davet kabul ekranı yok. "Boş yüzey açma" gereği bu satır
    // tıklanabilir YAPILMADI — uyduracak bir hedef icat edilmez.
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
          otherUserId: n.actor?.id ?? '',
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
            const clickable =
              item.type === 'FRIEND_REQUEST' ||
              item.type === 'FRIEND_ACCEPT' ||
              (item.type === 'MENTION' && !!item.channelId);
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
