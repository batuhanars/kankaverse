import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { formatUsd } from './formatUsd';

interface Props {
  durationS: number;
  estimateUsd: number | null;
  estimating: boolean;
  estimateFailed: boolean;
  overCap: boolean;
  todaySpentUsd: number;
  dailyCapUsd: number;
  canSubmit: boolean;
  busy: boolean;
  onSubmit: () => void;
}

/**
 * Canlı teklif + bugünkü harcama + "Oluştur" (web `AiVideoCostBar`). Yüklenirken eski tutar soluk;
 * tavanı aşacaksa düğme kapalı + neden yazılı. Sunucu yine otorite.
 */
export function AiVideoCostBar(p: Props) {
  const disabled = !p.canSubmit || p.estimating || p.estimateUsd === null || p.overCap || p.busy;
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.label}>{t('aiVideo.estimate', { sec: p.durationS })}</Text>
          {p.estimateUsd !== null ? (
            <Text style={[styles.amount, p.estimating && styles.dim]}>{formatUsd(p.estimateUsd)}</Text>
          ) : p.estimateFailed ? (
            <Text style={styles.failed}>{t('aiVideo.estimateFailed')}</Text>
          ) : (
            <Text style={styles.amount}>...</Text>
          )}
        </View>
        <Pressable
          onPress={p.onSubmit}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled, busy: p.busy }}
          style={[styles.button, disabled && styles.buttonOff]}
        >
          {p.busy ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.buttonText}>{t('aiVideo.generate')}</Text>
          )}
        </Pressable>
      </View>
      <Text style={styles.spent}>
        {t('aiVideo.spentLine', { spent: formatUsd(p.todaySpentUsd), cap: formatUsd(p.dailyCapUsd) })}
      </Text>
      {p.overCap ? <Text style={styles.failed}>{t('aiVideo.overCap')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  info: { flex: 1, minWidth: 0 },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  amount: { color: theme.colors.textPrimary, fontSize: theme.fontSize.xl, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dim: { opacity: 0.4 },
  failed: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  spent: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  button: {
    minWidth: 110,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
  },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '700' },
});
