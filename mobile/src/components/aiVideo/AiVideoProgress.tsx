import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AiVideoDto } from '@/api/aiVideo';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { aiVideoErrorText } from './aiVideoErrors';

interface Props {
  job: AiVideoDto;
  working: boolean;
  saving: boolean;
  elapsedSec: number;
  onNew: () => void;
}

/** Üretim sürerken ilerleme + bekleme notu; başarısızsa hata metni + "Yeni üretim" (web `AiVideoDialog`). */
export function AiVideoProgress({ job, working, saving, elapsedSec, onNew }: Props) {
  if (working) {
    const text = saving
      ? t('aiVideo.saving')
      : job.status === 'QUEUED'
        ? t('aiVideo.queued')
        : t('aiVideo.running', { sec: elapsedSec });
    return (
      <View style={styles.wrap}>
        <Text style={styles.status}>{text}</Text>
        <Text style={styles.note}>{t('aiVideo.waitNote')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      {job.status === 'FAILED' ? <Text style={styles.error}>{aiVideoErrorText(job.errorCode)}</Text> : null}
      <Pressable onPress={onNew} style={styles.btn} accessibilityRole="button">
        <Text style={styles.btnText}>{t('aiVideo.newOne')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  status: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md },
  note: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  btn: {
    alignSelf: 'flex-start',
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  btnText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },
});
