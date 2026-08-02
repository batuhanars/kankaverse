import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sheetBottomPadding, useSheetInsets } from './sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  categoryName: string;
  onClose: () => void;
  onEdit: () => void;
  onCreateChannel: () => void;
  /** Sprint M2a §4.5 — kategorinin kanallarını dolaşıp okundu işaretler (web `useGuildMenuActions.ts`
   *  `markGuildRead` deseni, kategori düzeyine uygulanmış hâli). Yetki gerekmez, HERKESE açık. */
  onMarkRead: () => void;
  /** Yönetim maddeleri (Düzenle/Kanal Oluştur) YALNIZ bu true iken render edilir. */
  canManage: boolean;
}

/**
 * Sprint M1d-B sahip revizesi 2026-07-31 — kategori başlığına uzun basınca açılan panel.
 *
 * **Bu panelin asıl varlık sebebi "Kanal Oluştur" satırı.** Kategoriye kanal eklemenin hiçbir yolu
 * yoktu: `channel-new` ekranı `categoryId` parametresini alıyordu ama onu geçen bir giriş
 * yazılmamıştı. Sahip DoD-B/14'ü (kategori silinince kanallar kategorisiz olur) bu yüzden test
 * edemedi — kategoriye kanal koyamıyordu.
 *
 * 🔴 KONMAYANLAR (Discord'da var, bizde YOK): Davet et (ortam düzeyinde bir iş, ortam panelinde
 * duruyor — ikinci kapı açılmadı) · Kategoriyi Sustur ve Bildirim Ayarları (kategori bildirim
 * tercihi mobilde bağlı değil) · Kanal ID'sini Kopyala (geliştirici modu bizde yok).
 *
 * Silme, kanal desenindeki gibi düzenleme ekranının içinde — yıkıcı işlem bir dokunuş daha derinde.
 *
 * Sprint M2a §4.5 — "Okunmuş Olarak İşaretle" EKLENDİ (önceki not burada listeliyordu, artık IN).
 * Panel artık HERKESE açılıyor (önceden yalnız `canManage`); Düzenle/Kanal Oluştur yönetim
 * maddeleri `canManage` ile koşullu kaldı.
 */
export function CategoryMenuSheet({
  visible,
  categoryName,
  onClose,
  onEdit,
  onCreateChannel,
  onMarkRead,
  canManage,
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
              {categoryName}
            </Text>

            <View style={styles.group}>
              <Pressable style={styles.option} onPress={onMarkRead}>
                <Ionicons name="eye-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.optionText}>{t('guildMenu.markRead')}</Text>
              </Pressable>
            </View>

            {canManage && (
              <View style={styles.group}>
                <Pressable style={styles.option} onPress={onEdit}>
                  <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.optionText}>{t('category.editTitle')}</Text>
                </Pressable>
                <View style={styles.divider} />
                <Pressable style={styles.option} onPress={onCreateChannel}>
                  <Ionicons name="add" size={22} color={theme.colors.textSecondary} />
                  <Text style={styles.optionText}>{t('channel.createTitle')}</Text>
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
  divider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: theme.colors.borderStrong,
  },
});
