import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  /** `#` ön eki burada eklenir; çağıran ham adı geçer. */
  channelName: string;
  onClose: () => void;
  onMarkRead: () => void;
  onEdit: () => void;
}

/**
 * Sprint M1d-B sahip revizesi 2026-07-31 — kanal satırına uzun basınca açılan panel.
 *
 * Önce uzun basış DOĞRUDAN düzenleme ekranını açıyordu; sahip Discord'daki gibi önce bir panel
 * istedi. Doğru olan da bu: uzun basış "bu kanalla ne yapabilirim" sorusudur, tek bir işleme
 * atlamak o soruyu cevapsız bırakır.
 *
 * 🔴 KONMAYANLAR (Discord'da var, bizde YOK): Favori · Bağlantıyı Kopyala (mobilde kanal derin
 * bağlantısı yok) · Kanalı Sustur ve Bildirim Ayarları (kanal bildirim tercihi mobilde bağlı değil) ·
 * Kanalı Çoğalt (uç yok) · Kanal ID'sini Kopyala (geliştirici modu bizde yok) · Davet et (ortam
 * düzeyinde, ortam panelinde duruyor — ikinci kapı açılmadı).
 *
 * **Silme burada YOK:** düzenleme ekranının altında duruyor. Yıkıcı işlemi bir dokunuş daha derinde
 * tutmak bilinçli; uzun basıştan tek dokunuşla silme yanlış dokunmaya davetiye olurdu.
 */
export function ChannelMenuSheet({ visible, channelName, onClose, onMarkRead, onEdit }: Props) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />

          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={1}>
              #{channelName}
            </Text>

            <View style={styles.group}>
              <Pressable style={styles.option} onPress={onMarkRead}>
                <Ionicons name="eye-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.optionText}>{t('guildMenu.markRead')}</Text>
              </Pressable>
            </View>

            <View style={styles.group}>
              <Pressable style={styles.option} onPress={onEdit}>
                <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.optionText}>{t('channel.editTitle')}</Text>
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
    paddingBottom: 28,
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
  optionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '500',
  },
});
