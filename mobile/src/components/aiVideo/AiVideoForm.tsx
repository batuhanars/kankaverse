import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { Segmented } from './Segmented';
import type { useAiVideo } from './useAiVideo';

const PROMPT_MAX = 1000;

const audioLabel = (m: { audio: string; label: string }) =>
  t(m.audio === 'none' ? 'aiVideo.audioNone' : 'aiVideo.audioOn', { label: m.label });

/** Bilinmeyen sağlayıcı değeri arayüzü kırmaz: etiket yoksa oranın kendisi yazılır. */
const ratioLabel = (r: string) => {
  const key = `aiVideo.ratio.r${r.replace(':', 'x')}`;
  const label = t(key);
  return label === key ? r : label; // t eksik anahtarda anahtarı döner
};

/** Model satırı (web `AiVideoOptions` üst kısmı). Tek modelde seçici yok, satır var. */
function ModelRow({ ai }: { ai: ReturnType<typeof useAiVideo> }) {
  const { form } = ai;
  const models = form.options?.models ?? [];
  if (models.length === 1) return <Text style={styles.model}>{audioLabel(models[0])}</Text>;
  if (models.length === 0) return null;
  return (
    <Segmented
      label={t('aiVideo.modelLabel')}
      options={models.map((m) => ({ value: m.key, text: audioLabel(m) }))}
      value={form.model}
      onChange={form.pickModel}
    />
  );
}

/** Çözünürlük/süre/ölçü seçicileri (web `AiVideoOptions` alt kısmı). */
function Options({ ai }: { ai: ReturnType<typeof useAiVideo> }) {
  const { form } = ai;
  return (
    <View style={styles.group}>
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
          <Segmented
            label={t('aiVideo.aspectLabel')}
            options={[
              { value: '', text: t('aiVideo.aspectAuto') },
              ...form.aspectRatios.map((r) => ({ value: r, text: ratioLabel(r) })),
            ]}
            value={form.aspectRatio}
            onChange={form.setAspectRatio}
          />
          {ai.image.image && form.aspectRatios.length === 0 ? (
            <Text style={styles.hint}>{t('aiVideo.aspectFromImage')}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** C14f sahip sırası: model, görsel, istem, seçenekler (web `AiVideoDialog` form gövdesi). */
export function AiVideoForm({ ai }: { ai: ReturnType<typeof useAiVideo> }) {
  const { image } = ai;
  return (
    <View style={styles.group}>
      <ModelRow ai={ai} />
      <View style={styles.imageRow}>
        {image.image ? <Image source={{ uri: image.image.uri }} style={styles.thumb} resizeMode="cover" /> : null}
        <Pressable
          onPress={() => void image.pick()}
          disabled={ai.locked}
          style={[styles.ghost, ai.locked && styles.off]}
          accessibilityRole="button"
          accessibilityState={{ disabled: ai.locked }}
        >
          <Text style={styles.ghostText}>{image.image ? t('aiVideo.imageChange') : t('aiVideo.imageAdd')}</Text>
        </Pressable>
        {image.image ? (
          <Pressable onPress={image.clear} style={styles.ghost} accessibilityRole="button">
            <Text style={styles.ghostText}>{t('aiVideo.imageRemove')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.hint}>{t('aiVideo.imageHint')}</Text>
      <View style={styles.field}>
        <Text style={styles.label}>{t('aiVideo.promptLabel')}</Text>
        <TextInput
          value={ai.prompt}
          onChangeText={ai.setPrompt}
          maxLength={PROMPT_MAX}
          multiline
          placeholder={t('aiVideo.promptPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          editable={!ai.locked}
          style={[styles.input, ai.locked && styles.off]}
        />
      </View>
      <Options ai={ai} />
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
  off: { opacity: 0.5 },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: -6 },
});
