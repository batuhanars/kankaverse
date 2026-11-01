import { StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { AiVideoAttachments } from './AiVideoAttachments';
import { AiVideoPrompt } from './AiVideoPrompt';
import { Segmented } from './Segmented';
import type { useAiVideo } from './useAiVideo';

/** Birden çok model açıksa seçici (etiket + sesli/sessiz); tek modelde bilgi gösterilmez (C42 §2). */
function ModelRow({ ai }: { ai: ReturnType<typeof useAiVideo> }) {
  const { form } = ai;
  const models = form.options?.models ?? [];
  if (models.length < 2) return null;
  const audioLabel = (m: { audio: string; label: string }) =>
    t(m.audio === 'none' ? 'aiVideo.audioNone' : 'aiVideo.audioOn', { label: m.label });
  return (
    <Segmented
      label={t('aiVideo.modelLabel')}
      options={models.map((m) => ({ value: m.key, text: audioLabel(m) }))}
      value={form.model}
      onChange={form.pickModel}
    />
  );
}

/** Bilinmeyen sağlayıcı değeri arayüzü kırmaz: etiket yoksa oranın kendisi yazılır. */
const ratioLabel = (r: string) => {
  const key = `aiVideo.ratio.r${r.replace(':', 'x')}`;
  const label = t(key);
  return label === key ? r : label; // t eksik anahtarda anahtarı döner
};

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
          {ai.refs.mode === 'image' && form.aspectRatios.length === 0 ? (
            <Text style={styles.hint}>{t('aiVideo.aspectFromImage')}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** C42 sırası: model (yalnız çoklu), ekler, istem (@ ile), seçenekler. */
export function AiVideoForm({ ai }: { ai: ReturnType<typeof useAiVideo> }) {
  const { refs } = ai;
  const refsOption = ai.form.current?.references ?? null;
  return (
    <View style={styles.group}>
      <ModelRow ai={ai} />
      {refsOption ? (
        <AiVideoAttachments
          refs={refsOption}
          items={refs.items}
          labels={refs.labels}
          thumbs={refs.thumbs}
          mode={refs.mode}
          error={refs.addError}
          disabled={ai.locked}
          onPickMedia={() => void refs.pickMedia()}
          onPickAudio={() => void refs.pickAudio()}
          onRemove={ai.removeRef}
        />
      ) : null}
      <View style={styles.field}>
        <Text style={styles.label}>{t('aiVideo.promptLabel')}</Text>
        <AiVideoPrompt
          value={ai.prompt}
          onChange={ai.setPrompt}
          items={refs.items}
          labels={refs.labels}
          thumbs={refs.thumbs}
          editable={!ai.locked}
        />
      </View>
      <Options ai={ai} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 14 },
  field: { gap: 6 },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: -6 },
});
