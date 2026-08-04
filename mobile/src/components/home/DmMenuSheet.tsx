import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sheetBottomPadding, useSheetInsets } from './sheetInsets';
import { muteUntilLabel } from '@/utils/notifPrefUi';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1d-C §2.3 — DM satırına uzun basınca açılan panel.
 *
 * Varlık sebebi: DM başlığının sağ üstü **tamamen boşaltıldı** (sahip kararı 2026-08-01 — orası
 * sesli/görüntülü aramaya ayrıldı). Oradaki aksiyonlar kaybolmadı, buraya taşındı.
 *
 * 🔴 KONMAYANLAR (Discord'da var, bizde YOK): Favori (yok) · Kanal ID'sini Kopyala (geliştirici modu
 * yok) · "DM'yi Kapat" (bizdeki karşılığı "Sohbeti Temizle" — aynı işe iki ad konmaz).
 *
 * Sprint M2b §4.1 — **Konuşmayı Sustur** (süre seçenekli) + **Bildirim Ayarları** eklendi (backend
 * R12 modülü artık bağlı). Hedef her zaman `targetType: 'CHANNEL', targetId: <dm channelId>` — grup
 * DM'de de aynı (DM'ler `guildId: null` ile `Channel` tablosunda yaşıyor, ayrı bir tür yok).
 *
 * 🔴 **Okunmuş İşaretle satırı: yetki değil DURUM kuralı.** Okunmamış yokken satır GİZLENMEZ,
 * soluk ve pasif gösterilir. Ayrım M1d-B'de kayda geçti: "yetkisiz aksiyon hiç render edilmez"
 * kuralı YETKİ hakkındadır ("bunu yapamazsın" gürültüdür); bu ise durum bilgisidir ve kullanıcıya
 * lazımdır — gizlersek okunmamışı olup olmadığını anlayamaz.
 */
interface Props {
  visible: boolean;
  title: string;
  /** Okunmamış mesaj var mı — yoksa "Okunmuş İşaretle" soluk + pasif. */
  hasUnread: boolean;
  /** 1-1 DM'de karşı taraf kanka değilse "Kanka Ekle" gösterilir. Grup DM'de asla.
   *  Kararı çağıran verir (`DmMenuHost` — kanka mı / engelledim mi / istek gitti mi, §4). */
  canAddFriend: boolean;
  /** Bu DM'in KENDİ sustur kaydı (fallback yok — DM'in bağlı olduğu bir ortam yok). */
  muted: boolean;
  mutedUntil: string | null;
  onClose: () => void;
  /** M3b §2.1 — ilk satır artık **DM detay ekranına** gider (eskiden sohbeti açıyordu; sohbet zaten
   *  satıra kısa dokunuşla açılıyor, ikinci kapı gereksizdi). */
  onDetails: () => void;
  onAddFriend: () => void;
  onMarkRead: () => void;
  onClear: () => void;
  /** Susturulmuşsa tek dokunuşla açar (web `MuteDurationFlyout` deseni); değilse süre seçici açılır
   *  — karar burada değil, çağıranda (`muted` zaten prop olarak elde). */
  onMutePress: (currentlyMuted: boolean) => void;
  onLevelPress: () => void;
}

export function DmMenuSheet({
  visible,
  title,
  hasUnread,
  canAddFriend,
  muted,
  mutedUntil,
  onClose,
  onDetails,
  onAddFriend,
  onMarkRead,
  onClear,
  onMutePress,
  onLevelPress,
}: Props) {
  const bottomInset = useSheetInsets();

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />

          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>

            <View style={styles.group}>
              <Pressable style={styles.option} onPress={onDetails}>
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
                {/* M3b §2.1 — satır "Profil" değil artık: hedef DM detay ekranı. Profil, mesaj
                    yazarına dokununca açılan alt-panel (§3.1). */}
                <Text style={styles.optionText}>{t('mobile.dmDetails.menuRow')}</Text>
              </Pressable>
              {canAddFriend && (
                <Pressable style={styles.option} onPress={onAddFriend}>
                  <Ionicons name="person-add-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.optionText}>{t('friends.add')}</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.group}>
              <Pressable style={styles.option} onPress={onMarkRead} disabled={!hasUnread}>
                <Ionicons
                  name="eye-outline"
                  size={20}
                  color={hasUnread ? theme.colors.textSecondary : theme.colors.textMuted}
                />
                <Text style={[styles.optionText, !hasUnread && styles.optionTextDisabled]}>
                  {t('guildMenu.markRead')}
                </Text>
              </Pressable>
            </View>

            {/* Sprint M2b §4.1 — Konuşmayı Sustur + Bildirim Ayarları, ayrı grup. */}
            <View style={styles.group}>
              <Pressable style={styles.option} onPress={() => onMutePress(muted)}>
                <Ionicons
                  name={muted ? 'volume-high-outline' : 'volume-mute-outline'}
                  size={20}
                  color={theme.colors.textSecondary}
                />
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionText}>
                    {muted ? t('mobile.notif.unmute') : t('mobile.dm.muteLabel')}
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

            {/* Yıkıcı işlem: onayı çağıran verir (ConfirmDialog), panel yalnız niyeti iletir. */}
            <View style={styles.group}>
              <Pressable style={styles.option} onPress={onClear}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                <Text style={[styles.optionText, styles.optionTextDanger]}>
                  {t('dm.clearConversation')}
                </Text>
              </Pressable>
            </View>
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
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    marginBottom: 4,
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
  // Sustur bitiş etiketi ("{tarih} tarihine kadar") — ana metnin altında, soluk.
  optionSubtext: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  optionTextDisabled: {
    color: theme.colors.textMuted,
  },
  optionTextDanger: {
    color: theme.colors.danger,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: theme.colors.borderStrong,
  },
});
