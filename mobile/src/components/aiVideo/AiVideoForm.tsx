import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { Segmented } from './Segmented';
import type { useAiVideo } from './useAiVideo';

const PROMPT_MAX = 1000;

const audioLabel = (m: { audio: string; label: string }) =>
  t(m.audio === 'none' ? 'aiVideo.audioNone' : 'aiVideo.audioOn', { label: m.label });

/** Model satırı + çözünürlük/süre seçicileri (web `AiVideoOptions`). Tek modelde seçici yok, satır var. */
function Options({ ai }: { ai: ReturnType<typeof useAiVideo> }) {
  const { form } = ai;
  const models = form.options?.models ?? [];
  return (
    <View style={styles.group}>
      {models.length === 1 ? (
        <Text style={styles.model}>{audioLabel(models[0])}</Text>
      ) : models.length > 1 ? (
        <Segmented
          label={t('aiVideo.modelLabel')}
          options={models.map((m) => ({ value: m.key, text: audioLabel(m) }))}
          value={form.model}
          onChange={form.pickModel}
        />
      ) : null}
      {form.current ? (
        <>
          <Segmented
            label={t('aiVideo.resolutionLabel')}
            options={form.current.resolutions.map((r) => ({ value: r, text: r }))}
            value={form.resolution}
            onChange={form.setResolution}
          />
          <Segmented
            label={t('aiVideo.durationLabel')}
            options={form.current.durations.map((d) => ({ value: d, text: t('aiVideo.durationOption', { sec: d }) }))}
            value={form.durationS}
            onChange={form.setDurationS}
          />
        </>
      ) : null}
    </View>
  );
}

/** İstem + isteğe bağlı görsel (web `AiVideoDialog` form gövdesi). */
export function AiVideoForm({ ai }: { ai: ReturnType<typeof useAiVideo> }) {
  const { image } = ai;
  return (
    <View style={styles.group}>
      <Options ai={ai} />
      <View style={styles.field}>
        <Text style={styles.label}>{t('aiVideo.promptLabel')}</Text>
        <TextInput
          value={ai.prompt}
          onChangeText={ai.setPrompt}
          maxLength={PROMPT_MAX}
          multiline
          placeholder={t('aiVideo.promptPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
      </View>
      <View style={styles.imageRow}>
        {image.image ? <Image source={{ uri: image.image.uri }} style={styles.thumb} resizeMode="cover" /> : null}
        <Pressable onPress={() => void image.pick()} style={styles.ghost} accessibilityRole="button">
          <Text style={styles.ghostText}>{image.image ? t('aiVideo.imageChange') : t('aiVideo.imageAdd')}</Text>
        </Pressable>
        {image.image ? (
          <Pressable onPress={image.clear} style={styles.ghost} accessibilityRole="button">
            <Text style={styles.ghostText}>{t('aiVideo.imageRemove')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.hint}>{t('aiVideo.imageHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 14 },
  model: { color: theme.colors.textPrimary, fontSize: theme.fontSize.md },
  field: { gap: 6 },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  input: {
    minHeight: 88,
    maxHeight: 160,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgContent,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    padding: 12,
    textAlignVertical: 'top',
  },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  thumb: { width: 48, height: 48, borderRadius: theme.radius.sm },
  ghost: {
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  ghostText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: -6 },
});
