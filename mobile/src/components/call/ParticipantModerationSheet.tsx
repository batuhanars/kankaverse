import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  username: string;
  avatarUrl: string | null;
  /** MUTE_MEMBERS — yoksa Sustur/Susturmayı Kaldır + Yayını Durdur satırları HİÇ render edilmez. */
  canMute: boolean;
  /** MOVE_MEMBERS — yoksa Taşı + Odadan Çıkar satırları HİÇ render edilmez. */
  canMove: boolean;
  /**
   * Sprint M4h §3 🔴 — bu değer çağıran taraftan (`ParticipantModerationHost`) render anında gelir;
   * `onToggleMute` tetiklendiğinde Host bu prop'u kendi closure'ında ZATEN yakalamış olur (kontrat
   * §3'ün "eylem tetiklenmeden önce okunur" kuralı — bkz. Host'taki yorum).
   */
  isServerMuted: boolean;
  /** Yalnız hedefin kamerası gerçekten yayınlıyorsa true — bkz. Host'taki tanım notu. */
  isBroadcasting: boolean;
  onClose: () => void;
  onToggleMute: () => void;
  onStopBroadcast: () => void;
  onMove: () => void;
  onDisconnect: () => void;
}

/**
 * Sprint M4h — arama ekranında katılımcıya dokununca açılan moderasyon paneli.
 *
 * Görsel kabuk `ChannelMenuSheet`/`MessageActionSheet` ile aynı (`Modal` + karartılmış perde + alt
 * panel + `sheetInsets` gezinme çubuğu payı) — yeni bir sheet altyapısı YAZILMADI (kontrat §1).
 *
 * Bu bileşen SAF SUNUM: hangi satırların göründüğü (`canMute`/`canMove`) ve eylemlerin gerçek
 * mantığı (uç çağırma, hata gösterimi, D53 tuzağının önlenmesi) `ParticipantModerationHost`ta —
 * `DmMoreHost`/`DmMoreSheet` ayrımının aynısı.
 */
export function ParticipantModerationSheet({
  visible,
  username,
  avatarUrl,
  canMute,
  canMove,
  isServerMuted,
  isBroadcasting,
  onClose,
  onToggleMute,
  onStopBroadcast,
  onMove,
  onDisconnect,
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
            <View style={styles.titleRow}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{username.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.title} numberOfLines={1}>
                {username}
              </Text>
            </View>

            {canMute && (
              <View style={styles.group}>
                <Pressable style={styles.option} onPress={onToggleMute}>
                  <Ionicons
                    name={isServerMuted ? 'volume-high-outline' : 'volume-mute-outline'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.optionText}>
                    {isServerMuted ? t('voice.serverUnmute') : t('voice.serverMute')}
                  </Text>
                </Pressable>
                {isBroadcasting && (
                  <>
                    <View style={styles.divider} />
                    <Pressable style={styles.option} onPress={onStopBroadcast}>
                      <Ionicons name="videocam-off-outline" size={20} color={theme.colors.textSecondary} />
                      <Text style={styles.optionText}>{t('voice.stopBroadcast')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}

            {canMove && (
              <View style={styles.group}>
                <Pressable style={styles.option} onPress={onMove}>
                  <Ionicons name="arrow-redo-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.optionText}>{t('voice.moveTo')}</Text>
                </Pressable>
                <View style={styles.divider} />
                <Pressable style={styles.option} onPress={onDisconnect}>
                  <Ionicons name="exit-outline" size={20} color={theme.colors.danger} />
                  <Text style={[styles.optionText, styles.optionTextDanger]}>
                    {t('voice.disconnectUser')}
                  </Text>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
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
  optionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '500',
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
