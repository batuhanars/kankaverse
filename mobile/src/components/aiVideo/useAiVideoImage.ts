import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { aiVideoApi } from '@/api/aiVideo';
import { t } from '@/i18n';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EXT_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

export interface AiVideoImage {
  uri: string;
  contentType: string;
  size: number;
}

function typeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType && IMAGE_TYPES.includes(asset.mimeType)) return asset.mimeType;
  const name = (asset.fileName ?? asset.uri).toLowerCase();
  return EXT_TYPES[name.split('.').pop() ?? ''] ?? '';
}

async function sizeOf(asset: ImagePicker.ImagePickerAsset): Promise<number> {
  if (asset.fileSize) return asset.fileSize;
  const info = await FileSystem.getInfoAsync(asset.uri).catch(() => null);
  return info && info.exists && 'size' in info ? info.size : 0;
}

/**
 * Sprint C14d: isteğe bağlı başlangıç görseli. Galeriden seçilir (PNG/JPEG/WebP, en çok 10 MB; tür/boyut
 * erken kontrolü, otorite sunucu). `upload` presign alır ve doğrudan depolamaya PUT eder: presigned adrese
 * Authorization başlığı GİTMEZ (`http` kullanılmaz), ham depolama hata kodu kullanıcıya basılmaz.
 */
export function useAiVideoImage(onError: (message: string) => void) {
  const [image, setImage] = useState<AiVideoImage | null>(null);

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const contentType = typeOf(asset);
    if (!contentType) return onError(t('aiVideo.errors.imageType'));
    const size = await sizeOf(asset);
    if (size > MAX_IMAGE_BYTES) return onError(t('aiVideo.errors.imageSize'));
    onError('');
    setImage({ uri: asset.uri, contentType, size });
  }

  async function upload(img: AiVideoImage): Promise<string> {
    const { uploadUrl, inputKey } = await aiVideoApi.presignInput(img.contentType, img.size);
    const res = await FileSystem.uploadAsync(uploadUrl, img.uri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': img.contentType },
    });
    if (res.status < 200 || res.status >= 300) throw new Error('image_upload_failed');
    return inputKey;
  }

  return { image, pick, clear: () => setImage(null), upload };
}
