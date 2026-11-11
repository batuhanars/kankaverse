import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * D94: "Bildirimlerde mesaj içeriğini göster" cihaz ayarı. Sunucuya gitmez; başsız görev (auth store boş)
 * okuyabilsin diye AsyncStorage'da durur (`ownAvatar.ts` deseni, ağsız). Cihaz ayarıdır: çıkışta sıfırlanmaz.
 * Saklanan değer "gizle" bayrağıdır; kayıt yoksa ya da okunamazsa içerik GÖSTERİLİR (varsayılan açık).
 */
const KEY = 'kv.hideNotificationPreview';

export async function loadHidePreview(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveHidePreview(hide: boolean): Promise<void> {
  try {
    if (hide) await AsyncStorage.setItem(KEY, '1');
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // yazılamazsa ayar eski değerinde kalır
  }
}
