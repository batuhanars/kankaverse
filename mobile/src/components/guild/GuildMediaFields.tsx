import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { GuildSummaryDto } from '@/api/guilds';
import { bannerColors } from '@/utils/bannerColor';
import { animatedOrStatic, useReduceMotion } from '@/utils/animatedMedia';
import { theme } from '@/theme';

/**
 * Ortam ayarlarının görsel alanı: profil düzenlemedeki `ProfileMediaFields` ile aynı okuma (sahip kararı
 * 2026-10-27): üstte afiş, üzerine binen simge, ikisinin köşesinde kalem. Afiş ayrı bir liste satırından
 * düzenlenmiyor artık; "gördüğün şeyin üstüne dokunup değiştiriyorsun".
 *
 * Simge burada altıgen DEĞİL, yuvarlak köşeli kare: afişin üstüne biniyor ve mobil altıgen
 * (`HexGuildIcon`) dışını düz zemin rengiyle örttüğü için afiş üzerinde köşe izi bırakırdı.
 * Hareketli sürüm normal `Image` ile güvenle gösterilir (SVG yüzeyi yok).
 *
 * Kalemler yalnız `editable` iken (simge/afiş uçları yalnız OWNER kabul ediyor).
 * Bindirme negatif kenar boşluğuyla ama ebeveyn SINIRI İÇİNDE (simge kardeş afişin üstüne biner,
 * kapsayıcının dışına taşmaz: `ProfileMediaFields` 2026-08-01 dersi).
 */
interface Props {
  guild: Pick<
    GuildSummaryDto,
    'name' | 'iconUrl' | 'iconAnimatedUrl' | 'bannerUrl' | 'bannerAnimatedUrl' | 'bannerColor'
  > | null;
  fallbackName: string;
  editable: boolean;
  onEditIcon: () => void;
  onEditBanner: () => void;
}

const ICON = 76;
const OVERLAP = 38;

export function GuildMediaFields({ guild, fallbackName, editable, onEditIcon, onEditBanner }: Props) {
  const reduceMotion = useReduceMotion();
  const bannerSrc = animatedOrStatic(guild?.bannerUrl, guild?.bannerAnimatedUrl, reduceMotion);
  const iconSrc = animatedOrStatic(guild?.iconUrl, guild?.iconAnimatedUrl, reduceMotion);
  const name = guild?.name ?? fallbackName;

  return (
    <View style={styles.wrap}>
      <View>
        {bannerSrc ? (
          <Image source={{ uri: bannerSrc }} style={styles.banner} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={bannerColors(guild?.bannerColor)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          />
        )}
        {editable && (
          <Pressable onPress={onEditBanner} style={styles.bannerPencil} hitSlop={8}>
            <Ionicons name="pencil" size={16} color={theme.colors.textPrimary} />
          </Pressable>
        )}
      </View>

      <View style={styles.iconRow}>
        <View>
          {iconSrc ? (
            <Image source={{ uri: iconSrc }} style={styles.icon} />
          ) : (
            <View style={[styles.icon, styles.iconFallback]}>
              <Text style={styles.iconLetter}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {editable && (
            <Pressable onPress={onEditIcon} style={styles.iconPencil} hitSlop={8}>
              <Ionicons name="pencil" size={14} color={theme.colors.textPrimary} />
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: -theme.layout.panelGap,
    marginTop: -theme.layout.panelGap,
    marginBottom: theme.layout.panelGap,
  },
  // C19: ortam afişi 2:1 (kanal paneli ile aynı oran).
  banner: { width: '100%', aspectRatio: 2 },
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
  iconRow: {
    marginTop: -OVERLAP,
    paddingHorizontal: theme.layout.panelGap,
    flexDirection: 'row',
  },
  icon: {
    width: ICON,
    height: ICON,
    borderRadius: theme.radius.lg,
    borderWidth: 4,
    borderColor: theme.colors.bgContent,
  },
  // İki katman gerekmez: zemin opak `bgElevated` (yarı saydam token kullanılmıyor, afiş içinden görünmez).
  iconFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLetter: {
    color: theme.colors.accent500,
    fontSize: 26,
    fontWeight: '700',
  },
  // Simgenin sağ üst köşesine biner (profil avatar kalemiyle aynı konum).
  iconPencil: {
    position: 'absolute',
    right: -6,
    top: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent500,
    borderWidth: 2,
    borderColor: theme.colors.bgContent,
  },
  name: {
    paddingHorizontal: theme.layout.panelGap,
    marginTop: 10,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
});
