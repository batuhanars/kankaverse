import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { ClipPath, Defs, Image as SvgImage, Polygon } from 'react-native-svg';
import type { GuildSummaryDto } from '@/api/guilds';
import { t } from '@/i18n';
import { theme } from '@/theme';

export type RailSelection = { type: 'dm' } | { type: 'guild'; id: string };

interface Props {
  selection: RailSelection;
  guilds: GuildSummaryDto[];
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  onSelectDm: () => void;
  onSelectGuild: (id: string) => void;
}

const SIZE = 48;

// design-tokens.md §3 "Şekil & Boşluk" — imza öğesi altıgen, web ServerRail.vue ile birebir aynı
// clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%). react-native-svg'de
// clip-path CSS'i yok, aynı 6 nokta 48x48 viewBox'a taşınır. Kullanıcı avatarları (DmSidebar) daire
// KALIR — bu yalnız ortam ikonları için (design-tokens.md: "kullanıcı avatarları daire kalır").
const HEX_POINTS = `${SIZE * 0.5},0 ${SIZE},${SIZE * 0.25} ${SIZE},${SIZE * 0.75} ${SIZE * 0.5},${SIZE} 0,${SIZE * 0.75} 0,${SIZE * 0.25}`;

function HexGuildIcon({ iconUrl, fallbackLetter, active }: { iconUrl: string | null; fallbackLetter: string; active: boolean }) {
  const clipId = `hexClip-${fallbackLetter}`;
  return (
    <View style={styles.hexWrap}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Defs>
          <ClipPath id={clipId}>
            <Polygon points={HEX_POINTS} />
          </ClipPath>
        </Defs>
        {iconUrl ? (
          <SvgImage
            href={{ uri: iconUrl }}
            x={0}
            y={0}
            width={SIZE}
            height={SIZE}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        ) : (
          <Polygon points={HEX_POINTS} fill={theme.colors.accentSubtle} />
        )}
        {/* Web'in sol-kenar pil'i yerine hex kenarına doğrudan aktif vurgusu — mobilde rail dar,
            ayrı bir pil için yer yok; aynı görsel dili (accent500) hex silüetine uygulanmış hâli. */}
        <Polygon points={HEX_POINTS} fill="none" stroke={active ? theme.colors.accent500 : 'transparent'} strokeWidth={2} />
      </Svg>
      {!iconUrl && (
        <View pointerEvents="none" style={styles.hexFallbackTextWrap}>
          <Text style={styles.iconFallbackText}>{fallbackLetter}</Text>
        </View>
      )}
    </View>
  );
}

// Sprint M1a contract §2 — rail + sidebar gezinme mimarisi, kalıcı rail. M0'ın "Ortamların" tam-
// ekranı kaldırıldı; ortam ikonları buraya taşındı. react-native-svg PM onaylı bağımlılık (dördüncü
// PM düzeltmesi) — ortam ikonları artık gerçek altıgen maske ile çiziliyor (bkz. HexGuildIcon).
export function GuildRail({ selection, guilds, state, onRetry, onSelectDm, onSelectGuild }: Props) {
  return (
    // Sabit genişlik SARAN View'da tutulur, ScrollView'a değil — ScrollView'ın kendi `style`ına
    // verilen `width`, flex-row ebeveyn içinde çapraz eksende (yatay) güvenilir uygulanmıyor
    // (PM ölçümü: ray 72dp yerine 242dp çıktı, ScrollView içeriği kendi genişliğine göre
    // büyümüş görünüyor). Dış View genişliği kilitler, ScrollView içeride yalnız flex:1 ile doldurur.
    <View style={styles.rail}>
      <ScrollView style={styles.railScroll} contentContainerStyle={styles.railContent}>
        {/* Sözleşme §8.1-A/2 — baş harf ("M") yerine konuşma baloncuğu. Ortam ikonları altıgen
            KALIR (HexGuildIcon); baloncuk yalnız bu girişte, ray'in en üstünde. Aynı ikon seti
            alt tab çubuğuyla (Ionicons) ortak — ikinci bir ikon dili girmiyor. */}
        <Pressable
          onPress={onSelectDm}
          style={[styles.icon, styles.dmIcon, selection.type === 'dm' && styles.iconActive]}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.home.dmEntry')}
        >
          <Ionicons
            name={selection.type === 'dm' ? 'chatbubble' : 'chatbubble-outline'}
            size={22}
            color={selection.type === 'dm' ? theme.colors.accent500 : theme.colors.textSecondary}
          />
        </Pressable>

        {state === 'loading' && <ActivityIndicator color={theme.colors.textMuted} style={styles.railSpinner} />}

        {/* Rail dar (72px) — tam metin hata yerine kompakt "tekrar dene" (contract: her listede hata+tekrar dene zorunlu). */}
        {state === 'error' && (
          <Pressable onPress={onRetry} style={styles.retryIcon} accessibilityLabel={t('common.retry')}>
            <Text style={styles.retryIconText}>↻</Text>
          </Pressable>
        )}

        {guilds.map((g) => {
          const active = selection.type === 'guild' && selection.id === g.id;
          return (
            <Pressable key={g.id} onPress={() => onSelectGuild(g.id)}>
              <HexGuildIcon iconUrl={g.iconUrl} fallbackLetter={g.name.charAt(0).toUpperCase()} active={active} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: theme.layout.railWidth,
    backgroundColor: theme.colors.bgRail,
  },
  railScroll: {
    flex: 1,
  },
  railContent: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  railSpinner: {
    marginVertical: 4,
  },
  retryIcon: {
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryIconText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xl,
  },
  icon: {
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  iconActive: {
    borderWidth: 2,
    borderColor: theme.colors.accent500,
  },
  hexWrap: {
    width: SIZE,
    height: SIZE,
  },
  hexFallbackTextWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  dmIcon: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
