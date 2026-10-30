import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createVideoThumbnail } from 'react-native-compressor';
import type { SharedFile } from '@/stores/shareIntent';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** C41 - Paylaşılan içeriğin üstteki önizlemesi: görsel / video karesi / dosya adı+boyut / metin. */
function sizeLabel(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return t('mobile.share.sizeMb', { size: (bytes / (1024 * 1024)).toFixed(1) });
  return t('mobile.share.sizeKb', { size: Math.max(1, Math.round(bytes / 1024)) });
}

function FileThumb({ file }: { file: SharedFile }) {
  const isImage = !!file.mimeType?.startsWith('image/');
  const isVideo = !!file.mimeType?.startsWith('video/');
  const [frame, setFrame] = useState<string | null>(null);

  useEffect(() => {
    if (!isVideo) return;
    let cancelled = false;
    createVideoThumbnail(file.uri)
      .then((f) => !cancelled && setFrame(f.path))
      .catch(() => {}); // kare bir kolaylık: yoksa ikon kalır
    return () => {
      cancelled = true;
    };
  }, [file.uri, isVideo]);

  const imageUri = isImage ? file.uri : frame;
  if (imageUri) {
    return (
      <View style={styles.thumbBox}>
        <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        {isVideo ? (
          <Ionicons name="play-circle" size={26} color={theme.colors.textPrimary} style={styles.play} />
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.thumbBox, styles.fileBox]}>
      <Ionicons name={isVideo ? 'videocam' : 'document-outline'} size={26} color={theme.colors.textSecondary} />
      <Text style={styles.fileName} numberOfLines={2}>
        {file.fileName ?? t('mobile.share.fileFallback')}
      </Text>
      <Text style={styles.fileSize}>{sizeLabel(file.size)}</Text>
    </View>
  );
}

export function SharePreview({ files, text }: { files: SharedFile[]; text: string | null }) {
  if (files.length === 0 && !text) return null;
  return (
    <View style={styles.wrap}>
      {files.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {files.map((f) => (
            <FileThumb key={f.uri} file={f} />
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.text} numberOfLines={3}>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    margin: theme.layout.panelGap,
    marginBottom: 4,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgSidebar,
    padding: 10,
  },
  strip: { gap: 8 },
  thumbBox: {
    width: 84,
    height: 84,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.bgElevated,
  },
  thumb: { width: '100%', height: '100%' },
  play: { position: 'absolute', right: 4, bottom: 4 },
  fileBox: { alignItems: 'center', justifyContent: 'center', padding: 6, gap: 2 },
  fileName: { color: theme.colors.textBody, fontSize: theme.fontSize.xs, textAlign: 'center' },
  fileSize: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  text: { color: theme.colors.textBody, fontSize: theme.fontSize.base },
});
