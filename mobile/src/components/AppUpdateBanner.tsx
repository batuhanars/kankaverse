import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppUpdateStore } from '@/stores/appUpdate';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Ana sayfanın üstündeki güncelleme şeridi (masaüstündeki bandın karşılığı). Yalnız Play yeni sürüm
 * sunduğunda görünür; durum `stores/appUpdate`.
 */
export function AppUpdateBanner() {
  const phase = useAppUpdateStore((s) => s.phase);
  const progress = useAppUpdateStore((s) => s.progress);
  const dismissed = useAppUpdateStore((s) => s.dismissed);
  const start = useAppUpdateStore((s) => s.start);
  const restart = useAppUpdateStore((s) => s.restart);
  const dismiss = useAppUpdateStore((s) => s.dismiss);

  if (phase === 'idle' || dismissed) return null;

  let message = t('mobile.appUpdate.available');
  if (phase === 'ready') message = t('mobile.appUpdate.ready');
  else if (phase === 'downloading') {
    message =
      progress !== null
        ? t('mobile.appUpdate.downloadingPercent', { percent: progress })
        : t('mobile.appUpdate.downloading');
  }

  let action: { label: string; run: () => Promise<void> } | null = null;
  if (phase === 'ready') action = { label: t('mobile.appUpdate.restart'), run: restart };
  else if (phase === 'available') action = { label: t('mobile.appUpdate.update'), run: start };

  return (
    <View style={styles.banner}>
      <Ionicons name="arrow-down-circle-outline" size={18} color={theme.colors.accent500} />
      <Text style={styles.message}>{message}</Text>
      {action ? (
        <Pressable onPress={() => void action.run()} hitSlop={8} accessibilityRole="button">
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      ) : null}
      {phase !== 'downloading' ? (
        <Pressable
          onPress={dismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('desktopUpdate.dismiss')}
        >
          <Ionicons name="close" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 10,
    backgroundColor: theme.colors.accentSubtle,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderStrong,
  },
  message: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
  },
  action: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
});
