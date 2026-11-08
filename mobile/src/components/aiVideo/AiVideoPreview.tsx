import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { AiVideoDto } from '@/api/aiVideo';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  row: AiVideoDto;
  mode: 'chat' | 'media' | 'view';
  busy: boolean;
  error: string;
  modelLabel?: string;
  onSave: () => void;
  onPrimary: () => void;
  onNew: () => void;
  onDelete: () => void;
}

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

const COPIED_MS = 1500;

function CopyPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }
  return (
    <Pressable onPress={copy} style={[styles.btn, styles.ghost, styles.copy]} accessibilityRole="button">
      <Text style={styles.ghostText}>{t(copied ? 'aiVideo.promptCopied' : 'aiVideo.copyPrompt')}</Text>
    </Pressable>
  );
}

/**
 * TEK videonun önizlemesi + düğmeleri (web `AiVideoPreviewModal`, C14b §4b-5). Düğmeler yalnız `row`a
 * bağlıdır; ekranda aynı anda başka videonun düğmesi bulunmaz (form bu görünümde kapalıdır).
 * Sohbetten: Galeriye kaydet + Kaydet ve gönder. Profil/ortam görselinden: Galeriye kaydet + Kullan.
 */
export function AiVideoPreview({ row, mode, busy, error, modelLabel, onSave, onPrimary, onNew, onDelete }: Props) {
  const meta = [modelLabel || row.model, t('aiVideo.durationOption', { sec: row.durationS }), row.resolution].join(' · ');
  return (
    <View style={styles.wrap}>
      {row.videoUrl ? <Player key={row.videoUrl} url={row.videoUrl} /> : null}
      <Text style={styles.prompt} selectable={!!row.prompt}>
        {row.prompt || t('aiVideo.fromImage')}
      </Text>
      {row.prompt ? <CopyPrompt text={row.prompt} /> : null}
      <Text style={styles.meta}>{meta}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable onPress={onSave} disabled={busy} style={[styles.btn, styles.ghost, busy && styles.off]} accessibilityRole="button">
          <Text style={styles.ghostText}>{t('mobile.media.save')}</Text>
        </Pressable>
        <Pressable onPress={onPrimary} disabled={busy} style={[styles.btn, styles.primary, busy && styles.off]} accessibilityRole="button">
          {busy ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.primaryText}>{t(mode === 'media' ? 'aiVideo.useAsMedia' : 'aiVideo.saveAndSend')}</Text>
          )}
        </Pressable>
        <Pressable onPress={onNew} disabled={busy} style={[styles.btn, styles.ghost, busy && styles.off]} accessibilityRole="button">
          <Text style={styles.ghostText}>{t('aiVideo.newOne')}</Text>
        </Pressable>
        <Pressable onPress={onDelete} disabled={busy} style={[styles.btn, styles.danger, busy && styles.off]} accessibilityRole="button">
          <Text style={styles.dangerText}>{t('aiVideo.delete')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radius.md, backgroundColor: theme.colors.bgRail },
  prompt: { color: theme.colors.textPrimary, fontSize: theme.fontSize.md },
  meta: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
  },
  off: { opacity: 0.5 },
  copy: { alignSelf: 'flex-start' },
  primary: { backgroundColor: theme.colors.accent500 },
  primaryText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.md, fontWeight: '700' },
  ghost: { backgroundColor: theme.colors.bgElevated },
  ghostText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },
  danger: { backgroundColor: theme.colors.dangerSubtle },
  dangerText: { color: theme.colors.danger, fontSize: theme.fontSize.md, fontWeight: '600' },
});
