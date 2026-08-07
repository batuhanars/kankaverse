import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { ClipPath, Defs, Image as SvgImage, Polygon, Text as SvgText } from 'react-native-svg';
import { hexPoints } from '../hexShape';
import { sheetBottomPadding, useSheetInsets } from './sheetInsets';
import { muteUntilLabel } from '@/utils/notifPrefUi';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M2b §4.2 R1-2 — sahip cihazda "çok küçük" buldu (22px, `xl` başlıkla optik dengesiz
// duruyordu); 36px'e büyütüldü — `GuildMenuSheet` başlığındaki 64px'lik büyük ikondan küçük ama
// satır içinde kanal adıyla (fontSize.xl = 18) dengeli bir yardımcı ikon boyutu.
const GUILD_ICON_SIZE = 36;
const GUILD_ICON_POINTS = hexPoints(GUILD_ICON_SIZE);

interface Props {
  visible: boolean;
  /** `#` ön eki burada eklenir; çağıran ham adı geçer. */
  channelName: string;
  /**
   * PM takibi (2026-08-07) — ses kanalının mesajı yok: "Okundu İşaretle" o kanal için anlamsız
   * (tıklayınca hiçbir görünür şey olmuyor, kullanıcı bir eylem gerçekleştiğini sanıyor — boş
   * yüzey). Yalnız o maddeyi gizler; sustur/bildirim/düzenle etkilenmez.
   */
  isVoice: boolean;
  /** Sprint M2b §4.2 — başlığın SOLUNA çizilen ortam ikonu (hangi ortama ait olduğu belirsizdi). */
  guildId: string;
  guildName: string;
  guildIconUrl?: string | null;
  onClose: () => void;
  onMarkRead: () => void;
  onEdit: () => void;
  /**
   * Sprint M2a §4.5 — panel artık HER üyeye açılıyor (okundu işaretlemek yetki işi değil);
   * yönetim maddesi ("Kanalı Düzenle") YALNIZ bu true iken render edilir (disabled gösterilmez —
   * M1b grup yönetimi deseni: yapamayacağın şeyi görmek gürültüdür).
   */
  canManage: boolean;
  /** Bu kanalın KENDİ sustur kaydı (fallback yok — buton etiketi/alt yazı yalnız kendi durumunu yansıtır). */
  muted: boolean;
  mutedUntil: string | null;
  onMutePress: (currentlyMuted: boolean) => void;
  onLevelPress: () => void;
}

/**
 * Sprint M1d-B sahip revizesi 2026-07-31 — kanal satırına uzun basınca açılan panel.
 *
 * Önce uzun basış DOĞRUDAN düzenleme ekranını açıyordu; sahip Discord'daki gibi önce bir panel
 * istedi. Doğru olan da bu: uzun basış "bu kanalla ne yapabilirim" sorusudur, tek bir işleme
 * atlamak o soruyu cevapsız bırakır.
 *
 * 🔴 KONMAYANLAR (Discord'da var, bizde YOK): Favori · Bağlantıyı Kopyala (mobilde kanal derin
 * bağlantısı yok) · Kanalı Çoğalt (uç yok) · Kanal ID'sini Kopyala (geliştirici modu bizde yok) ·
 * Davet et (ortam düzeyinde, ortam panelinde duruyor — ikinci kapı açılmadı).
 *
 * Sprint M2b §4.2 — **Kanalı Sustur + Bildirim Ayarları** eklendi (backend R12 modülü artık bağlı).
 *
 * **Silme burada YOK:** düzenleme ekranının altında duruyor. Yıkıcı işlemi bir dokunuş daha derinde
 * tutmak bilinçli; uzun basıştan tek dokunuşla silme yanlış dokunmaya davetiye olurdu.
 *
 * Sprint M2a §4.5 — panel artık HERKESE açılıyor (önceden yalnız `canManage`'e). "Okundu
 * İşaretle" yetki işi değil; "Kanalı Düzenle" yönetim maddesi olarak KALIR, `canManage` ile koşullu.
 * Sustur/Bildirim maddeleri de her üyeye açık (§4.2 — kendi bildirimini kapatmak yetki işi değil).
 */
export function ChannelMenuSheet({
  visible,
  channelName,
  isVoice,
  guildId,
  guildName,
  guildIconUrl,
  onClose,
  onMarkRead,
  onEdit,
  canManage,
  muted,
  mutedUntil,
  onMutePress,
  onLevelPress,
}: Props) {
  const bottomInset = useSheetInsets();
  const guildFallbackLetter = guildName.charAt(0).toUpperCase();
  // clipId guild.id'ye bağlı — iki ortamın adı aynı harfle başlarsa DOM'da çakışma olmasın
  // (GuildRailItem'daki aynı düzeltmenin emsali).
  const clipId = `hexClip-channelMenu-${guildId}`;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />

          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Svg width={GUILD_ICON_SIZE} height={GUILD_ICON_SIZE} viewBox={`0 0 ${GUILD_ICON_SIZE} ${GUILD_ICON_SIZE}`}>
                <Defs>
                  <ClipPath id={clipId}>
                    <Polygon points={GUILD_ICON_POINTS} />
                  </ClipPath>
                </Defs>
                <Polygon points={GUILD_ICON_POINTS} fill={theme.colors.accentSubtle} />
                <SvgText
                  x={GUILD_ICON_SIZE / 2}
                  y={GUILD_ICON_SIZE / 2}
                  textAnchor="middle"
                  alignmentBaseline="central"
                  fontSize={theme.fontSize.md}
                  fontWeight="700"
                  fill={theme.colors.accent500}
                >
                  {guildFallbackLetter}
                </SvgText>
                {guildIconUrl ? (
                  <SvgImage
                    href={{ uri: guildIconUrl }}
                    x={0}
                    y={0}
                    width={GUILD_ICON_SIZE}
                    height={GUILD_ICON_SIZE}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#${clipId})`}
                  />
                ) : null}
              </Svg>
              <Text style={styles.title} numberOfLines={1}>
                #{channelName}
              </Text>
            </View>

            {/* PM takibi (2026-08-07) — ses kanalında mesaj/okunmamış kavramı yok, madde tamamen
                kaldırılır (gri/disabled DEĞİL — "yapamayacağın şey" değil "anlamı olmayan şey"). */}
            {!isVoice && (
              <View style={styles.group}>
                <Pressable style={styles.option} onPress={onMarkRead}>
                  <Ionicons name="eye-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.optionText}>{t('guildMenu.markRead')}</Text>
                </Pressable>
              </View>
            )}

            {/* Sprint M2b §4.2 — Sustur + Bildirim Ayarları, her üyeye açık. */}
            <View style={styles.group}>
              <Pressable style={styles.option} onPress={() => onMutePress(muted)}>
                <Ionicons
                  name={muted ? 'volume-high-outline' : 'volume-mute-outline'}
                  size={20}
                  color={theme.colors.textSecondary}
                />
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionText}>
                    {muted ? t('mobile.notif.unmute') : t('channelMenu.mute')}
                  </Text>
                  {muted && <Text style={styles.optionSubtext}>{muteUntilLabel(mutedUntil)}</Text>}
                </View>
              </Pressable>
              <View style={styles.divider} />
              <Pressable style={styles.option} onPress={onLevelPress}>
                <Ionicons name="notifications-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.optionText}>{t('guildMenu.notifications')}</Text>
              </Pressable>
            </View>

            {canManage && (
              <View style={styles.group}>
                <Pressable style={styles.option} onPress={onEdit}>
                  <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.optionText}>{t('channel.editTitle')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 12,
    gap: 12,
  },
  // Sprint M2b §4.2 — ortam ikonu + başlık aynı satırda.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  title: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  group: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  optionTextWrap: { flex: 1, minWidth: 0 },
  optionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '500',
  },
  optionSubtext: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: theme.colors.borderStrong,
  },
});
