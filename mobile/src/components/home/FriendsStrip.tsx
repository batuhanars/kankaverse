import { useMemo, useRef } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFriendsStore } from "@/stores/friends";
import { useDmStore } from "@/stores/dm";
import { usePresenceStore, type PresenceStatus } from "@/stores/presence";
import type { DmChannelDto } from "@/api/dm";
import type { FriendDto } from "@/api/friends";
import { extractErrorMessage } from "@/api/errors";
import { theme } from "@/theme";

const AVATAR = 48;
const DOT = 14;
const TILE_PAD = 10;

// Web `UserCard.vue` presenceColor ile aynı palet (token). Çevrimdışı da gri nokta alır: şeritte
// "durum yok" ile "çevrimdışı" ayrımı olmasın, her avatar aynı dili konuşsun.
const PRESENCE_COLOR: Record<PresenceStatus, string> = {
  online: theme.colors.online,
  away: theme.colors.idle,
  dnd: theme.colors.dnd,
  offline: theme.colors.offline,
};

// Çevrimiçi olanlar öne: şerit "şu an kim burada" sorusunu ilk bakışta cevaplasın.
const ORDER: Record<PresenceStatus, number> = {
  online: 0,
  away: 1,
  dnd: 2,
  offline: 3,
};

interface Props {
  onOpenDm: (channel: DmChannelDto) => void;
}

/**
 * Sahip isteği 2026-10-27 — DM panelinde "Kanka Ekle" ile DM listesi arasında yatay kanka şeridi.
 * Her kanka gri zeminli yuvarlak köşeli kendi kartında: yalnız avatar (ad yok) + sağ altta durum noktası. Dokununca o kankayla DM açılır.
 *
 * Avatarlar bilinçli STATİK (`avatarAnimatedUrl` kullanılmaz): Discord da bu listede oynatmıyor;
 * yan yana onlarca hareketli avatar dikkat dağıtır, pil yer (ray kararıyla aynı gerekçe).
 * Durum görünürlüğü sunucuda (R7, `canSeePresence`); burada yalnız store okunur. Kanka yoksa hiç çizilmez.
 */
export function FriendsStrip({ onOpenDm }: Props) {
  const friends = useFriendsStore((s) => s.friends);
  const statusMap = usePresenceStore((s) => s.statusMap);
  const createChannel = useDmStore((s) => s.createChannel);
  const busy = useRef(false);

  const sorted = useMemo(
    () =>
      [...friends].sort((a, b) => {
        const sa = ORDER[statusMap[a.user.id] ?? "offline"];
        const sb = ORDER[statusMap[b.user.id] ?? "offline"];
        return sa - sb || a.user.username.localeCompare(b.user.username, "tr");
      }),
    [friends, statusMap],
  );

  async function open(friend: FriendDto) {
    if (busy.current) return; // çift dokunuş iki kanal isteği atmasın
    busy.current = true;
    try {
      onOpenDm(await createChannel(friend.user.id));
    } catch (e) {
      Alert.alert(extractErrorMessage(e));
    } finally {
      busy.current = false;
    }
  }

  if (sorted.length === 0) return null;

  return (
    <FlatList
      horizontal
      data={sorted}
      keyExtractor={(f) => f.user.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.strip}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => void open(item)}
          accessibilityRole="button"
          accessibilityLabel={item.user.username}
          style={styles.item}
        >
          <View style={styles.avatarWrap}>
            {item.user.avatarUrl ? (
              <Image
                source={{ uri: item.user.avatarUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.fallback]}>
                <Text style={styles.fallbackText}>
                  {item.user.username.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    PRESENCE_COLOR[statusMap[item.user.id] ?? "offline"],
                },
              ]}
            />
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  // Sahip revizesi 2026-10-27: Discord gibi HER kanka kendi kartında (gri zemin, yuvarlak köşe);
  // şeridin kendisi zeminsiz. Alt boşluk DM listesinden ayrım için.
  strip: { flexGrow: 0, marginTop: 6, marginBottom: 16 },
  content: { paddingHorizontal: theme.layout.panelGap, gap: 8 },
  item: {
    padding: TILE_PAD,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
  },
  avatarWrap: { width: AVATAR, height: AVATAR },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  fallback: {
    backgroundColor: theme.colors.accent500,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: "700",
  },
  // Panel zemini renginde halka: nokta avatarın üstünden ayrışsın (web avatar noktasıyla aynı desen).
  dot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 3,
    borderColor: theme.colors.bgElevated,
  },
});
