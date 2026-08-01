import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1g R2 — "Sonuçları filtrele" menüsü (sahip revizesi 2026-08-01).
 *
 * 🔴 **Panel + "Uygula" kaldırıldı.** Önceki tasarım seçimi bir alt panelde toplayıp Uygula ile
 * gönderiyordu; sahip haklı olarak "gönderen/bahsedilen" satırlarını hem hantal hem çirkin buldu.
 * Doğrusu **token akışı**: menüden birini seç → arama çubuğuna pill düşsün → yazmaya devam et.
 *
 * Bu aynı zamanda **parite düzeltmesi**: web zaten token metinleri kullanıyor (`guildSearch.token.*`
 * = "şu kullanıcıdan:", "şu kanalda:"). Yani asıl sapan panelli tasarımdı.
 *
 * Menü yalnız filtre TÜRÜNÜ seçtirir; değeri (hangi kişi, hangi kanal) bir sonraki adımda seçilir.
 */
export type FilterKind = 'from' | 'mentions' | 'in' | 'has';

interface Props {
  onPick: (kind: FilterKind) => void;
  onClose: () => void;
}

/**
 * Discord'un menüsünde tarih filtreleri de var (önce/sonra/tarihte). **Bizde YOK** — uç
 * `q`/`from`/`mentions`/`in`/`has` alıyor, tarih parametresi kabul etmiyor. Çalışmayacak bir
 * satır koymaktansa dört gerçek satır.
 */
const ITEMS: { kind: FilterKind; icon: keyof typeof Ionicons.glyphMap; labelKey: string }[] = [
  { kind: 'from', icon: 'person-outline', labelKey: 'guildSearch.cat.from' },
  { kind: 'mentions', icon: 'at-outline', labelKey: 'guildSearch.cat.mentions' },
  { kind: 'has', icon: 'attach-outline', labelKey: 'guildSearch.cat.has' },
  { kind: 'in', icon: 'list-outline', labelKey: 'guildSearch.cat.in' },
];

export function SearchFilterMenu({ onPick, onClose }: Props) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.menu} onPress={() => {}}>
          <Text style={styles.title}>{t('guildSearch.filters')}</Text>
          {ITEMS.map((item, i) => (
            <Pressable
              key={item.kind}
              onPress={() => onPick(item.kind)}
              style={[styles.row, i < ITEMS.length - 1 && styles.rowDivider]}
            >
              <Text style={styles.label}>{t(item.labelKey)}</Text>
              <Ionicons name={item.icon} size={20} color={theme.colors.textSecondary} />
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Menü sağ üstte, filtre düğmesinin altında belirir (Discord yerleşimi) — ekranın ortasında
  // duran bir kart, hangi düğmeden geldiğini unutturur.
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingTop: 96,
    paddingRight: theme.layout.panelGap,
    alignItems: 'flex-end',
  },
  menu: {
    minWidth: 260,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  label: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
});
