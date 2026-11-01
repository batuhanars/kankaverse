import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { formatCreditNumber, formatCredits } from './formatCredits';

interface Props {
  durationS: number;
  estimateCredits: number | null;
  estimating: boolean;
  estimateFailed: boolean;
  canSubmit: boolean;
  /** C43: etkin (QUEUED/RUNNING) üretim varken Oluştur kapalı + not. */
  inProgress?: boolean;
  /** C42: girdi videosu da ücretlenir; tahmin en yüksek tutar notu. */
  hasVideo?: boolean;
  busy: boolean;
  /** Sunucudan dönen hata (ör. yetersiz kredi): form uzun olduğu için düğmenin yanında, sabit alanda gösterilir. */
  error?: string;
  /** C33: pasif tanıtım; Oluştur kapalı + "yakında" notu, tahmin satırı yok. */
  locked?: boolean;
  /** C40/C43: hakla erişene kullanılan/tanımlanan kredi satırı (hak yoksa null, satır yok). */
  grant?: { usedCredits: number; remainingCredits: number; budgetCredits: number; expiresAt: string | null } | null;
  onSubmit: () => void;
}

/**
 * Canlı teklif + hak satırı + "Oluştur" (web `AiVideoCostBar`). Yüklenirken eski tutar soluk;
 * teklif kalan krediyi aşıyorsa düğme kapalı + neden yazılı. Sunucu yine otorite (C43: günlük tavan yok).
 */
export function AiVideoCostBar(p: Props) {
  const notEnough = !!p.grant && p.estimateCredits !== null && p.estimateCredits > p.grant.remainingCredits;
  const disabled =
    !!p.locked || !!p.inProgress || !p.canSubmit || p.estimating || p.estimateCredits === null || notEnough || p.busy;
  const expiry = p.grant?.expiresAt
    ? new Date(p.grant.expiresAt).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
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
      {p.hasVideo && !p.locked ? <Text style={styles.spent}>{t('mobile.aiVideoRefs.videoCostNote')}</Text> : null}
      {p.grant && !p.locked ? (
        <Text style={styles.spent}>
          {t('aiVideo.grantLine', {
            used: formatCreditNumber(p.grant.usedCredits),
            budget: formatCreditNumber(p.grant.budgetCredits),
          })}
          {expiry ? ` · ${t('aiVideo.grantExpiry', { date: expiry })}` : ''}
        </Text>
      ) : null}
      {p.locked ? (
        // C40 (Play kuralı): nötr not, davet/yönlendirme yok. Web/masaüstü C39 notunu korur.
        <Text style={styles.lockedNote}>{t('aiVideo.lockedNoteMobile')}</Text>
      ) : null}
      {p.inProgress && !p.locked ? <Text style={styles.spent}>{t('aiVideo.inProgress')}</Text> : null}
      {notEnough && !p.locked ? <Text style={styles.failed}>{t('aiVideo.grantNotEnough')}</Text> : null}
      {p.error ? (
        <Text style={styles.failed} accessibilityLiveRegion="polite">
          {p.error}
        </Text>
      ) : null}
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
