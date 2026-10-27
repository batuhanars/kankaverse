import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { DiscoveryGuildDto } from '@/api/discovery';
import { HexGuildIcon } from '../guild/HexGuildIcon';
import { animatedOrStatic, useReduceMotion } from '@/utils/animatedMedia';
import { bannerColors } from '@/utils/bannerColor';
import { t } from '@/i18n';
import { theme } from '@/theme';

const SIZE = 48;

interface Props {
  guild: DiscoveryGuildDto;
  /** Kullanıcı zaten üye: düğme yok, kartın tamamı ortama götürür (web ile aynı). */
  isMember: boolean;
  joining: boolean;
  /** Başka bir katılma sürerken düğme kilitli (ikinci dokunuş yutulur). */
  disabled: boolean;
  onJoin: () => void;
  onGo: () => void;
}

/** İlk iki kelimenin baş harfleri (web `DiscoverGuildCard` / `InviteAcceptCard` ile aynı kural). */
function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

/**
 * Sprint C18 §1 + sahip revizesi 2026-10-27 — tek sütun "tombul" Keşfet kartı: üstte tam genişlik 2:1 afiş
 * (görsel/hareketli yoksa `bannerColor` gradyanı), altında simge + ad + üye sayısı, açıklama, etiketler.
 * Keşfet ekranı ve ana ekran öneri bloğu AYNI bileşeni kullanır.
 *
 * Simge afişe BİNMEZ (web'den bilinçli fark): `HexGuildIcon` altıgen dışını kart zemin rengiyle örter;
 * afişin üstünde bu örtü zemin renkli köşeler olarak görünürdü.
 *
 * Üye olunan ortamda kartın tamamı bağlantıdır; üye olmayanda katılma yalnız açık "Katıl" düğmesiyle
 * (yanlışlıkla katılma olmasın). `adultsOnly` rozeti bilgilendirmedir, kapı DEĞİL: minör süzmesi sunucuda.
 */
export function DiscoverGuildCard({ guild, isMember, joining, disabled, onJoin, onGo }: Props) {
  const locked = disabled || joining;
  const reduceMotion = useReduceMotion();
  const bannerSrc = animatedOrStatic(guild.bannerUrl, guild.bannerAnimatedUrl, reduceMotion);
  const [from, to] = bannerColors(guild.bannerColor);

  return (
    <Pressable
      style={styles.card}
      onPress={isMember ? onGo : undefined}
      disabled={!isMember}
      accessibilityRole={isMember ? 'link' : undefined}
    >
      {bannerSrc ? (
        <Image source={{ uri: bannerSrc }} style={styles.banner} resizeMode="cover" />
      ) : (
        <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner} />
      )}

      <View style={styles.body}>
        <View style={styles.headRow}>
          <HexGuildIcon
            size={SIZE}
            name={guild.name}
            iconUrl={guild.iconUrl}
            iconAnimatedUrl={guild.iconAnimatedUrl}
            backgroundColor={theme.colors.bgElevated}
            fallbackText={initials(guild.name)}
          />
          {/* minWidth: 0 → uzun ad Katıl düğmesini dışarı itmesin (320dp'de taşma olmaz). */}
          <View style={styles.headText}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {guild.name}
              </Text>
              {guild.adultsOnly && (
                <View style={styles.adultsBadge}>
                  <Text style={styles.adultsBadgeText}>{t('invite.adultsOnlyBadge')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {t('discover.memberCount', { count: guild.memberCount })}
            </Text>
          </View>
          {!isMember && (
            <Pressable onPress={onJoin} disabled={locked} style={[styles.button, locked && styles.buttonDisabled]}>
              {joining ? (
                <ActivityIndicator color={theme.colors.textPrimary} />
              ) : (
                <Text style={styles.buttonText}>{t('discover.join')}</Text>
              )}
            </Pressable>
          )}
        </View>

        {guild.description ? (
          <Text style={styles.desc} numberOfLines={3}>
            {guild.description}
          </Text>
        ) : null}

        {guild.tags.length > 0 && (
          <View style={styles.tags}>
            {guild.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  // Ortam afişi 2:1 (C19: GUILD_BANNER 1200x600 / 640x320).
  banner: { width: '100%', aspectRatio: 2 },
  body: { padding: 12, gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  desc: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgContent,
  },
  tagText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  adultsBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.danger,
  },
  adultsBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  button: {
    minWidth: 64,
    minHeight: theme.layout.control + 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
});
