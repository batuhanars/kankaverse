import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { formatCreditNumber, formatCredits } from './formatCredits';

interface Props {
  durationS: number;
  estimateCredits: number | null;
  estimating: boolean;
  estimateFailed: boolean;
  overCap: boolean;
  spentTodayCredits: number;
  dailyCapCredits: number;
  canSubmit: boolean;
  busy: boolean;
  /** C33: pasif tanıtım; Oluştur kapalı + "yakında" notu, tahmin satırı yok. */
  locked?: boolean;
  /** C39: doluysa kilit notu davet metnine döner + "Ortama katıl" düğmesi. */
  inviteCode?: string | null;
  onJoin?: () => void;
  onSubmit: () => void;
}

/**
 * Canlı teklif + bugünkü harcama + "Oluştur" (web `AiVideoCostBar`). Yüklenirken eski tutar soluk;
 * tavanı aşacaksa düğme kapalı + neden yazılı. Sunucu yine otorite.
 */
export function AiVideoCostBar(p: Props) {
  const disabled =
    !!p.locked || !p.canSubmit || p.estimating || p.estimateCredits === null || p.overCap || p.busy;
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {p.locked ? (
          <View style={styles.info} />
        ) : (
          <View style={styles.info}>
            <Text style={styles.label}>{t('aiVideo.estimate', { sec: p.durationS })}</Text>
            {p.estimateCredits !== null ? (
              <Text style={[styles.amount, p.estimating && styles.dim]}>{formatCredits(p.estimateCredits)}</Text>
            ) : p.estimateFailed ? (
              <Text style={styles.failed}>{t('aiVideo.estimateFailed')}</Text>
            ) : (
              <Text style={styles.amount}>...</Text>
            )}
          </View>
        )}
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
        {t('aiVideo.spentLine', {
          spent: formatCreditNumber(p.spentTodayCredits),
          cap: formatCreditNumber(p.dailyCapCredits),
        })}
      </Text>
      {p.locked ? (
        <Text style={styles.lockedNote}>
          {p.inviteCode ? t('aiVideo.lockedNoteInvite') : t('aiVideo.lockedNote')}
        </Text>
      ) : null}
      {p.locked && p.inviteCode ? (
        <Pressable onPress={p.onJoin} accessibilityRole="button" style={styles.joinButton}>
          <Text style={styles.joinText}>{t('aiVideo.joinGuild')}</Text>
        </Pressable>
      ) : null}
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
  lockedNote: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  joinButton: {
    alignSelf: 'flex-start',
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  joinText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
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
