import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GameActivity } from '@/stores/activity';
import { formatElapsed } from '@/utils/formatElapsed';
import { t } from '@/i18n';
import { theme } from '@/theme';

const LOGO = 40;

/** C31e: oyun başlangıcından beri geçen süre, saniyede bir tazelenir; bileşen kalkınca zamanlayıcı temizlenir. */
function useElapsed(startedAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? formatElapsed(now - new Date(startedAt).getTime()) : null;
}

/** Profil panelindeki "Oynuyor" kartı: logo + ad + yeşil kol simgesi ve canlı süre, Steam'de mağaza bağlantısı. */
export function ProfileGameCard({ game }: { game: GameActivity }) {
  const elapsed = useElapsed(game.startedAt);
  const { storeUrl } = game;
  return (
    <View style={styles.card}>
      {game.iconUrl ? (
        <Image source={{ uri: game.iconUrl }} style={styles.logo} />
      ) : (
        <View style={[styles.logo, styles.logoFallback]}>
          <Ionicons name="game-controller" size={32} color={theme.colors.textSecondary} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.label}>{t('profile.activity.playing')}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {game.name}
        </Text>
        {elapsed ? (
          <View style={styles.timeRow}>
            <Ionicons name="game-controller" size={14} color={theme.colors.online} />
            <Text style={styles.time}>{elapsed}</Text>
          </View>
        ) : null}
        {storeUrl ? (
          <Pressable
            onPress={() => void Linking.openURL(storeUrl)}
            style={styles.storeButton}
            accessibilityRole="link"
          >
            <Text style={styles.storeText}>{t('profile.activity.viewOnSteam')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  logo: { width: LOGO, height: LOGO, borderRadius: theme.radius.sm },
  logoFallback: {
    backgroundColor: theme.colors.bgSidebar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0 },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: { color: theme.colors.textPrimary, fontSize: theme.fontSize.md, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  time: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, fontVariant: ['tabular-nums'] },
  storeButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgSidebar,
  },
  storeText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, fontWeight: '600' },
});
