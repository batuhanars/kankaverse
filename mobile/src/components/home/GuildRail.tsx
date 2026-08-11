import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon } from 'react-native-svg';
import type { GuildSummaryDto } from '@/api/guilds';
import { hexPoints } from '../hexShape';
import { GuildRailItem } from './GuildRailItem';
import { useDmUnreadCount } from '@/stores/unread';
import { badgeLabel } from '@/utils/badgeLabel';
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
  /** Sprint M5c §4 — ortam ikonuna uzun basınca `GuildMenuSheet` açılır. Kısa basış (`onSelectGuild`)
   *  DEĞİŞMEDİ; bu ayrı bir eylem. */
  onLongPressGuild: (id: string) => void;
  /** Sprint M1d §3 — ray "+" girişi: tek dokunuş → "Ortama Katıl" / "Ortam Kur" seçimi. */
  onAddGuild: () => void;
}

const SIZE = 48;

// design-tokens.md §3 "Şekil & Boşluk" — imza öğesi altıgen, web ServerRail.vue ile birebir aynı
// silüet. Noktalar `components/hexShape.ts`'ten gelir (davetiye kartı da aynı şekli çiziyor);
// kullanıcı avatarları (DmSidebar) DAİRE kalır, bu yalnız ortam görselleri için.
const HEX_POINTS = hexPoints(SIZE);

// Sprint M1a contract §2 — rail + sidebar gezinme mimarisi, kalıcı rail. M0'ın "Ortamların" tam-
// ekranı kaldırıldı; ortam ikonları buraya taşındı. react-native-svg PM onaylı bağımlılık (dördüncü
// PM düzeltmesi) — ortam ikonları artık gerçek altıgen maske ile çiziliyor (bkz. GuildRailItem).
export function GuildRail({
  selection,
  guilds,
  state,
  onRetry,
  onSelectDm,
  onSelectGuild,
  onLongPressGuild,
  onAddGuild,
}: Props) {
  // Sprint M2b §10 R3-1 — sahip kararı: rail'in DM girişi bir ortam değil, oradan gelen HER mesaj
  // bahsetme muamelesi görür. Eski beyaz "en az bir okunmamış var mı" pip'i KALDIRILDI, yerine
  // `useTotalPing`in kullandığı AYNI sayı (`useDmUnreadCount`) kırmızı rozette gösterilir.
  const dmUnreadCount = useDmUnreadCount();
  return (
    // Sabit genişlik SARAN View'da tutulur, ScrollView'a değil — ScrollView'ın kendi `style`ına
    // verilen `width`, flex-row ebeveyn içinde çapraz eksende (yatay) güvenilir uygulanmıyor
    // (PM ölçümü: ray 72dp yerine 242dp çıktı, ScrollView içeriği kendi genişliğine göre
    // büyümüş görünüyor). Dış View genişliği kilitler, ScrollView içeride yalnız flex:1 ile doldurur.
    <View style={styles.rail}>
      <ScrollView style={styles.railScroll} contentContainerStyle={styles.railContent}>
        {/* Sözleşme §8.1-A/2 — baş harf ("M") yerine konuşma baloncuğu. Ortam ikonları altıgen
            KALIR (GuildRailItem); baloncuk yalnız bu girişte, ray'in en üstünde. Aynı ikon seti
            alt tab çubuğuyla (Ionicons) ortak — ikinci bir ikon dili girmiyor. */}
        <Pressable
          onPress={onSelectDm}
          style={[styles.icon, styles.dmIcon, selection.type === 'dm' && styles.iconActive]}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.home.dmEntry')}
        >
          {/* Sprint M2b §10 R3-1 — kırmızı bahsetme rozeti (GuildRailItem'ın `mentionBadge`iyle
              AYNI görsel dil): DM bir ortam değil, oradan gelen her okunmamış mesaj bahsetme
              muamelesi görür. Sıfırsa hiç çizilmez; susturulmuş/`NONE` DM'ler zaten sayılmıyor
              (`useDmUnreadCount`). */}
          {dmUnreadCount > 0 && (
            <View style={styles.dmBadge}>
              <Text style={styles.dmBadgeText}>{badgeLabel(dmUnreadCount)}</Text>
            </View>
          )}
          {/* 🔴 İkon ADI iki durumda da AYNI; yalnız RENK değişiyor (sahip bulgusu 2026-08-01:
              ortam seçiliyken kutu tamamen boş kalıyordu — sönük değil, hiç çizilmiyordu).
              Ad `chatbubble` ↔ `chatbubble-outline` arasında takas ediliyordu ve iki durum
              arasındaki TEK değişen girdi buydu. Mekanizmayı koddan kanıtlayamadım: glif
              haritada var (61973) ve aynı `chatbubble-outline` Kanallar ekranında sorunsuz
              çiziliyor. Bu yüzden düzeltme ampirik: değişen tek girdi kaldırıldı.
              Görsel olarak da kayıp yok — aktiflik zaten Kor kenarlık + Kor renkle anlatılıyor. */}
          <Ionicons
            name="chatbubble"
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

        {guilds.map((g) => (
          <GuildRailItem
            key={g.id}
            guild={g}
            active={selection.type === 'guild' && selection.id === g.id}
            onPress={() => onSelectGuild(g.id)}
            onLongPress={() => onLongPressGuild(g.id)}
          />
        ))}

        {/* Sprint M1d — "+" ortam listesinin ALTINDA (web ServerRail'de de öyle). Tek düğme, iki
            seçenek açar; "Katıl" ve "Kur" için ayrı ayrı iki ikon konmadı — ray 72dp, ikinci düğme
            listeyi aşağı iter ve seçim yükünü kullanıcıya her açılışta ödetir.
            Şekil ALTIGEN (sahip revizesi): ray'deki ortam ikonlarıyla aynı dil. Ortam olmadığını
            zemin tonu ve Kor artı ayırt ettiriyor, ayrı bir şekil gerekmiyor. */}
        <Pressable
          onPress={onAddGuild}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel={t('guild.create')}
        >
          {/* Sahip revizesi 2026-07-31 — web `ServerRail` ile aynı dil: ALTIGEN silüet, nötr
              zemin, Kor artı. Önce yuvarlak köşeli kareydi ve ray'deki altıgen ortam ikonlarının
              yanında yabancı duruyordu. Altıgen `GuildRailItem` ile AYNI `HEX_POINTS`ten çiziliyor,
              ikinci bir şekil tanımı girmiyor. */}
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Polygon points={HEX_POINTS} fill={theme.colors.bgElevated} />
          </Svg>
          <View style={styles.addIcon}>
            <Ionicons name="add" size={26} color={theme.colors.accent500} />
          </View>
        </Pressable>
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
  // 🔴 İki kritik ayrıntı (sahip bulgusu 2026-08-01, üçüncü deneme): ortam seçiliyken baloncuk
  // ikonu HİÇ çizilmiyordu — kutu (zemin) görünüyor, glif yok.
  //
  // Kuvvetli hipotez: Android'de `overflow: 'hidden'` + `borderRadius` + `backgroundColor`
  // birleşimi, kenarlık YOKKEN çocukların zeminin ALTINA çizilmesine yol açıyor (yuvarlatılmış
  // zemin ayrı bir clip/outline yoluna düşüyor). Kenarlık eklenince çizim yolu değişiyor — aktif
  // durumda `borderWidth: 2` olduğu için orada sorun görünmüyordu. Bütün kanıtlara uyan tek
  // açıklama bu: kutu var, glif yok, yalnız kenarlıksız durumda, aynı ikon başka ekranlarda temiz.
  //
  // Bu yüzden iki şey birden yapıldı: `overflow: 'hidden'` KALDIRILDI (zaten taşan bir şey yok,
  // 22px ikon 48px kutunun içinde) ve kenarlık HER İKİ durumda da duruyor, yalnız RENGİ değişiyor.
  // Yan fayda: kutu artık aktif/pasif geçişinde 2px zıplamıyor (kenarlık kutu ölçüsünü büyütüyordu).
  icon: {
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconActive: {
    borderColor: theme.colors.accent500,
  },
  dmIcon: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sprint M2b §10 R3-1 — `GuildRailItem`'ın `mentionBadge`iyle BİREBİR aynı ölçü/konum (sağ-alt,
  // 18px/min-genişlik, kor zemin) — rail'deki tüm ikonlar aynı rozet dilini paylaşır.
  dmBadge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  addButton: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Artı, altıgenin ÜSTÜNE biner (SVG içine RN ikonu koyulamaz). `pointerEvents` yok: ikon
  // dokunuşu yutmasın diye değil, zaten sarmalayan Pressable tüm alanı kaplıyor.
  addIcon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
