import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { discoveryApi, type DiscoveryGuildDto } from '@/api/discovery';
import { DiscoverGuildCard } from './DiscoverGuildCard';
import { useDiscoveryJoin } from './useDiscoveryJoin';
import { t } from '@/i18n';
import { theme } from '@/theme';

const SUGGESTION_COUNT = 3;
const CARD_GAP = 10;
// Kart, panelin %85'i: sağda bir sonraki kartın kenarı görünür, kaydırılabildiği anlaşılır.
const CARD_RATIO = 0.85;

/**
 * Sprint C18 §1 — ortamı olmayan kullanıcının ana ekranındaki öneri bloğu: Keşfet listesinin ilk 3'ü
 * (sunucu üye sayısına göre sıralıyor). Çağıran yalnız "ortamı yok" iken render eder.
 *
 * Otomatik katılma YOK: kullanıcı kendisi "Katıl"a basar. Liste boş ya da yüklenemezse blok HİÇ
 * çizilmez (boş iskele yok; Keşfet'e giden yol rayda pusula).
 *
 * Kartlar YATAY kayar (sahip kararı 2026-10-27): tek sütun tombul kart alt alta dizilince DM listesini
 * ekranın altına itiyordu.
 */
export function SuggestedGuilds() {
  const router = useRouter();
  const { joiningId, error, join } = useDiscoveryJoin();
  const [items, setItems] = useState<DiscoveryGuildDto[]>([]);
  // DM paneli = ekran - ray; kart genişliği ondan türetilir (tek kartsa tam genişlik).
  const { width } = useWindowDimensions();
  const panelInner = width - theme.layout.railWidth - theme.layout.panelGap * 2;
  const cardWidth = items.length > 1 ? Math.round(panelInner * CARD_RATIO) : panelInner;

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + CARD_GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
        style={styles.strip}
      >
        {items.map((g) => (
          <View key={g.id} style={{ width: cardWidth }}>
            <DiscoverGuildCard
              guild={g}
              isMember={false}
              joining={joiningId === g.id}
              disabled={joiningId !== null}
              onJoin={() => void join(g.id)}
              onGo={() => {}}
            />
          </View>
        ))}
      </ScrollView>
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
  // Kaydırma alanı panel kenarına kadar uzar; içerik yine panel boşluğuyla başlar.
  strip: { marginHorizontal: -theme.layout.panelGap },
  row: { paddingHorizontal: theme.layout.panelGap, gap: CARD_GAP },
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
