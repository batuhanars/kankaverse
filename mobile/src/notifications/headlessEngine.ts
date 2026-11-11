import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccessToken, refreshAccessToken } from '@/api/http';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { initE2ee } from '@/stores/e2ee';

/**
 * Uygulama kapalıyken (başsız görevler) E2EE motorunu kurmak için kullanıcı kimliği gerekir. Bildirim
 * çözmesi (E3 Rev.2) yalnız `loadCachedUserId`'yi kullanır, ağlı `prepareHeadlessEngine` yalnız hızlı cevaptır; auth store boştur. Kimlik oturum açıkken buraya yazılır (`ownAvatar.ts`
 * deseni), görev ağ çağrısı yapmadan okur. YALNIZ kullanıcı kimliği saklanır, token YOK; çıkışta silinir.
 */
const KEY = 'kv.cachedUserId';

export async function loadCachedUserId(): Promise<string | null> {
  try {
    const id = await AsyncStorage.getItem(KEY);
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

async function persist(id: string | null): Promise<void> {
  try {
    if (id) await AsyncStorage.setItem(KEY, id);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // yazılamazsa görev `authApi.me()`ye düşer
  }
}

/** Kök layout'ta bir kez bağlanır: oturum açılınca kimliği yazar, çıkışta siler. */
export function useCachedUserIdPersistence(): void {
  useEffect(() => {
    let last: string | null | undefined;
    const sync = () => {
      const { user, status } = useAuthStore.getState();
      if (status === 'authenticated' && user) {
        if (user.id !== last) {
          last = user.id;
          void persist(user.id);
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

/**
 * Başsız görevler için motoru hazırlar: erişim anahtarı yoksa yenilenir, kullanıcı kimliği (store →
 * önbellek → `authApi.me()`) bulunur, `initE2ee` çağrılır (motor zaten bu kullanıcı için varsa yeniden
 * kurulmaz). Hata fırlatır; çağıran karar verir (hızlı cevap: gönderilemedi, bildirim: genel metin).
 */
export async function prepareHeadlessEngine(): Promise<void> {
  if (!getAccessToken()) await refreshAccessToken();
  const userId =
    useAuthStore.getState().user?.id ?? (await loadCachedUserId()) ?? (await authApi.me()).id;
  await initE2ee(userId);
}
