import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { attachmentsApi } from '@/api/attachments';
import { ScanStatus, type AttachmentDto } from '@/api/messages';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §5.5 (🔴 T&S kapısı) — web/src/components/shared/AttachmentView.vue ile
// BİREBİR aynı kural: mesajdaki ek nesnesi URL içermez, adres GET /attachments/:id'den alınır.
// scanStatus CLEAN değilse görsel YÜKLENMEZ. Bu bir T&S kapısıdır — kapıyı istemcide gevşetme.
export function AttachmentView({ attachment }: { attachment: AttachmentDto }) {
  const isImage = attachment.contentType.startsWith('image/');
  const isClean = attachment.scanStatus === ScanStatus.CLEAN;
  const isPending = attachment.scanStatus === ScanStatus.PENDING;
  const isFlagged = attachment.scanStatus === ScanStatus.FLAGGED;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!isImage || !isClean) return;
    let cancelled = false;
    attachmentsApi
      .getUrl(attachment.id)
      .then((res) => {
        if (!cancelled) setImageUrl(res.url);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, isImage, isClean]);

  if (isImage) {
    // PENDING — kural: "Görsel YÜKLENMEZ" (contract §5.5 tablosu). Taranmamış medya asla gösterilmez.
    if (isPending) {
      return (
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{t('attachment.processing')}</Text>
        </View>
      );
    }
    if (isFlagged) {
      return (
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{t('attachment.blocked')}</Text>
        </View>
      );
    }
    if (imageError) {
      return (
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{t('attachment.notReady')}</Text>
        </View>
      );
    }
    if (!imageUrl) {
      return (
        <View style={styles.statusBadge}>
          <ActivityIndicator size="small" color={theme.colors.textMuted} />
        </View>
      );
    }
    return <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />;
  }

  // Görsel değil — dosya adı rozeti (yükleme/indirme yok, yalnız gösterim; kapsam dışı).
  return (
    <View style={styles.fileBadge}>
      <Text style={styles.fileName} numberOfLines={1}>
        {attachment.filename}
      </Text>
      <Text style={styles.fileMeta}>
        {isPending ? t('attachment.processing') : isFlagged ? t('attachment.blocked') : formatBytes(attachment.size)}
      </Text>
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  statusBadge: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgElevated,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  image: {
    marginTop: 6,
    width: 220,
    height: 160,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgElevated,
  },
  fileBadge: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.bgElevated,
    maxWidth: 260,
  },
  fileName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    flexShrink: 1,
  },
  fileMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
});
