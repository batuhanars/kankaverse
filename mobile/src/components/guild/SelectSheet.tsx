import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { theme } from '@/theme';

export interface SelectOption {
  value: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Sprint M1j R1 — tek-seçimlik açılır liste (alttan panel).
 *
 * Sahip revizesi: etkinlik formundaki sıklık ve kanal seçimi **inline radyo listesi** olarak
 * yazılmıştı; Discord'da ikisi de kapalı bir seçim kutusu ve dokununca alttan panel açılıyor.
 * Aynı etkileşim iki yerde gerektiği için tek bileşen (`FilterValueSheet` deseni; o panel arama +
 * üç ayrı veri kaynağına bağlı olduğu için oraya girmedi, burası saf tek-seçim).
 */
interface Props {
  title: string;
  options: SelectOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function SelectSheet({ title, options, selected, onSelect, onClose }: Props) {
  const bottomInset = useSheetInsets();

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>

          <ScrollView contentContainerStyle={styles.list}>
            {options.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => onSelect(opt.value)}
                style={[styles.row, selected === opt.value && styles.rowOn]}
              >
                {opt.icon ? (
                  <Ionicons name={opt.icon} size={16} color={theme.colors.textMuted} />
                ) : null}
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {opt.label}
                </Text>
                <Ionicons
                  name={selected === opt.value ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={selected === opt.value ? theme.colors.accent500 : theme.colors.textMuted}
                />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: theme.colors.bgOverlay, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '70%',
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
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
    paddingBottom: 10,
  },
  list: { padding: theme.layout.panelGap, gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
  },
  rowOn: { borderColor: theme.colors.accent500 },
  rowLabel: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
});
