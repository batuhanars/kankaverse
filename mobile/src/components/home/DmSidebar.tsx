import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { FriendsStrip } from './FriendsStrip';
import { Ionicons } from '@expo/vector-icons';
import { type DmChannelDto } from '@/api/dm';
import { DmRow } from './DmRow';
import { useAuthStore } from '@/stores/auth';
import { useDmStore } from '@/stores/dm';
import { useFriendsStore } from '@/stores/friends';
import { useTypingStore } from '@/stores/typing';
import { resolvePref, useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { NotificationLevel } from '@/api/notifications';
import { useVoicePresenceStore } from '@/stores/voicePresence';
import { formatMentionsPlain } from '@/utils/mentions';
import { channelTitle } from '@/utils/channelTitle';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { useEncryptedPreviews } from './useEncryptedPreviews';

interface Props {
  onOpenDm: (channel: DmChannelDto) => void;
  /** Satıra uzun basış → DM paneli (sözleşme §2.3). Panel yalnız listeden açılır. */
  onDmMenu: (channel: DmChannelDto) => void;
  onOpenRequests: () => void;
  // Sözleşme §8.1-A/4 (M1a fast-follow, ekranlarıyla birlikte M1b'de teslim edildi) + §3.2/3.3.
  onOpenSearch: () => void;
  onOpenAddFriend: () => void;
  /** Sprint C18 — ortamı olmayan kullanıcı için öneri bloğu (home.tsx karar verir); yoksa null. */
  welcome?: ReactNode;
}

function avatarSource(ch: DmChannelDto): string | null {
  return ch.type === 'DM' ? ch.otherUser.avatarUrl : (ch.members[0]?.avatarUrl ?? null);
}

// Sprint M1a contract §5 ekran 1 — DM listesi (son mesaj önizleme + okunmamış) + "Mesaj İstekleri"
// girişi (rozetli). C9 kuralı web/DmList.vue ile aynı: bekleyen giden istek (`requestStatus ===
// 'PENDING'`) normal listede GÖRÜNMEZ, istek kutusuna gider (dev deneyimi: gönderenin ekranında
// kendi bekleyen isteği iki kez görünmesin).
export function DmSidebar({ onOpenDm, onDmMenu, onOpenRequests, onOpenSearch, onOpenAddFriend, welcome }: Props) {
  const authUser = useAuthStore((s) => s.user);
  // Sözleşme §8.3 — liste artık `dm` store'undan okunur (soket katmanı oraya yazıyor). Yerel
  // state'te tutulurken canlı güncelleme tutunacak bir yer bulamıyordu.
  const channels = useDmStore((s) => s.channels);
  const encryptedPreviews = useEncryptedPreviews(channels);
  const requestCount = useDmStore((s) => s.requestCount);
  // Gelen (incoming) istek sayısı — giden istekler kullanıcıdan eylem beklemiyor, sayılmaz.
  const friendRequestCount = useFriendsStore(
    (s) => s.requests.filter((r) => r.direction === 'incoming').length,
  );
  const state = useDmStore((s) => s.state);
  const errorMessage = useDmStore((s) => s.errorMessage);
  const fetchAll = useDmStore((s) => s.fetchAll);
  const typingByChannel = useTypingStore((s) => s.byChannel);
  // Sprint M2b §10 R2-2 — DM/grup DM'de de §5 süzgeci: hedef susturulmuşsa veya `NONE` ise
  // okunmamış nokta gösterilmez. `resolvePref` guildId'siz çağrılır (DM'in bağlı bir ortamı yok).
  const notifPrefs = useNotificationPrefsStore((s) => s.prefs);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Sözleşme M4b §13.1/§13.3 — grup DM satırlarının ses presence aboneliği burada yönetilir
  // (`DmRow` yalnız store'dan OKUR, gösterge — bkz. o dosyadaki not). [[D45]]'in ref-sayılı
  // aboneliği sayesinde aynı kanalı burada VE açık DM ekranında (`dm/[id].tsx`) izlemek güvenli:
  // biri unmount olunca öbürü kör kalmıyor.
  //
  // Bağımlılık `channels` DİZİSİNİN KENDİSİ değil, yalnız GRUP DM kimliklerinin SIRALANMIŞ kümesi
  // (`groupDmIdsKey`) — `channels` yeni mesaj geldikçe (sıralama, önizleme) sık yeni referans alır;
  // ham diziye bağımlı olsaydı her mesajda gereksiz unsubscribe+subscribe çakılırdı (D45'in ref
  // sayacı bunu güvenli kılar ama gürültü olurdu). Yalnız küme gerçekten DEĞİŞİNCE (grup kuruldu/
  // silindi/gruptan çıkıldı) yeniden kurulur.
  const groupDmIdsKey = channels
    .filter((c) => c.type === 'GROUP_DM')
    .map((c) => c.id)
    .sort()
    .join(',');

  useEffect(() => {
    const ids = groupDmIdsKey ? groupDmIdsKey.split(',') : [];
    ids.forEach((id) => useVoicePresenceStore.getState().subscribe(id));
    return () => {
      ids.forEach((id) => useVoicePresenceStore.getState().unsubscribe(id));
    };
  }, [groupDmIdsKey]);

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
          Revizyon R2 (§13/1) — burada duran "+" KALDIRILDI: aynı işi artık FAB yapıyor
          (home.tsx), iki girişin anlamı yoktu, FAB daha keşfedilebilir. */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t('mobile.home.dmEntry')}</Text>
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

      {/* Sahip isteği 2026-10-27 — yatay kanka şeridi (yalnız avatar + durum noktası). */}
      <FriendsStrip />

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

      {welcome}

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
            const name = channelTitle(item);
            const typing = (typingByChannel[item.id]?.length ?? 0) > 0;
            // C46 §4b.6 — tepki göstergesi doluyken son mesaj önizlemesinin yerine geçer
            // (susturulmuş/NONE satırda geçmez: görünüm aynı kalır).
            const resolved = resolvePref(notifPrefs, 'CHANNEL', item.id);
            const showUnread =
              item.unread && resolved.level !== NotificationLevel.NONE && !resolved.muted;
            const preview =
              item.lastReaction && showUnread
                ? t('dm.reactionPreview', { actor: item.lastReaction.actorUsername, emoji: item.lastReaction.emoji })
                : item.lastMessage?.encrypted
                  ? // E3 §4.1: yerel depoda düz metin varsa o, yoksa genel önizleme (çözme yapılmaz)
                    (encryptedPreviews[item.lastMessage.id] ?? t('e2ee.preview'))
                  : item.lastMessage
                  ? formatMentionsPlain(item.lastMessage.content, resolver(item), t('mention.unknown'))
                  : '';
            // §5 R2-2 — susturulmuş veya `NONE` hedefte nokta gösterilmez (okunmamış HESABI
            // bozulmaz, yalnız gösterim; `clearUnread`/soket katmanı ham veriyi değiştirmeye devam eder).
            return (
              <DmRow
                name={name}
                avatarUrl={avatar}
                preview={preview}
                typing={typing}
                unread={showUnread}
                channelId={item.id}
                isGroup={item.type === 'GROUP_DM'}
                onPress={() => onOpenDm(item)}
                onLongPress={() => onDmMenu(item)}
              />
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
});
