import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoViewer } from './VideoViewer';
import { attachmentsApi } from '@/api/attachments';
import { extractErrorMessage } from '@/api/errors';
import type { AttachmentDto } from '@/api/messages';
import { useVoicePlaybackStore } from '@/stores/voicePlayback';
import { formatClock } from '@/utils/formatClock';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M6c §2/§3.4 — sohbette video: küçük resim kartı (`thumbnail` zemin, ortada yarı saydam ▶,
 * sağ altta süre). Oran `width/height`'tan, yoksa 16:9. Otomatik oynatma YOK; dokununca tam ekran.
 *
 * Çağıran (`AttachmentView`) `scanStatus === CLEAN` kapısını geçirmiş olarak çizer. Adres dokunuş
 * anında alınır (presigned GET 300 sn ömürlü; kart saatlerce açık kalabilir).
 */
export function VideoCard({ attachment }: { attachment: AttachmentDto }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 16 / 9;

  function openViewer() {
    // Video açılınca çalan sesli mesaj durur (M6b §8.3 merkezi durum).
    useVoicePlaybackStore.getState().stopAll();
    setOpen(true);
    setUrl(null);
    setError('');
    attachmentsApi
      .getUrl(attachment.id)
      .then((res) => setUrl(res.url))
      .catch((e) => setError(extractErrorMessage(e)));
  }

  return (
    <>
      <Pressable
        onPress={openViewer}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.video.play')}
        style={[styles.card, { aspectRatio: ratio }]}
      >
        {attachment.thumbnail ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${attachment.thumbnail}` }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.playCircle}>
          <Ionicons name="play" size={24} color={theme.colors.textPrimary} />
        </View>
        {attachment.durationMs ? (
          <View style={styles.duration}>
            <Text style={styles.durationText}>{formatClock(attachment.durationMs)}</Text>
          </View>
        ) : null}
      </Pressable>

      <VideoViewer visible={open} url={url} errorMessage={error} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 6,
    width: 220,
    maxWidth: '100%',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  durationText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
