import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FriendDto } from '@/api/friends';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Profil ekranındaki "Kankalar" satırı (M1d-C §3.1): etiket + kanka avatarları + sağ ok.
 *
 * Avatar dizisi bir SÜS değil, satırın bilgisi: kaç kankan olduğu ve kimler olduğu tek bakışta
 * görünüyor. Sahip referansındaki (Discord "Arkadaşların") satırın karşılığı.
 *
 * 🔴 Avatar yedeği İKİ KATMAN: `accentSubtle` yarı saydam bir token, tek katman kullanılırsa
 * arkasındaki yüzey görünür (profil afişinde bir kez yaşandı, 2026-08-01). Burada arka plan düz
 * olsa da aynı desen kullanılıyor — kusurun ikinci kez doğmasına gerek yok.
 */
interface Props {
  friends: FriendDto[];
  onPress: () => void;
}

/** Satıra sığan avatar sayısı. Fazlası "+N" ile özetlenir; taşan avatar dizmek satırı bozar. */
const MAX_AVATARS = 5;

export function FriendsRow({ friends, onPress }: Props) {
  const shown = friends.slice(0, MAX_AVATARS);
  const rest = friends.length - shown.length;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
      <Text style={styles.label}>{t('friends.title')}</Text>

      {shown.length > 0 && (
        <View style={styles.avatars}>
          {shown.map((f) => (
            <View key={f.friendshipId} style={styles.avatarWrap}>
              {f.user.avatarUrl ? (
                <Image source={{ uri: f.user.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <View style={styles.avatarTint} />
                  <Text style={styles.avatarLetter}>{f.user.username.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
          ))}
          {rest > 0 && <Text style={styles.rest}>+{rest}</Text>}
        </View>
      )}

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const AVATAR = 24;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap,
  },
  label: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  avatars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  avatarWrap: {
    // Hafif bindirme: satır kalabalıklaşmadan birden fazla avatar sığsın.
    marginLeft: -6,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1,
    borderColor: theme.colors.bgSidebar,
  },
  avatarFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.accentSubtle,
  },
  avatarLetter: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  rest: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    marginLeft: 2,
  },
});
