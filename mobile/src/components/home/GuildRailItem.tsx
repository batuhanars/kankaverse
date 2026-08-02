import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, Polygon, Text as SvgText } from 'react-native-svg';
import type { GuildSummaryDto } from '@/api/guilds';
import { hexPoints } from '../hexShape';
import { useUnreadStore } from '@/stores/unread';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { NotificationLevel } from '@/api/notifications';
import { badgeLabel } from '@/utils/badgeLabel';
import { theme } from '@/theme';

const SIZE = 48;
const HEX_POINTS = hexPoints(SIZE);
// Sprint M2b §10 R3-2 — susturulmuş ortam ikonu soluk çizilir (Discord deseni: kullanıcı susturduğunu
// unutup "neden hiçbir şey gelmiyor" diye sormasın). Web'de bir opaklık TOKENI yok (`theme` içine
// uydurulmadı — mobile/CLAUDE.md "web'de olmayan token uydurma"); bu değer, uygulamadaki "devre dışı"
// görünümü için zaten HER YERDE kullanılan aynı 0.5 (bkz. ConfirmDialog/SecurityForm/vb. `opacity: 0.5`).
const MUTED_ICON_OPACITY = 0.5;

interface Props {
  guild: GuildSummaryDto;
  active: boolean;
  onPress: () => void;
}

/**
 * Sprint M2a §4.1 — rail'deki tek ortam ikonu: hex ikon + sol pip (okunmamış/aktif) + sağ-alt
 * bahsetme rozeti. `GuildRail`'den ayrıldı (`HexGuildIcon` buraya taşındı): `useUnreadStore`
 * aboneliği yalnız BU ikonun kendi guild'ine ait olmalı — `.map()` gövdesinde hook çağırmak
 * render'dan render'a değişken sayıda hook çağrısı demektir (Rules of Hooks ihlali), bu yüzden
 * her satır kendi bileşeni (ChannelRow/CategorySection'ın aynı gerekçeyle ayrılması emsali).
 *
 * Pip/rozet ölçüleri web `ServerRail.vue` (`.pill`, `.badge` CSS) ile BİREBİR aynı (4px genişlik,
 * aktifte 40px yükseklik, unread dot 8px, rozet 18px/min-genişlik) — yalnız uçlar TAM yuvarlak
 * (radius = genişlik/2): web'de pill rail'in SOL KENARINA yapışık (yarı köşeli), mobil rail'de
 * yüzen panel deseni var (bkz. vault "Yüzen panel tasarım kararı") ve pip rail kenarına değil,
 * ikonun soluna serbestçe konuyor — o yüzden sözleşme burada "uçları yuvarlak" istedi (§4.1).
 */
export function GuildRailItem({ guild, active, onPress }: Props) {
  const unread = useUnreadStore((s) => s.guilds[guild.id]?.unread ?? 0);
  const mentions = useUnreadStore((s) => s.guilds[guild.id]?.mentions ?? 0);
  // Sprint M2b §5 R1-3 — rozet süzme: susturma TAM SESSİZLİKtir, ikisi de gizlenir. Susturulmamışken
  // beyaz pip yalnız `ALL`'da, kırmızı bahsetme rozeti yalnız `NONE`'da gizlenir (`useTotalPing` ile
  // aynı kural — sahip kararı 2026-08-02: ilk sürümde "susturulmuşta rozet kalır" yazıyordu, geri alındı).
  //
  // `muted` burada `effectiveMuted('GUILD', ...)` — GUILD hedefinde `resolvePref`'in CHANNEL→GUILD
  // fallback dalı hiç TETİKLENMEZ (yalnız `targetType === 'CHANNEL'` iken devreye girer), yani bu
  // değer HER ZAMAN ortamın KENDİ kaydını yansıtır. §10 R3-2'nin "kendi kaydıyla susturulmuşsa"
  // şartı zaten burada karşılanıyor — ikinci bir sorgu gerekmedi.
  const level = useNotificationPrefsStore((s) => s.effectiveLevel('GUILD', guild.id));
  const muted = useNotificationPrefsStore((s) => s.effectiveMuted('GUILD', guild.id));
  const showUnreadPip = level === NotificationLevel.ALL && !muted;
  const showMentionBadge = level !== NotificationLevel.NONE && !muted;
  const fallbackLetter = guild.name.charAt(0).toUpperCase();
  // 🔴 Küçük düzeltme (bu dosyaya taşınırken fark edildi): eski clipId yalnız BAŞ HARFE bağlıydı
  // (`hexClip-${fallbackLetter}`) — iki ortamın adı aynı harfle başlıyorsa (ör. "Mavi"/"Mor") aynı
  // SVG `<ClipPath id>` DOM'da tekrarlanır, tarayıcı/RN SVG bunu tanımsız bırakabilir. `guild.id`
  // eklenerek benzersizleştirildi; görsel semantik değişmedi, yalnız olası çakışma giderildi.
  const clipId = `hexClip-${guild.id}`;

  return (
    <Pressable onPress={onPress} style={styles.wrap} accessibilityRole="button" accessibilityLabel={guild.name}>
      {/* Sol pip — §4.1: aktifken dikey çubuk, pasif+okunmamışta nokta, ikisi de yoksa hiç. */}
      {active ? (
        <View style={styles.pipActive} />
      ) : unread > 0 && showUnreadPip ? (
        <View style={styles.pipUnread} />
      ) : null}

      <View style={styles.hexWrap}>
        {/* §10 R3-2 — yalnız AKTİF MUTE soluklaştırır; `NONE` seviyesi "bildirim istemiyorum"
            demektir, "bu ortamı yok say" değil, o yüzden `level`e bakılmaz, yalnız `muted`. */}
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} opacity={muted ? MUTED_ICON_OPACITY : 1}>
          <Defs>
            <ClipPath id={clipId}>
              <Polygon points={HEX_POINTS} />
            </ClipPath>
          </Defs>
          {/* Yedek katman HER ZAMAN çizilir (sahip bulgusu 2026-07-30) — bkz. GuildRail tarihçesi. */}
          <Polygon points={HEX_POINTS} fill={theme.colors.accentSubtle} />
          <SvgText
            x={SIZE / 2}
            y={SIZE / 2}
            textAnchor="middle"
            alignmentBaseline="central"
            fontSize={theme.fontSize.lg}
            fontWeight="700"
            fill={theme.colors.accent500}
          >
            {fallbackLetter}
          </SvgText>
          {guild.iconUrl ? (
            <SvgImage
              href={{ uri: guild.iconUrl }}
              x={0}
              y={0}
              width={SIZE}
              height={SIZE}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${clipId})`}
            />
          ) : null}
          <Polygon
            points={HEX_POINTS}
            fill="none"
            stroke={active ? theme.colors.accent500 : 'transparent'}
            strokeWidth={2}
          />
        </Svg>

        {/* Bahsetme rozeti — §4.1: yalnız `unreadMentionCount > 0`, sağ-altta. M2b §5 R1-3: `NONE`'da
            veya susturulmuşken gizli. */}
        {mentions > 0 && showMentionBadge && (
          <View style={styles.mentionBadge}>
            <Text style={styles.mentionBadgeText}>{badgeLabel(mentions)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    justifyContent: 'center',
  },
  hexWrap: {
    width: SIZE,
    height: SIZE,
  },
  pipActive: {
    position: 'absolute',
    left: -10,
    top: (SIZE - 40) / 2,
    width: 4,
    height: 40,
    borderRadius: 2,
    backgroundColor: theme.colors.textPrimary,
  },
  pipUnread: {
    position: 'absolute',
    left: -9,
    top: (SIZE - 8) / 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.textPrimary,
  },
  mentionBadge: {
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
  mentionBadgeText: {
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
});
