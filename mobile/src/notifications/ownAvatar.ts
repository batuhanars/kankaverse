import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/auth';

/**
 * C52 Revize 1 §2.1: sohbet bildirimindeki "ben" satırları için kullanıcının kendi statik avatarı.
 * Uygulama kapalıyken (arka plan görevleri) auth store boştur; bu yüzden herkese açık avatar adresi
 * oturum açıkken buraya yazılır, görevler buradan okur. Token/kişisel veri YOK; çıkışta silinir.
 */
const KEY = 'kv.ownAvatarUrl';

export async function loadOwnAvatarUrl(): Promise<string | null> {
  try {
    const url = await AsyncStorage.getItem(KEY);
    return url && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

async function persist(url: string | null): Promise<void> {
  try {
    if (url) await AsyncStorage.setItem(KEY, url);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // bildirim simgesi kozmetik; yazılamazsa varsayılan simge kalır
  }
}

/** Kök layout'ta bir kez bağlanır: kullanıcı yüklenince/değişince yazar, çıkışta siler. */
export function useOwnAvatarPersistence(): void {
  useEffect(() => {
    let last: string | null | undefined;
    const sync = () => {
      const { user, status } = useAuthStore.getState();
      if (status === 'authenticated' && user) {
        const url = user.avatarUrl ?? null;
        if (url !== last) {
          last = url;
          void persist(url);
        }
      } else if (status === 'unauthenticated' && last !== null) {
        last = null;
        void persist(null);
      }
    };
    sync();
    return useAuthStore.subscribe(sync);
  }, []);
}
