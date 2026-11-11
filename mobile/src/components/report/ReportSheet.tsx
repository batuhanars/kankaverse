import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReportReason, reportsApi } from '@/api/reports';
import { collectEvidence } from '@/stores/e2ee';
import { useMessagesStore } from '@/stores/messages';
import { useReportStore } from '@/stores/report';
import { showToast } from '@/stores/toast';
import { buildReportPayload, gatherEvidence } from '@/utils/reportPayload';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

const REASONS = [
  ReportReason.SPAM,
  ReportReason.HARASSMENT,
  ReportReason.MINOR_SAFETY,
  ReportReason.VIOLENCE,
  ReportReason.CSAM,
  ReportReason.SELF_HARM,
  ReportReason.OTHER,
] as const;

/** Sunucu DTO'su `description` icin 500 karakter siniri koyar. */
const DESCRIPTION_MAX = 500;

/**
 * E4 §4.1 — sikayet paneli (web `ReportModal.vue` davranisi). Hedef `useReportStore`dan gelir; panel
 * `(app)/_layout.tsx`te bir kez mount edilir. Mesaj hedefinde (sifreli ve sifresiz) neyin iletilecegi acikca yazilir.
 * Sifreli DM mesajinda gonderimden once yerel depodan kanit toplanir; toplanamazsa sikayet kanitsiz gider.
 */
export function ReportSheet() {
  const target = useReportStore((s) => s.target);
  const close = useReportStore((s) => s.closeReport);
  const bottomInset = useSheetInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function dismiss() {
    if (submitting) return;
    close();
    setReason(null);
    setDescription('');
    setError('');
  }

  async function submit() {
    if (!target || !reason || submitting) return;
    setSubmitting(true);
    setError('');
    const messages = target.channelId ? (useMessagesStore.getState().byChannel[target.channelId]?.messages ?? []) : [];
    const evidence = await gatherEvidence(target, messages, collectEvidence, (e) =>
      console.error('[e2ee] kanit toplanamadi', e instanceof Error ? e.name : ''),
    );
    try {
      await reportsApi.createReport(buildReportPayload(target, reason, description, evidence));
      setSubmitting(false);
      dismiss();
      showToast(t('report.successMessage'));
    } catch {
      setError(t('report.submitError'));
      setSubmitting(false);
    }
  }

  return (
    <Modal transparent visible={!!target} animationType="slide" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
          <Pressable
            style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
            onPress={() => {}}
          >
            <View style={styles.grabber} />
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.title}>{t('report.title')}</Text>
              <Text style={styles.subtitle}>{t('report.subtitle')}</Text>

              {target?.targetType === 'MESSAGE' && (
                <Text style={styles.notice}>{t('report.evidenceNotice')}</Text>
              )}

              <View style={styles.reasons}>
                {REASONS.map((r) => {
                  const on = reason === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setReason(r)}
                      style={[styles.reasonRow, on && styles.reasonRowOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={styles.reasonText}>{t(`reason.${r}`)}</Text>
                      <Ionicons
                        name={on ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={on ? theme.colors.accent500 : theme.colors.textMuted}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>{t('report.descriptionLabel')}</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t('report.descriptionPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                multiline
                maxLength={DESCRIPTION_MAX}
                style={styles.input}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.actions}>
                <Pressable disabled={submitting} onPress={dismiss} style={styles.cancelButton}>
                  <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  disabled={!reason || submitting}
                  onPress={submit}
                  style={[styles.submitButton, (!reason || submitting) && styles.disabled]}
                >
                  {submitting ? (
                    <ActivityIndicator color={theme.colors.textPrimary} />
                  ) : (
                    <Text style={styles.submitText}>{t('report.submitButton')}</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: theme.colors.bgOverlay, justifyContent: 'flex-end' },
  kav: { maxHeight: '92%' },
  sheet: {
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
  content: { paddingHorizontal: theme.layout.panelGap, paddingTop: 12, gap: 12 },
  title: { color: theme.colors.textPrimary, fontSize: theme.fontSize.xl, fontWeight: '700' },
  subtitle: { color: theme.colors.textMuted, fontSize: theme.fontSize.base },
  notice: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reasons: { gap: 8 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reasonRowOn: { backgroundColor: theme.colors.accentSubtle, borderColor: theme.colors.accent500 },
  reasonText: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.lg },
  label: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  input: {
    minHeight: 80,
    textAlignVertical: 'top',
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.base },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  cancelText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.lg, fontWeight: '600' },
  submitButton: {
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.danger,
  },
  submitText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.lg, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
