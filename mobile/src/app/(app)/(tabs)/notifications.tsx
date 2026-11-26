import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useNotificationsStore } from '@/stores/notifications';
import { useDmStore } from '@/stores/dm';
import { useAiVideoViewerStore } from '@/stores/aiVideoViewer';
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

/** Metin satırının altındaki önizleme; davet kodu ve etkinlik adı gösterilmez, tepkide emoji metinde. */
function previewLine(n: NotificationDto): string | null {
  // E5b: aktarım bildiriminde cihaz adı zaten ana metinde, alt satır tekrar etmez.
  if (!n.preview || n.type === 'GUILD_INVITE' || n.type === 'EVENT_CREATED' || n.type === 'E2EE_TRANSFER') return null;
  if (n.type !== 'REACTION') return n.preview;
  return n.preview.split(' ').slice(1).join(' ') || null;
}

function notificationText(n: NotificationDto): string {
  const actor = n.actor?.username ?? t('notification.someone');
  switch (n.type) {
    case 'MENTION':
      return t('notification.mention', { actor });
    case 'REACTION':
      // C46 §1.4: preview = "emoji + boşluk + mesaj önizlemesi"
      return t('notification.reaction', { actor, emoji: n.preview?.split(' ')[0] ?? '' });
    case 'FRIEND_REQUEST':
      return t('notification.friendRequest', { actor });
    case 'FRIEND_ACCEPT':
      return t('notification.friendAccept', { actor });
    case 'MESSAGE_REQUEST':
      return t('notification.messageRequest', { actor }); // C75: içerik yok (K2)
    case 'GUILD_INVITE':
      return t('notification.guildInvite', { actor, guild: n.guildName ?? t('invite.unknownGuild') });
    case 'AI_VIDEO_READY':
      return t('notification.aiVideoReady');
    case 'AI_VIDEO_FAILED':
      return t('notification.aiVideoFailed');
    case 'E2EE_TRANSFER':
      // E5b §4.5 (web NotificationBell ile aynı anahtarlar): preview = yeni cihazın adı.
      return n.preview
        ? t('notification.e2eeTransfer', { device: n.preview })
        : t('notification.e2eeTransferNoDevice');
    case 'EVENT_CREATED':
      // Sprint R14 §3.2 — `preview` = etkinlik adı (web NotificationBell ile AYNI anahtar)
      return t('notification.eventCreated', { actor, event: n.preview ?? '' });
    default:
      return actor;
  }
}

// Sahip bulgusu 2026-08-11 — `push.ts`'teki `readExpoPushToken` izin verilmemişken (özellikle
// Android'in "bir daha sorma" bayrağı düşünce, `canAskAgain === false`) bilinçli olarak sessiz
// `null` döner (contract'ın "ısrarlı ikinci sorma yok" kuralı). Sorun ısrar eksikliği değil,
// GÖRÜNÜRLÜK eksikliği: sahip aynı günde iki kez "push gitmiyor" diye kod aradı, sebep OS izniydi.
// Bu şerit yalnız izin YOKKEN görünür ve durumu OS'tan okur — `push.ts`'e dokunulmadı, istekte
// bulunmuyor, yalnız mevcut durumu gösterip sistem ayarlarına yönlendiriyor. Odaklanmada yeniden
// okunur ki kullanıcı ayarlardan izni açıp döndüğünde şerit kendiliğinden kaybolsun.
function NotificationPermissionBanner() {
  const [granted, setGranted] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync()
        .then((res) => setGranted(res.status === 'granted'))
        .catch(() => setGranted(null));
    }, []),
  );

  // `granted === null` (henüz okunmadı ya da okuma başarısız oldu) sırasında da gösterilmez —
  // yanlış-pozitif bir uyarı, gerçek bir izin sorunundan daha kötü bir kullanıcı deneyimidir.
  if (granted !== false) return null;

  return (
    <View style={styles.permissionBanner}>
      <Ionicons name="notifications-off-outline" size={18} color={theme.colors.warning} />
      <View style={styles.permissionBannerBody}>
        <Text style={styles.permissionBannerText}>{t('mobile.notificationsPermission.message')}</Text>
        <Pressable onPress={() => void Linking.openSettings()}>
          <Text style={styles.permissionBannerAction}>{t('mobile.notificationsPermission.action')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Sprint M1a contract §5 ekran 5 — liste + okunmamış vurgusu + dokunuşta ilgili kanala git.
// M1a'da yalnız MENTION'ın hedefi vardı; M1b Arkadaş Ekle ekranını getirdiği için **FRIEND_REQUEST de
// tıklanabilir oldu**. Sprint M1d-0 contract §3.2 — Kankalar ekranı geldiği için **FRIEND_ACCEPT de
// tıklanabilir oldu** (M1b'de hedefi yoktu, bilinçle bırakılmıştı).
//
// Sprint M1d §2.6 (**revize edildi, PM 2026-08-01**) — GUILD_INVITE artık hedefli. Sözleşme
// "guildId'ye git, üye değilsen tıklanamaz kalsın" diyordu; DTO kaynaktan okununca yanlış olduğu
// görüldü: bu bildirim **davet kodunu `preview` alanında taşıyor** ve alıcı zaten çoğunlukla üye
// DEĞİL — davet edilmiş. "Üye değilsen tıklanamaz" kuralı bildirimi tam da işe yarayacağı durumda
// ölü bırakırdı. Hedef web ile aynı (`NotificationBell.vue`: `/invite/${preview}`): mobilde bunun
// karşılığı M1d-A'da yazılan Ortama Katıl ekranıdır, kod hazır geçilir. **Yeni ekran açılmadı.**
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
  const clearAll = useNotificationsStore((s) => s.clearAll);

  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const requestCount = useDmStore((s) => s.requestCount);
  const hasUnread = unreadCount > 0 || items.some((n) => !n.readAt);

  // Liste her ODAKLANMADA tazelenir (sekme ekranları oturum boyunca mount'lu kalır, M1d-0 dersi).
  // 2026-11-12 sahip kararı: odaklanma artık okundu İŞARETLEMEZ. Kullanıcı bildirime dokununca o
  // satır okunur; hepsini birden okumak için başlıktaki buton var (web çanıyla aynı davranış).
  useFocusEffect(
    useCallback(() => {
      void fetchFirstPage();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Temizle — kalıcı silme, onay ister (web ConfirmDialog ile aynı metinler).
  function onClearPress() {
    Alert.alert(t('notification.clearTitle'), t('notification.clearConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('notification.clearButton'),
        style: 'destructive',
        onPress: () => {
          void clearAll().then((ok) => {
            if (!ok) Alert.alert(t('common.error'));
          });
        },
      },
    ]);
  }

  function onItemPress(n: NotificationDto) {
    // Dokunulan bildirim okundu işaretlenir (web NotificationBell.vue ile aynı semantik).
    void markRead(n.id);
    // Kanka isteği bildirimi artık ÖLÜ DEĞİL (sahip bulgusu 2026-07-30). M1a'da tıklanamazdı çünkü
    // gidilecek bir yer yoktu; M1b Arkadaş Ekle ekranını getirdi, hedef artık var. Sahip tam olarak
    // burada takıldı: rozet Bildirimler'de çıkıyor, dokununca hiçbir şey olmuyordu.
    // C49 — yapay zeka video: görüntüleyici sayfası o üretim açık gelir (rota değil, `(app)` host'u).
    if (n.type === 'AI_VIDEO_READY' || n.type === 'AI_VIDEO_FAILED') {
      if (n.aiVideoId) useAiVideoViewerStore.getState().open(n.aiVideoId);
      return;
    }
    if (n.type === 'FRIEND_REQUEST') {
      router.push('/friends-add');
      return;
    }
    // C75: mesaj isteği bildirimi → istek ekranı, o istek seçili (kanal kimliğiyle).
    if (n.type === 'MESSAGE_REQUEST') {
      router.push(n.channelId ? { pathname: '/dm-requests', params: { channel: n.channelId } } : '/dm-requests');
      return;
    }
    // E5b §4.5: "bu sen değilsen" bildirimi → oturumlar (push dokunuşuyla aynı hedef, sahip turu 2026-11-12).
    if (n.type === 'E2EE_TRANSFER') {
      router.push('/security-sessions');
      return;
    }
    // Sprint M1d-0 — Kankalar ekranı geldi, FRIEND_ACCEPT artık hedefli.
    if (n.type === 'FRIEND_ACCEPT') {
      router.push('/friends-list');
      return;
    }
    // GUILD_INVITE → Ortama Katıl, kod hazır. `preview` davet kodudur (sunucu `notifications.service`
    // öyle dolduruyor, web de öyle okuyor). Kodsuz bildirim gelirse (eski kayıt) satır tıklanamaz
    // kalır — hedef uydurulmaz.
    if (n.type === 'GUILD_INVITE') {
      if (n.preview) router.push({ pathname: '/join-guild', params: { code: n.preview } });
      return;
    }
    // Sprint R14 §3.2 — EVENT_CREATED → ortamın etkinlikler ekranı. Bildirimde etkinlik ID'si YOK
    // (`preview` = ad), o yüzden karta zıplama yok; `guildId` yoksa satır zaten tıklanamaz.
    if (n.type === 'EVENT_CREATED') {
      if (n.guildId) router.push({ pathname: '/guild-events', params: { guildId: n.guildId } });
      return;
    }
    if ((n.type !== 'MENTION' && n.type !== 'REACTION') || !n.channelId) return;
    if (n.guildId) {
      // 🔴 Kusur düzeltmesi (sahip bulgusu 2026-08-03, cihaz turu — push'tan açılan kanal). Push
      // yolu (`pushNavigation.ts`) aynı kusuru taşıyordu ve orada düzeltildi; burada da `guildId`
      // taşınmıyordu → `resolveRole` boş liste görüp `@rol` yedeğine düşüyordu (aynı kusur iki
      // yerde durmasın). `guildId` zaten `NotificationDto`'da var (EVENT_CREATED dalı yukarıda
      // kullanıyor), yeni bir alan/istek gerekmiyor.
      router.push({ pathname: '/channel/[id]', params: {
          id: n.channelId,
          name: '',
          guildId: n.guildId,
          // D99: bildirimdeki mesaja kaydir (yoksa yalnız kanal acilir).
          ...(n.messageId ? { jumpTo: n.messageId } : {}),
        },
      });
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
          ...(n.messageId ? { jumpTo: n.messageId } : {}),
        },
      });
    }
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('notification.title')}</Text>
        <View style={styles.headerActions}>
          <Pressable
            disabled={!hasUnread}
            onPress={() => void markAllRead()}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[styles.markAll, !hasUnread && styles.markAllDisabled]}>
              {t('notification.markAllRead')}
            </Text>
          </Pressable>
          <Pressable
            disabled={items.length === 0}
            onPress={onClearPress}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[styles.clearAll, items.length === 0 && styles.markAllDisabled]}>
              {t('notification.clearAll')}
            </Text>
          </Pressable>
        </View>
      </View>
      <NotificationPermissionBanner />

      {/* C75 Rev.4 — bekleyen mesaj istekleri kısayolu (web çanındaki satırın karşılığı) */}
      {requestCount > 0 && (
        <Pressable
          style={styles.requestRow}
          onPress={() => router.push('/dm-requests')}
          accessibilityRole="button"
        >
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.accent500} />
          <Text style={styles.requestRowText}>{t('notification.messageRequests', { n: requestCount })}</Text>
          <View style={styles.requestRowBadge}>
            <Text style={styles.requestRowBadgeText}>{requestCount}</Text>
          </View>
        </Pressable>
      )}

      {loading && items.length === 0 && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {!loading && items.length === 0 && requestCount === 0 && (
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
              item.type === 'MESSAGE_REQUEST' ||
              item.type === 'E2EE_TRANSFER' ||
              (item.type === 'GUILD_INVITE' && !!item.preview) ||
              (item.type === 'EVENT_CREATED' && !!item.guildId) ||
              ((item.type === 'AI_VIDEO_READY' || item.type === 'AI_VIDEO_FAILED') && !!item.aiVideoId) ||
              ((item.type === 'MENTION' || item.type === 'REACTION') && !!item.channelId);
            return (
              <Pressable
                disabled={!clickable}
                onPress={clickable ? () => onItemPress(item) : undefined}
                style={[styles.row, !item.readAt && styles.rowUnread]}
              >
                {/* R14 §3.2 — etkinlik bildiriminin simgesi takvim (özne kişi değil etkinlik) */}
                {item.type === 'EVENT_CREATED' ? (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
                  </View>
                ) : item.type === 'AI_VIDEO_READY' || item.type === 'AI_VIDEO_FAILED' ? (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="videocam-outline" size={18} color={theme.colors.textSecondary} />
                  </View>
                ) : item.actor?.avatarUrl ? (
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
                  {/* EVENT_CREATED'ta preview etkinlik adı ve zaten metnin içinde — tekrar etmesin */}
                  {previewLine(item) ? (
                    <Text style={styles.preview} numberOfLines={1}>
                      {previewLine(item)}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    flexShrink: 1,
  },
  markAll: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  clearAll: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  markAllDisabled: {
    opacity: 0.4,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: theme.layout.panelGap,
    marginBottom: 12,
    padding: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warningSubtle,
  },
  permissionBannerBody: {
    flex: 1,
    gap: 4,
  },
  permissionBannerText: {
    color: theme.colors.warning,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
  },
  permissionBannerAction: {
    color: theme.colors.warning,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: theme.layout.panelGap,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentSubtle,
  },
  requestRowText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  requestRowBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestRowBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
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
