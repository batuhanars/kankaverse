import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { attachmentsApi } from '@/api/attachments';
import { ScanStatus, type ReplyAttachmentDto } from '@/api/messages';
import { t } from '@/i18n';

// Yanıt alıntısı (baloncuk), yanıt şeridi (mesaj kutusu) ve iletme önizlemesi aynı ek özetini çiziyor:
// türe göre simge + etiket, görsel/videoda küçük resim. Web karşılığı: ReplyQuote.vue + useAttachmentThumb.

type Kind = 'image' | 'video' | 'audio' | 'file';

const KIND_ICON: Record<Kind, ComponentProps<typeof Ionicons>['name']> = {
  image: 'image-outline',
  video: 'videocam-outline',
  audio: 'mic-outline',
  file: 'document-outline',
};

function kindOf(contentType: string): Kind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'file';
}

export function attachmentIcon(att: ReplyAttachmentDto) {
  return KIND_ICON[kindOf(att.contentType)];
}

/**
 * Alıntıda görünecek metin. Sunucu ek-yalnız mesajda "[dosya]" yollar (eski sürümler için); ek bilgisi
 * varsa onun yerine "Fotoğraf"/"Video"/"Sesli mesaj" ya da dosya adı yazılır.
 */
export function replyBody(text: string, att: ReplyAttachmentDto | null | undefined): string {
  const trimmed = text.trim();
  if (att && (!trimmed || trimmed === '[dosya]')) {
    const kind = kindOf(att.contentType);
    return kind === 'file' ? att.filename : t(`reply.kind.${kind}`);
  }
  return trimmed;
}

/**
 * Küçük önizleme adresi: video → mesajdaki base64 kare; görsel → kısa ömürlü adres, YALNIZ tarama
 * CLEAN ise (AttachmentView ile aynı T&S kapısı). Diğer türlerde null. Önizleme kozmetik: hata sessiz.
 */
export function useAttachmentThumb(att: ReplyAttachmentDto | null | undefined): string | null {
  const id = att?.id ?? null;
  const contentType = att?.contentType ?? '';
  const scanStatus = att?.scanStatus;
  const videoThumb = att?.thumbnail ?? null;
  const [imageUri, setImageUri] = useState<{ id: string; uri: string } | null>(null);

  useEffect(() => {
    if (!id || !contentType.startsWith('image/') || scanStatus !== ScanStatus.CLEAN) return;
    let cancelled = false;
    attachmentsApi
      .getUrl(id)
      .then((res) => {
        if (!cancelled) setImageUri({ id, uri: res.url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, contentType, scanStatus]);

  if (!id) return null;
  if (contentType.startsWith('video/')) return videoThumb ? `data:image/jpeg;base64,${videoThumb}` : null;
  return imageUri?.id === id ? imageUri.uri : null;
}
