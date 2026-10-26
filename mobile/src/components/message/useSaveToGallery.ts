import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { attachmentsApi } from '@/api/attachments';
import { extractErrorMessage } from '@/api/errors';
import { t } from '@/i18n';

/** Kaydedilecek ekin görüntüleyiciye taşınan asgari bilgisi (`AttachmentDto`nun alt kümesi). */
export interface SaveTarget {
  id: string;
  filename: string;
  contentType: string;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** Önbellek dosyasının uzantısı: MIME türü otorite (galeri türü uzantıdan çıkarır), yoksa dosya adından. */
function extensionFor(target: SaveTarget): string {
  const byType = EXT_BY_TYPE[target.contentType.toLowerCase()];
  if (byType) return byType;
  const match = /\.([a-z0-9]{1,5})$/i.exec(target.filename);
  return match ? match[1].toLowerCase() : 'bin';
}

/**
 * Sprint C15 §3 — sohbet medyasını galeriye kaydet.
 *
 * Akış: izin (yalnız yazma) → TAZE adres → önbelleğe indir → `saveToLibraryAsync` → önbellek dosyasını sil.
 * Adres her kayıtta `GET /attachments/:id`'den yeniden alınır: presigned GET 300 sn ömürlü, görüntüleyici
 * saatlerce açık kalabilir; ayrıca erişim ve tarama kapısı sunucuda ikinci kez doğrulanır.
 * `saving` bayrağı çift tetiklemeyi engeller (state gecikmeli olduğu için ref ile de korunur).
 */
export function useSaveToGallery(target: SaveTarget | undefined) {
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);

  const save = useCallback(async () => {
    if (!target || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    let localUri: string | null = null;
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert(t('mobile.media.permissionDenied'));
        return;
      }
      const { url } = await attachmentsApi.getUrl(target.id);
      const dir = FileSystem.cacheDirectory;
      if (!dir) throw new Error('no cache dir');
      const dest = `${dir}kv-save-${target.id}.${extensionFor(target)}`;
      localUri = dest;
      const result = await FileSystem.downloadAsync(url, dest);
      if (result.status < 200 || result.status >= 300) throw new Error(`download ${result.status}`);
      await MediaLibrary.saveToLibraryAsync(dest);
      Alert.alert(t('mobile.media.saved'));
    } catch (e) {
      // Sunucu reddi (ATTACHMENT_BLOCKED vb.) Türkçe mesajıyla gelir; diğer hatalar genel metin.
      const message = extractErrorMessage(e);
      Alert.alert(message && message !== t('common.error') ? message : t('mobile.media.saveFailed'));
    } finally {
      if (localUri) await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
      busyRef.current = false;
      setSaving(false);
    }
  }, [target]);

  return { save, saving };
}
