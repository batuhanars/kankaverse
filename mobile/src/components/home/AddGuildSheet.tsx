import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { sheetBottomPadding, useSheetInsets } from './sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreate: () => void;
  onJoin: () => void;
}

// Sprint M1d-A §3 — ray "+" düğmesinin açtığı seçici; web `ServerModal` `choose` adımının mobil
// karşılığı. Ray 72dp olduğu için "Katıl" ve "Kur" ayrı ayrı iki ray düğmesi yapılmadı.
// `home.tsx`'ten ayrı dosyaya çıkarıldı (300 satır eşiği).
export function AddGuildSheet({ visible, onClose, onCreate, onJoin }: Props) {
  const bottomInset = useSheetInsets();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <Text style={styles.title}>{t('guild.modal.chooseTitle')}</Text>
          <Text style={styles.desc}>{t('guild.modal.chooseDesc')}</Text>

          <Pressable style={styles.option} onPress={onCreate}>
            <Text style={styles.optionTitle}>{t('guild.modal.createOption')}</Text>
            <Text style={styles.optionDesc}>{t('guild.modal.createOptionDesc')}</Text>
          </Pressable>

          <Pressable style={styles.option} onPress={onJoin}>
            <Text style={styles.optionTitle}>{t('guild.modal.joinOption')}</Text>
            <Text style={styles.optionDesc}>{t('guild.modal.joinOptionDesc')}</Text>
          </Pressable>
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
    padding: theme.layout.panelGap,
    gap: 8,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  desc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 19,
    marginBottom: 4,
  },
  option: {
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    gap: 2,
  },
  optionTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  optionDesc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
  },
});
