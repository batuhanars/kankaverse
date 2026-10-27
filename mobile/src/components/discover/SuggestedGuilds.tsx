import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { discoveryApi, type DiscoveryGuildDto } from '@/api/discovery';
import { DiscoverGuildCard } from './DiscoverGuildCard';
import { useDiscoveryJoin } from './useDiscoveryJoin';
import { t } from '@/i18n';
import { theme } from '@/theme';

const SUGGESTION_COUNT = 3;

/**
 * Sprint C18 §1 — ortamı olmayan kullanıcının ana ekranındaki öneri bloğu: Keşfet listesinin ilk 3'ü
 * (sunucu üye sayısına göre sıralıyor). Çağıran yalnız "ortamı yok" iken render eder.
 *
 * Otomatik katılma YOK: kullanıcı kendisi "Katıl"a basar. Liste boş ya da yüklenemezse blok HİÇ
 * çizilmez (boş iskele yok; Keşfet'e giden yol AddGuildSheet'te duruyor).
 */
export function SuggestedGuilds() {
  const router = useRouter();
  const { joiningId, error, join } = useDiscoveryJoin();
  const [items, setItems] = useState<DiscoveryGuildDto[]>([]);

  useEffect(() => {
    discoveryApi
      .listGuilds()
      .then((res) => setItems(res.items.slice(0, SUGGESTION_COUNT)))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('home.suggestedTitle')}</Text>
        <Pressable onPress={() => router.push('/discover')} hitSlop={8}>
          <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
        </Pressable>
      </View>
      {items.map((g) => (
        <DiscoverGuildCard
          key={g.id}
          guild={g}
          isMember={false}
          joining={joiningId === g.id}
          disabled={joiningId !== null}
          onJoin={() => void join(g.id)}
          onGo={() => {}}
        />
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: theme.layout.panelGap,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  seeAll: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
});
