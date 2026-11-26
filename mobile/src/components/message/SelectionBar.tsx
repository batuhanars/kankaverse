import { useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';
import { theme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Başlıktaki bir eylem; `show` false ise hiç çizilmez (yetkisiz eylem disabled gösterilmez). */
export interface BarAction {
  key: string;
  icon: IconName;
  label: string;
  show: boolean;
  danger?: boolean;
  onPress: () => void;
}

/**
 * C81 §2 Rev.2 — seçim modu NATIVE başlığın içinde çizilir (sol: ✕, başlık: sayı, sağ: eylemler + ⋮).
 * İlk sürüm başlığı gizleyip yerine kendi çubuğunu koyuyordu; başlığın kalkıp gelmesi ekranı baştan
 * yerleştiriyordu (sahip: "yeniden yükleniyor gibi"), tepki şeridinin ölçümü de bu kaymaya denk geliyordu.
 */
export function SelectionHeaderLeft({ onClose }: { onClose: () => void }) {
  return (
    <Pressable
      onPress={onClose}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('mobile.select.close')}
      style={styles.iconButton}
    >
      <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
    </Pressable>
  );
}

export function SelectionHeaderTitle({ count }: { count: number }) {
  return (
    <Text style={styles.count} accessibilityLiveRegion="polite">
      {t('mobile.select.count', { n: count })}
    </Text>
  );
}

export function SelectionHeaderRight({ actions, menu }: { actions: BarAction[]; menu: BarAction[] }) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleMenu = menu.filter((m) => m.show);

  return (
    <View style={styles.right}>
      {actions
        .filter((a) => a.show)
        .map((a) => (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={styles.iconButton}
          >
            <Ionicons name={a.icon} size={22} color={a.danger ? theme.colors.danger : theme.colors.textPrimary} />
          </Pressable>
        ))}
      {visibleMenu.length > 0 && (
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.select.more')}
          style={styles.iconButton}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      )}

      <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { marginTop: insets.top + 8 }]}>
            {visibleMenu.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => {
                  setMenuOpen(false);
                  m.onPress();
                }}
                style={styles.menuRow}
                accessibilityRole="button"
              >
                <Ionicons name={m.icon} size={20} color={m.danger ? theme.colors.danger : theme.colors.textSecondary} />
                <Text style={[styles.menuText, m.danger && styles.menuTextDanger]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', marginRight: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  count: { color: theme.colors.textPrimary, fontSize: theme.fontSize.lg, fontWeight: '600' },
  menuBackdrop: { flex: 1, alignItems: 'flex-end' },
  menu: {
    minWidth: 200,
    marginRight: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    paddingVertical: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  menuText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.md, fontWeight: '500' },
  menuTextDanger: { color: theme.colors.danger },
});
