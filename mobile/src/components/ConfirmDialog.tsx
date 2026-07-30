import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  title?: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Sprint M1b — mobilde ilk kullanımı (M1a'da yoktu). Web `components/shared/ConfirmDialog.vue`
// karşılığı. Onay gerektiren en az 6 yer kullanıyor (engelle, arkadaşlıktan çıkar, sohbeti temizle,
// gruptan ayrıl, grubu sil, üye çıkar) — Rule of Three baştan fazlasıyla karşılandığı için ayrı
// bileşen olarak yazıldı, inline'a dağılmadı.
export function ConfirmDialog({ title, message, confirmLabel, loading, onConfirm, onCancel }: Props) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title ?? t('common.confirm')}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable disabled={loading} onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable disabled={loading} onPress={onConfirm} style={[styles.confirmButton, loading && styles.disabled]}>
              {loading ? (
                <ActivityIndicator color={theme.colors.textPrimary} />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel ?? t('common.confirm')}</Text>
              )}
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
    backgroundColor: theme.colors.bgElevated,
    padding: theme.layout.panelGap * 1.5,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    marginBottom: 10,
  },
  message: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
    marginBottom: theme.layout.panelGap,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSidebar,
  },
  cancelText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  confirmButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.danger,
  },
  disabled: {
    opacity: 0.7,
  },
  confirmText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
