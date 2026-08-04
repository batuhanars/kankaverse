import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  title: string;
  /** Grup DM mi — satır kümesini bu belirler (1-1'de tek satır: Sohbeti Temizle). */
  isGroup: boolean;
  /** Grup sahibi miyim — Yeniden Adlandır / Grubu Sil yalnız buna bağlı. */
  isOwner: boolean;
  /** Başarısız bir aksiyonun Türkçe mesajı. Onay kutusu hata gösteremiyor (`ConfirmDialog`ın
   *  yüzeyi yok), o yüzden hata bu panele düşer — kullanıcı işlem tutmadığını görmeden kalmasın. */
  errorMessage: string;
  onClose: () => void;
  onClear: () => void;
  onAddMember: () => void;
  onRename: () => void;
  onLeave: () => void;
  onDelete: () => void;
}

/**
 * Sprint M3b §2.4 — DM detay ekranının ⋯ alt-paneli. `DmMenuSheet` deseni birebir
 * (`Modal transparent animationType="slide"` + gruplu satırlar), yeni bağımlılık yok.
 *
 * **1-1 DM:** Sohbeti Temizle (G4 akışı). Discord'daki "DM'yi Kapat" bu; **"Sil" dili
 * KULLANILMIYOR** — mesaj DB'de duruyor, yalnız çağıranın `clearedAt`i işaretleniyor.
 *
 * **Grup DM:** Üye Ekle · Yeniden Adlandır · Gruptan Ayrıl · Grubu Sil — `group/[id].tsx` ekranının
 * dibindeki aksiyonlar buraya taşındı, oradan kalktı. Satır içi **üye çıkarma** bu listede DEĞİL,
 * Üyeler sekmesinde kaldı (§2.3.1).
 *
 * 🔴 Yetki bugünkü kuralın aynısı: adlandır/sil yalnız `ownerId`, ekle/ayrıl herkes. Yetkisiz satır
 * **hiç render edilmez** (disabled gösterilmez — 403 yiyecek buton konmaz), bu ekranın devraldığı
 * mevcut davranış. Yıkıcı aksiyonların onayı çağıranda (`DmMoreHost`); panel yalnız niyeti iletir.
 *
 * 🔴 **"Kanal ID'sini Kopyala" YOK** — Discord'un geliştirici modu özelliği, bizde karşılığı yok.
 */
export function DmMoreSheet({
  visible,
  title,
  isGroup,
  isOwner,
  errorMessage,
  onClose,
  onClear,
  onAddMember,
  onRename,
  onLeave,
  onDelete,
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

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            {isGroup ? (
              <>
                <View style={styles.group}>
                  <Pressable style={styles.option} onPress={onAddMember}>
                    <Ionicons name="person-add-outline" size={20} color={theme.colors.textSecondary} />
                    <Text style={styles.optionText}>{t('group.addMember')}</Text>
                  </Pressable>
                  {isOwner && (
                    <>
                      <View style={styles.divider} />
                      <Pressable style={styles.option} onPress={onRename}>
                        <Ionicons name="create-outline" size={20} color={theme.colors.textSecondary} />
                        <Text style={styles.optionText}>{t('group.renameGroup')}</Text>
                      </Pressable>
                    </>
                  )}
                </View>

                <View style={styles.group}>
                  <Pressable style={styles.option} onPress={onLeave}>
                    <Ionicons name="exit-outline" size={20} color={theme.colors.danger} />
                    <Text style={[styles.optionText, styles.optionTextDanger]}>
                      {t('group.leaveGroup')}
                    </Text>
                  </Pressable>
                  {isOwner && (
                    <>
                      <View style={styles.divider} />
                      <Pressable style={styles.option} onPress={onDelete}>
                        <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                        <Text style={[styles.optionText, styles.optionTextDanger]}>
                          {t('group.deleteGroup')}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.group}>
                <Pressable style={styles.option} onPress={onClear}>
                  <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                  <Text style={[styles.optionText, styles.optionTextDanger]}>
                    {t('dm.clearConversation')}
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
  optionTextDanger: {
    color: theme.colors.danger,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: theme.colors.borderStrong,
  },
});
