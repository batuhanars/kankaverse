import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import type { PickedFile } from './attachmentDraft';

/**
 * C80 — panodaki görseli ek olarak gönderme. Klavyenin kendi "Pano" bölmesinden görsel yapıştırmak mesaj
 * kutusunun zengin içerik kabul etmesini ister (RN çekirdeğinde yok, native modül gerekir); onun yerine
 * `+` panelinde bir satır. `expo-clipboard` zaten kurulu, yeni native kod yok.
 *
 * Gizlilik: pano YALNIZ kullanıcı satıra dokununca okunur. Satırın görünüp görünmeyeceği için yalnız
 * "görsel var mı" sorulur (içerik okunmaz).
 */
export async function clipboardHasImage(): Promise<boolean> {
  try {
    return await Clipboard.hasImageAsync();
  } catch {
    return false;
  }
}

/** Panodaki görseli önbelleğe PNG olarak yazar; yükleme hattı `file://` yolu okur. Görsel yoksa null. */
export async function readClipboardImage(): Promise<PickedFile | null> {
  const image = await Clipboard.getImageAsync({ format: 'png' });
  if (!image) return null;
  const base64 = image.data.replace(/^data:image\/\w+;base64,/, '');
  const name = `pano-${Date.now()}.png`;
  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return {
    uri,
    filename: name,
    contentType: 'image/png',
    width: image.size.width,
    height: image.size.height,
  };
}
