import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VoicePhase } from './useVoiceRecorder';
import { Waveform } from './Waveform';
import { formatClock } from '@/utils/formatClock';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M6b §3 — kayıt şeridi: [🗑 iptal] [● kırmızı nokta + geçen süre] [gönder]. Kayıt sürerken
 * mesaj kutusunun YERİNE geçer (aynı yükseklik, giriş şeridi sıçramasın).
 *
 * 5:00'da kayıt kendiliğinden durur (`limit`): sayaç donar, nokta söner, yanına kısa not düşer ve
 * şerit gönder/sil bekler — kayıt GÖNDERİLMEZ.
 */
export function VoiceRecorderBar({
  phase,
  elapsedMs,
  levels,
  sending,
  onCancel,
  onSend,
}: {
  phase: VoicePhase;
  elapsedMs: number;
  /** Canlı dalga: son örnekler (0-255), sağa doğru akar. */
  levels: number[];
  sending: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  const limit = phase === 'limit';
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onCancel}
        disabled={sending}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.voice.cancel')}
        style={styles.iconButton}
      >
        <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
      </Pressable>

      <View style={styles.status} accessibilityLabel={t('mobile.voice.recording')}>
        <View style={[styles.dot, limit && styles.dotOff]} />
        <Text style={styles.time}>{formatClock(elapsedMs)}</Text>
        {limit ? (
          <Text style={styles.limit} numberOfLines={2}>
            {t('mobile.voice.limitReached')}
          </Text>
        ) : (
          <Waveform levels={levels} activeColor={theme.colors.accent500} />
        )}
      </View>

      <Pressable
        onPress={onSend}
        disabled={sending}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.voice.send')}
        style={[styles.iconButton, sending && styles.busy]}
      >
        <View style={styles.circle}>
          <Ionicons name="send" size={18} color={theme.colors.textPrimary} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: theme.layout.inputMinHeight,
  },
  iconButton: {
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // §7.4 — gönder/mikrofon Kor daire, içinde beyaz ikon (44dp dokunma hedefi, 40px daire).
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: {
    opacity: 0.4,
  },
  status: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.danger,
  },
  dotOff: {
    opacity: 0.35,
  },
  time: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontVariant: ['tabular-nums'],
  },
  limit: {
    flexShrink: 1,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
});
