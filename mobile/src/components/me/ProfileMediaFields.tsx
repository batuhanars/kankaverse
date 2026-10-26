import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { UserCardDto } from '@/api/users';
import { bannerColors } from '@/utils/bannerColor';
import { animatedOrStatic, useReduceMotion } from '@/utils/animatedMedia';
import { theme } from '@/theme';

/**
 * Profil düzenlemenin görsel alanı — **profil ekranının aynısı görünüm** (sahip talebi 2026-08-01):
 * üstte afiş, üzerine binen avatar, ikisinin de köşesinde **kalem** ikonu. Discord'un profil
 * düzenleme ekranıyla aynı okuma: "gördüğün şeyin üstüne dokunup değiştiriyorsun".
 *
 * Önceki hâli iki ayrı form satırıydı (etiket + Değiştir/Kaldır düğmeleri); sahip düzenlemenin
 * sonucunu göremediği için değişti.
 *
 * 🔴 Avatar yedeği İKİ KATMAN: `accentSubtle` yarı saydam, tek katman kullanılınca arkasındaki afiş
 * avatarın içinden görünüyor (2026-08-01'de bir kez yaşandı).
 */
export type MediaSlot = 'avatar' | 'banner';

interface Props {
  username: string;
  card: UserCardDto | null;
  uploading: MediaSlot | null;
  /** Kalem ikonuna dokunuş. Afişte panel açılır, avatarda doğrudan galeri. */
  onEdit: (slot: MediaSlot) => void;
}

const BANNER_H = 120;
const AVATAR = 76;
const OVERLAP = 36;

export function ProfileMediaFields({ username, card, uploading, onEdit }: Props) {
  const reduceMotion = useReduceMotion();
  const bannerSrc = animatedOrStatic(card?.bannerUrl, card?.bannerAnimatedUrl, reduceMotion);
  const avatarSrc = animatedOrStatic(card?.avatarUrl, card?.avatarAnimatedUrl, reduceMotion);
  return (
    <View style={styles.header}>
      {bannerSrc ? (
        <Image source={{ uri: bannerSrc }} style={styles.banner} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={bannerColors(card?.bannerColor)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        />
      )}

      {/* Afiş kalemi — sağ üstte, Discord konumu. */}
      <Pressable onPress={() => onEdit('banner')} style={styles.bannerPencil} hitSlop={8}>
        {uploading === 'banner' ? (
          <ActivityIndicator color={theme.colors.textPrimary} size="small" />
        ) : (
          <Ionicons name="pencil" size={16} color={theme.colors.textPrimary} />
        )}
      </Pressable>

      {avatarNode(username, avatarSrc, styles)}

      {/* Avatar kalemi — avatarın sağ üst köşesine binen küçük daire. */}
      <Pressable onPress={() => onEdit('avatar')} style={styles.avatarPencil} hitSlop={8}>
        {uploading === 'avatar' ? (
          <ActivityIndicator color={theme.colors.textPrimary} size="small" />
        ) : (
          <Ionicons name="pencil" size={14} color={theme.colors.textPrimary} />
        )}
      </Pressable>
    </View>
  );
}

function avatarNode(username: string, avatarSrc: string | null, s: typeof styles) {
  if (avatarSrc) return <Image source={{ uri: avatarSrc }} style={s.avatar} />;
  return (
    <View style={[s.avatar, s.avatarFallback]}>
      <View style={s.avatarTint} />
      <Text style={s.avatarLetter}>{username.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: BANNER_H + (AVATAR - OVERLAP),
    marginHorizontal: -theme.layout.panelGap,
    marginTop: -theme.layout.panelGap,
  },
  banner: {
    height: BANNER_H,
    width: '100%',
  },
  bannerPencil: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  avatar: {
    position: 'absolute',
    left: theme.layout.panelGap,
    top: BANNER_H - OVERLAP,
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 4,
    borderColor: theme.colors.bgContent,
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
    fontSize: 26,
    fontWeight: '700',
  },
  // Avatarın SAĞ ÜST köşesine biner (Discord konumu) — avatarın kendi kenarlığıyla hizalı.
  avatarPencil: {
    position: 'absolute',
    left: theme.layout.panelGap + AVATAR - 24,
    top: BANNER_H - OVERLAP - 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent500,
    borderWidth: 2,
    borderColor: theme.colors.bgContent,
  },
});
