import * as ImagePicker from 'expo-image-picker';
// SDK 54'te `expo-file-system` yeni File/Directory API'sine geçti; `uploadAsync` LEGACY yolda kaldı.
// Yeni API'de doğrudan karşılığı yok, bu yüzden legacy içe aktarım bilinçli.
import * as FileSystem from 'expo-file-system/legacy';
import { ALLOWED_IMAGE_TYPES, type PresignResult } from '@/api/users';

/**
 * Profil görseli seç + yükle (M1d-C §3.3).
 *
 * 🔴 **Bu yol yalnız KULLANICININ KENDİ profili içindir.** M1d §10.3 kuralı duruyor: ortam ikonu ve
 * afişi mobilde yalnız GÖSTERİLİR, yüklenmez. Sahip 2026-08-01'de istisnayı yalnız profil için verdi.
 *
 * Akış sunucunun tanımladığı üç adım: `presign` → dosyayı **doğrudan depolamaya** PUT → `storageKey`
 * ile PATCH. İkinci adım API sunucusundan geçmez; bu yüzden `http` instance'ı değil `uploadAsync`
 * kullanılır (token gitmemeli, presigned URL zaten yetkiyi taşıyor).
 */

/** Sunucu 2 MB sınırı uyguluyor (`settings.avatar.errorSize`); istemci de aynı sınırı erken söyler. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type PickedImage = { uri: string; contentType: string; size: number };

/** Galeriden görsel seç. İptal → null. İzin reddedilirse de null (çağıran sessizce durur). */
export async function pickImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  // Seçicinin bildirdiği tür sunucunun listesinde yoksa JPEG varsayılır: kamera/galeri bazen
  // `image/*` gibi genel tür bildiriyor ve sunucu bunu reddederdi.
  const contentType =
    asset.mimeType && ALLOWED_IMAGE_TYPES.includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';

  return { uri: asset.uri, contentType, size: asset.fileSize ?? 0 };
}

/**
 * Presign sonucunu kullanarak dosyayı depolamaya yükler. Depolama 2xx dönmezse hata fırlatır —
 * sessizce başarılı sayılırsa `storageKey` boş bir nesneye işaret ederdi (kırık görsel).
 */
export async function putImage(presign: PresignResult, image: PickedImage): Promise<void> {
  const res = await FileSystem.uploadAsync(presign.uploadUrl, image.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': image.contentType },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`upload_failed_${res.status}`);
  }
}
