import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * ⋯ düğmesinin panel kenarına uzaklığı ve dokunma kutusu ölçüsü.
 *
 * 🔴 İkisi de BURADA tanımlı ve hem düğmeyi çizen `ProfileSheet` hem bu menü aynı sabitleri
 * okuyor — menü düğmenin tam altına ankrajlandığı için ikisi ayrı yerde yazılsaydı ilk değişiklikte
 * kayarlardı (menü ⋯'nin altında değil ortasında açılırdı).
 */
export const MORE_HIT = 44;
export const MORE_INSET = theme.layout.panelGap + 8;

interface Props {
  /** `friendStatus === 'friends'` — Kankalıktan Çıkar satırı. */
  canRemoveFriend: boolean;
  /** Ben engellememişim → Engelle. */
  canBlock: boolean;
  /** `selfBlocked` → Engeli Kaldır. 🔴 "O beni engelledi" ASLA buraya girmez. */
  canUnblock: boolean;
  /** E4 §4.1 — kendim değilsem "Kullanıcıyı şikâyet et". */
  canReport: boolean;
  onReport: () => void;
  /** Yalnız MENÜYÜ kapatır — profil paneli açık kalır. */
  onClose: () => void;
  onRemoveFriend: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}

/**
 * Sprint M3b R5 §3.3 — profil panelinin **⋯ menüsü**: Kankalıktan Çıkar · Engelle · Engeli Kaldır.
 *
 * 🔴 **R5 düzeltmesi — bu artık bir `Modal` DEĞİL.** R3'te ayrı bir alt panel (`ProfileMoreSheet`)
 * olarak yazılmıştı; ikinci bir modal olduğu için açılınca profil panelini gizlemek zorundaydık ve
 * sahip haklı olarak "ayrı panel gibi açılıyor" dedi. Artık profil panelinin **İÇİNDE**, ⋯'nin
 * hemen altında açılan ankrajlı bir menü: profil paneli görünür kalıyor, ikinci `Modal` hiç
 * açılmıyor, dolayısıyla üst üste binen karartılmış perde riski **kaynağından** kalktı.
 *
 * İki parça çiziyor:
 * 1. **Şeffaf yakalayıcı** — panelin tamamını kaplar, dışarı dokunuş menüyü kapatır (profil
 *    panelini KAPATMAZ). Görünmez, rengi yok; tek işi dokunuşu yutmak.
 * 2. **Menü** — ⋯'nin altına ankrajlı (`top: MORE_INSET + MORE_HIT`, `right: MORE_INSET`), içerik
 *    kadar dar, yuvarlak köşeli, yükseltilmiş zemin.
 *
 * 🔴 **T&S:** buraya giden ⋯ düğmesi, üç aksiyondan herhangi biri mümkünse HER ZAMAN çizilir
 * (`ProfileSheet.showMore`) — engelleme bu menüde olduğu için menünün kapısı kaybolamaz (M1d-0).
 * Yıkıcı satırların onay diyalogları korunur; onay açılırken bu menü kapanır (`ProfileSheet`).
 *
 * Sahip kararı (2026-08-04, Discord birebir): bu üçü ikon şeridine girmez — küçük ikonla yanlış
 * basmaya açık. PM'in "panelin dibinde tehlike satırı" önerisi reddedildi, itiraz §3.3'te kayıtlı.
 */
export function ProfileMoreMenu({
  canRemoveFriend,
  canBlock,
  canUnblock,
  canReport,
  onReport,
  onClose,
  onRemoveFriend,
  onBlock,
  onUnblock,
}: Props) {
  return (
    <>
      {/* Dışarı dokunuş yakalayıcısı. Ekran okuyucuya duyurulmaz (`accessible={false}`): görünmez
          bir tam-alan düğmesi olarak okunması içeriği gizlerdi. Ekran okuyucu kullanıcısı menüyü
          Android geri hareketi/tuşuyla kapatır — `ProfileSheet.onRequestClose` bunu karşılıyor. */}
      <Pressable style={styles.catcher} onPress={onClose} accessible={false} />

      <View style={styles.menu}>
        {canRemoveFriend && (
          <Pressable style={styles.option} onPress={onRemoveFriend} accessibilityRole="button">
            <Ionicons name="person-remove-outline" size={18} color={theme.colors.danger} />
            <Text style={[styles.optionText, styles.optionTextDanger]}>{t('friends.remove')}</Text>
          </Pressable>
        )}
        {canRemoveFriend && (canBlock || canUnblock) && <View style={styles.divider} />}
        {canBlock && (
          <Pressable style={styles.option} onPress={onBlock} accessibilityRole="button">
            <Ionicons name="ban-outline" size={18} color={theme.colors.danger} />
            <Text style={[styles.optionText, styles.optionTextDanger]}>{t('friends.block')}</Text>
          </Pressable>
        )}
        {canUnblock && (
          <Pressable style={styles.option} onPress={onUnblock} accessibilityRole="button">
            <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={styles.optionText}>{t('dm.unblock')}</Text>
          </Pressable>
        )}
        {canReport && (canRemoveFriend || canBlock || canUnblock) && <View style={styles.divider} />}
        {canReport && (
          <Pressable style={styles.option} onPress={onReport} accessibilityRole="button">
            <Ionicons name="flag-outline" size={18} color={theme.colors.danger} />
            <Text style={[styles.optionText, styles.optionTextDanger]}>{t('report.reportUser')}</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  catcher: {
    ...StyleSheet.absoluteFillObject,
  },
  // ⋯'nin hemen ALTINDA, sağ üstte. Ankraj matematiği: düğme kutusu `MORE_INSET`te başlayıp
  // `MORE_HIT` kadar sürüyor → menü tam onun altından başlıyor, sağ kenarları hizalı.
  menu: {
    position: 'absolute',
    top: MORE_INSET + MORE_HIT,
    right: MORE_INSET,
    minWidth: 200,
    paddingVertical: 4,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    // Yükseltilmiş zemin — menü afişin/içeriğin üstünde ayrı bir katman gibi okunsun.
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // Dokunma hedefi alt sınırı — menü satırı dar görünse de 44dp'nin altına inmez.
    minHeight: MORE_HIT,
    paddingHorizontal: 14,
  },
  optionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  optionTextDanger: {
    color: theme.colors.danger,
  },
  divider: {
    height: 1,
    marginHorizontal: 14,
    backgroundColor: theme.colors.borderSubtle,
  },
});
