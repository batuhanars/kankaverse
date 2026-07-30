import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type DmChannelDto } from '@/api/dm';
import { useAuthStore } from '@/stores/auth';
import { useDmStore } from '@/stores/dm';
import { useFriendsStore } from '@/stores/friends';
import { useTypingStore } from '@/stores/typing';
import { formatMentionsPlain } from '@/utils/mentions';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  onOpenDm: (channel: DmChannelDto) => void;
  onOpenRequests: () => void;
  // Sözleşme §8.1-A/4 (M1a fast-follow, ekranlarıyla birlikte M1b'de teslim edildi) + §3.2/3.3.
  onOpenSearch: () => void;
  onOpenAddFriend: () => void;
  onNewChat: () => void;
}

function displayName(ch: DmChannelDto): string {
  if (ch.type === 'DM') return ch.otherUser.username;
  if (ch.name) return ch.name;
  const names = ch.members.map((m) => m.username);
  return names.length <= 3 ? names.join(', ') : names.slice(0, 2).join(', ') + ` +${names.length - 2}`;
}

function avatarSource(ch: DmChannelDto): string | null {
  return ch.type === 'DM' ? ch.otherUser.avatarUrl : (ch.members[0]?.avatarUrl ?? null);
}

// Sprint M1a contract §5 ekran 1 — DM listesi (son mesaj önizleme + okunmamış) + "Mesaj İstekleri"
// girişi (rozetli). C9 kuralı web/DmList.vue ile aynı: bekleyen giden istek (`requestStatus ===
// 'PENDING'`) normal listede GÖRÜNMEZ, istek kutusuna gider (dev deneyimi: gönderenin ekranında
// kendi bekleyen isteği iki kez görünmesin).
export function DmSidebar({ onOpenDm, onOpenRequests, onOpenSearch, onOpenAddFriend, onNewChat }: Props) {
  const authUser = useAuthStore((s) => s.user);
  // Sözleşme §8.3 — liste artık `dm` store'undan okunur (soket katmanı oraya yazıyor). Yerel
  // state'te tutulurken canlı güncelleme tutunacak bir yer bulamıyordu.
  const channels = useDmStore((s) => s.channels);
  const requestCount = useDmStore((s) => s.requestCount);
  // Gelen (incoming) istek sayısı — giden istekler kullanıcıdan eylem beklemiyor, sayılmaz.
  const friendRequestCount = useFriendsStore(
    (s) => s.requests.filter((r) => r.direction === 'incoming').length,
  );
  const state = useDmStore((s) => s.state);
  const errorMessage = useDmStore((s) => s.errorMessage);
  const fetchAll = useDmStore((s) => s.fetchAll);
  const typingByChannel = useTypingStore((s) => s.byChannel);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function retry() {
    useDmStore.setState({ state: 'loading' });
    fetchAll();
  }

  function resolver(ch: DmChannelDto) {
    return (id: string): string | undefined => {
      if (id === authUser?.id) return authUser.username;
      if (ch.type === 'DM') return id === ch.otherUser.id ? ch.otherUser.username : undefined;
      return ch.members.find((m) => m.id === id)?.username;
    };
  }

  return (
    <View style={styles.flex}>
      {/* Sözleşme §8.1-A/3 — web'in küçük soluk bölüm etiketi (`dm.sectionHeader` = "MESAJLAR")
          mobilde ekran başlığı işi görüyor, o yüzden büyük+kalın "Mesajlar" (`mobile.home.dmEntry`).
          Web'in kendi anahtarına dokunulmadı; orada hâlâ sidebar bölüm etiketi.
          "+" — sözleşme §3.2/3.3'ün giriş noktası: web'de "DİREKT MESAJLAR" başlığının yanındaki
          `+` (HomeSidebar.vue) ile aynı yer, mobilin tek "Mesajlar" başlığına taşındı (ayrı bir alt
          etiket mobilde yok). Sözleşme bu düğmenin TAM konumunu belirtmiyor — bu bir dev kararı,
          rapora not edildi. */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t('mobile.home.dmEntry')}</Text>
        <Pressable
          onPress={onNewChat}
          style={styles.newChatButton}
          accessibilityRole="button"
          accessibilityLabel={t('startChat.openChatButton')}
          hitSlop={8}
        >
          <Ionicons name="add" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      {/* Sözleşme §8.1-A/4 (M1a'da yeri hazırlanmıştı, ekranlarıyla birlikte M1b'de geldi §3.1/3.4):
          dar/ikon arama + geniş "Arkadaş Ekle". */}
      <View style={styles.actionsRow}>
        <Pressable
          onPress={onOpenSearch}
          style={styles.searchButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.search')}
          hitSlop={8}
        >
          <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
        </Pressable>
        <Pressable onPress={onOpenAddFriend} style={styles.addFriendButton}>
          <Text style={styles.addFriendButtonText}>{t('friends.add')}</Text>
        </Pressable>
      </View>

      {/* Kanka isteği satırı — sahip bulgusu 2026-07-30: gelen istek YALNIZ "Kanka Ekle" ekranının
          içinde görünüyordu, sahip nereden kabul edeceğini bulamadı ("ben takıldıysam kullanıcı da
          takılır"). Rozet Bildirimler sekmesinde çıkıyor, eylem başka ekranda — kopukluk buydu.
          Yeni desen İCAT EDİLMEDİ: hemen altındaki mesaj-isteği satırının birebir kardeşi, aynı yerde,
          aynı görünüm. Boş yüzey yok: bekleyen istek yoksa hiç render edilmez. */}
      {friendRequestCount > 0 && (
        <Pressable onPress={onOpenAddFriend} style={styles.requestRow}>
          <Text style={styles.requestText}>
            {t('notification.friendRequests', { n: friendRequestCount })}
          </Text>
        </Pressable>
      )}

      {requestCount > 0 && (
        <Pressable onPress={onOpenRequests} style={styles.requestRow}>
          <Text style={styles.requestText}>{t('notification.messageRequests', { n: requestCount })}</Text>
        </Pressable>
      )}

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

      {state === 'ready' && channels.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('dm.noDms')}</Text>
        </View>
      )}

      {state === 'ready' && channels.length > 0 && (
        <FlatList
          data={channels}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const avatar = avatarSource(item);
            const name = displayName(item);
            const typing = (typingByChannel[item.id]?.length ?? 0) > 0;
            const preview = item.lastMessage
              ? formatMentionsPlain(item.lastMessage.content, resolver(item), t('mention.unknown'))
              : '';
            return (
              <Pressable onPress={() => onOpenDm(item)} style={styles.row}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.rowBody}>
                  <Text style={[styles.name, item.unread && styles.nameUnread]} numberOfLines={1}>
                    {name}
                  </Text>
                  {/* Sözleşme §8.3 — kutucukta "yazıyor…" (web Sprint 6 R1-b/R1-c karşılığı: "DM'e
                      bakmasan da kutucukta görünsün"). Yazan varsa son mesaj önizlemesini EZER,
                      1-1 DM'de sade metin (isim yok — web R1-c ile aynı). */}
                  {typing ? (
                    <Text style={styles.typing} numberOfLines={1}>
                      {t('typing.simple')}
                    </Text>
                  ) : preview ? (
                    <Text style={styles.preview} numberOfLines={1}>
                      {preview}
                    </Text>
                  ) : null}
                </View>
                {item.unread && <View style={styles.unreadDot} />}
              </Pressable>
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
    backgroundColor: theme.colors.bgSidebar,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 14,
    paddingBottom: 10,
  },
  header: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  newChatButton: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 10,
  },
  searchButton: {
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendButton: {
    flex: 1,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  requestRow: {
    marginHorizontal: 10,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentSubtle,
  },
  requestText: {
    color: theme.colors.accent400,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: 10,
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
    paddingHorizontal: 8,
    paddingBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
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
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
  },
  nameUnread: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  preview: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
  typing: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontStyle: 'italic',
    marginTop: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent500,
    marginLeft: 6,
  },
});
