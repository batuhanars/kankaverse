import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M4t §2 — C7 §E2 kamera uyarısının mobil karşılığı. Referans: web
 * `useVoiceNudge.ts` + `CameraNudgeModal.vue`. Kural birebir taşındı, kod taşınmadı: yalnız
 * genel/açık ortam ses kanalında (kapı `call.tsx`te kurulu, burası yalnız çizer), kanal başına
 * BİR KEZ.
 *
 * Hatırlama BURADA: modül değişkeni `Set<channelId>` — web'in sessionStorage'ının mobil
 * karşılığı (uygulama tamamen kapanınca sıfırlanır). Kalıcı saklama (AsyncStorage/SecureStore)
 * BİLİNÇLİ OLARAK yok — C7 §E4 "sunucu-taraf tercih saklama YAGNI" kararı mobilde de geçerli.
 */
const shownChannels = new Set<string>();

export function shouldShowCameraNudge(isGeneralVoiceChannel: boolean, channelId: string | null): boolean {
  if (!isGeneralVoiceChannel || !channelId) return false;
  return !shownChannels.has(channelId);
}

export function markCameraNudgeShown(channelId: string | null): void {
  if (channelId) shownChannels.add(channelId);
}

export function CameraNudgeModal({
  visible,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  /** Kullanıcı "Kamerayı Aç" dedi → çağıran taraf hatırlar (`markCameraNudgeShown`) VE kamerayı açar. */
  onConfirm: () => void;
  /** Vazgeç / backdrop — yalnız kapat, hatırlama YOK (bir dahaki açılışta yine sorulur). */
  onClose: () => void;
}) {
  // 🔴 Kapalıyken `Modal` HİÇ kurulmaz (OutputPickerSheet dersi, sahip cihaz turu 2026-08-06):
  // sürekli kurulu duran bir Modal, sahne sökülürken Fabric'in "child already has a parent"
  // çökme sınıfını besliyor.
  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.accentBar} />
          <View style={styles.body}>
            <View style={styles.headerRow}>
              <View style={styles.iconWrap}>
                <Ionicons name="videocam-outline" size={20} color={theme.colors.accent500} />
              </View>
              <Text style={styles.title}>{t('voice.nudge.cameraTitle')}</Text>
            </View>
            <Text style={styles.bodyText}>{t('voice.nudge.cameraBody')}</Text>
            <Pressable style={styles.confirmButton} onPress={onConfirm} accessibilityRole="button">
              <Text style={styles.confirmText}>{t('voice.nudge.cameraConfirm')}</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelText}>{t('voice.nudge.cameraCancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.bgOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.layout.panelGap,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    backgroundColor: theme.colors.accent500,
  },
  body: {
    padding: theme.layout.panelGap,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentSubtle,
  },
  title: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  bodyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    lineHeight: 20,
    marginBottom: 20,
  },
  confirmButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  confirmText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  cancelButton: {
    minHeight: theme.layout.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
});
