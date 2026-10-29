import { useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFriendsStore } from "@/stores/friends";
import { useActivityStore, type GameActivity } from "@/stores/activity";
import { usePresenceStore, type PresenceStatus } from "@/stores/presence";
import type { FriendDto } from "@/api/friends";
import { PresenceDot } from "@/components/PresenceDot";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { theme } from "@/theme";

const AVATAR = 48;
const DOT = 14;
const TILE_PAD = 10;
const LOGO = 40;
const GAME_TEXT_WIDTH = 84;

// Çevrimdışı da gri nokta alır: şeritte "durum yok" ile "çevrimdışı" ayrımı olmasın.
// Çevrimiçi olanlar öne: şerit "şu an kim burada" sorusunu ilk bakışta cevaplasın.
const ORDER: Record<PresenceStatus, number> = {
  online: 0,
  away: 1,
  dnd: 2,
  offline: 3,
};

/**
 * Sahip isteği 2026-10-27 — DM panelinde "Kanka Ekle" ile DM listesi arasında yatay kanka şeridi.
 * Her kanka gri zeminli yuvarlak köşeli kendi kartında: avatar + sağ altta durum noktası.
 *
 * C31d: oyun oynayan kanka GENİŞ kart (solda kare oyun logosu, sağda avatar + kullanıcı adı + oyun adı,
 * sağ üstte ikincil renkte kol simgesi) ve şeridin başında. Dokununca DM'e DEĞİL profil paneline gider
 * (panelin "Mesaj" eylemi DM'e götürür). Görünürlük sunucuda (R7): store'da olan gösterilir.
 *
 * Avatarlar bilinçli STATİK (`avatarAnimatedUrl` kullanılmaz): Discord da bu listede oynatmıyor;
 * yan yana onlarca hareketli avatar dikkat dağıtır, pil yer (ray kararıyla aynı gerekçe).
 * Durum görünürlüğü sunucuda (R7, `canSeePresence`); burada yalnız store okunur. Kanka yoksa hiç çizilmez.
 */
export function FriendsStrip() {
  const friends = useFriendsStore((s) => s.friends);
  const statusMap = usePresenceStore((s) => s.statusMap);
  const gameByUser = useActivityStore((s) => s.byUser);
  const [target, setTarget] = useState<FriendDto | null>(null);

  const sorted = useMemo(
    () =>
      [...friends].sort((a, b) => {
        const ga = gameByUser[a.user.id] ? 0 : 1;
        const gb = gameByUser[b.user.id] ? 0 : 1;
        if (ga !== gb) return ga - gb;
        const sa = ORDER[statusMap[a.user.id] ?? "offline"];
        const sb = ORDER[statusMap[b.user.id] ?? "offline"];
        return sa - sb || a.user.username.localeCompare(b.user.username, "tr");
      }),
    [friends, statusMap, gameByUser],
  );

  if (sorted.length === 0) return null;

  function renderAvatar(item: FriendDto) {
    return (
      <View style={styles.avatarWrap}>
        {item.user.avatarUrl ? (
          <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.fallback]}>
            <Text style={styles.fallbackText}>
              {item.user.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <PresenceDot
          status={statusMap[item.user.id] ?? "offline"}
          size={DOT}
          ringWidth={3}
          ringColor={theme.colors.bgElevated}
        />
      </View>
    );
  }

  function renderGameCard(item: FriendDto, game: GameActivity) {
    return (
      <>
        <View style={styles.logoBox}>
          {game.iconUrl ? (
            <Image source={{ uri: game.iconUrl }} style={styles.logoImage} />
          ) : (
            <Ionicons name="game-controller" size={26} color={theme.colors.textSecondary} />
          )}
        </View>
        <View style={styles.gameInfo}>
          {renderAvatar(item)}
          <Text style={styles.gameUser} numberOfLines={1}>
            {item.user.username}
          </Text>
          <Text style={styles.gameName} numberOfLines={1}>
            {game.name}
          </Text>
        </View>
        <Ionicons
          name="game-controller"
          size={12}
          color={theme.colors.textSecondary}
          style={styles.cornerIcon}
        />
      </>
    );
  }

  return (
    <>
      <FlatList
        horizontal
        data={sorted}
        keyExtractor={(f) => f.user.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.strip}
        renderItem={({ item }) => {
          const game = gameByUser[item.user.id];
          return (
            <Pressable
              onPress={() => setTarget(item)}
              accessibilityRole="button"
              accessibilityLabel={item.user.username}
              style={[styles.item, game ? styles.itemGame : null]}
            >
              {game ? renderGameCard(item, game) : renderAvatar(item)}
            </Pressable>
          );
        }}
      />
      {target && (
        <ProfileSheet
          userId={target.user.id}
          username={target.user.username}
          avatarUrl={target.user.avatarUrl}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Sahip revizesi 2026-10-27: Discord gibi HER kanka kendi kartında (gri zemin, yuvarlak köşe);
  // şeridin kendisi zeminsiz. Alt boşluk DM listesinden ayrım için.
  strip: { flexGrow: 0, marginTop: 6, marginBottom: 16 },
  content: { paddingHorizontal: theme.layout.panelGap, gap: 8 },
  // Kartlar şeritteki en uzun karta uzanır (FlatList çapraz eksen stretch): oyun kartı yüksekliği belirler.
  item: {
    padding: TILE_PAD,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    justifyContent: "center",
  },
  itemGame: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 22 },
  logoBox: {
    width: LOGO,
    height: LOGO,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImage: { width: LOGO, height: LOGO },
  gameInfo: { width: GAME_TEXT_WIDTH, alignItems: "center", gap: 2 },
  gameUser: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    maxWidth: GAME_TEXT_WIDTH,
  },
  gameName: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    maxWidth: GAME_TEXT_WIDTH,
  },
  cornerIcon: { position: "absolute", top: 6, right: 8 },
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
});
