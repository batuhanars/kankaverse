import { create } from 'zustand';
import { authApi, type RegisterPayload, type UserDto } from '@/api/auth';
import { extractErrorMessage } from '@/api/errors';
import {
  clearAccessToken,
  clearRefreshToken,
  getRefreshToken,
  refreshAccessToken,
  setAccessToken,
  setRefreshToken,
  setSessionExpiredHandler,
} from '@/api/http';
import { isDefinitiveRefreshRejection } from '@/api/refreshRejection';
import { resetSocket } from '@/realtime/socket';
import { clearPushToken } from '@/notifications/push';
import { clearResume } from '@/utils/resumeLastScreen';
import { wipeE2ee } from '@/stores/e2ee';

export type AuthStatus = 'booting' | 'authenticated' | 'unauthenticated';
export type LoginResult = 'ok' | 'challenge' | 'error';

interface Challenge {
  challengeToken: string;
}

interface AuthState {
  status: AuthStatus;
  user: UserDto | null;
  challenge: Challenge | null;
  errorMessage: string | null;
  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  loginTwoFa: (code: string) => Promise<'ok' | 'error'>;
  /**
   * Sprint M1c contract §2/§4 — rıza onayından SONRA (ConsentModal "Okudum, kabul ediyorum") çağrılır.
   * 🔴 R7: hata dallanması YOK — `UNDERAGE`/`INVALID_BIRTHDATE`/`USERNAME_TAKEN`/... hepsi
   * `extractErrorMessage` ile sunucunun Türkçe metni olduğu gibi gösterilir (login() ile aynı desen).
   * Yaş kararını burada yeniden yorumlamak/yumuşatmak YASAK.
   */
  register: (payload: RegisterPayload) => Promise<'ok' | 'error'>;
  logout: () => Promise<void>;
  /** 2FA ekranından girişe geri dönerken challenge + hata state'ini temizler. */
  clearChallenge: () => void;
  /** Sunucudan dönen güncel kullanıcıyı store'a yazar (profil/ayar kaydı sonrası). */
  updateUser: (user: UserDto) => void;
}

// Tek uçuş bootstrap (PM bulgusu 2026-07-29): kök layout'taki effect dev'de (StrictMode +
// Fast Refresh) birden çok kez tetiklenebiliyor. bootstrap() eşzamanlı/tekrar çağrılarda AYNI
// promise'i paylaşsın diye modül seviyesinde tutuluyor (http.ts'teki refreshPromise dedup
// deseniyle aynı mantık) — store state'i değil, çünkü render'a bağlı olmamalı.
let bootstrapPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'booting',
  user: null,
  challenge: null,
  errorMessage: null,

  // Contract §4 — bootstrap İKİ adımdır: (1) /auth/refresh → access token, (2) /auth/me →
  // kullanıcı. refresh yalnız token döner, kullanıcı dönmez. İkisi de başarılı → authenticated.
  // Herhangi biri başarısız → secure store temizlenir, unauthenticated (giriş ekranı).
  bootstrap() {
    if (bootstrapPromise) {
      return bootstrapPromise;
    }
    bootstrapPromise = (async () => {
      try {
        const existingRefresh = await getRefreshToken();
        if (!existingRefresh) {
          set({ status: 'unauthenticated' });
          return;
        }
        await refreshAccessToken();
        const user = await authApi.me();
        set({ user, status: 'authenticated' });
      } catch (e) {
        // D97: ağ/zaman aşımı/5xx oturumu bitirmez. Token ve şifreli depo korunur (bir sonraki açılış
        // yeniden dener); yalnız kesin red (401/403/token yok) oturumu siler.
        if (isDefinitiveRefreshRejection(e)) {
          clearAccessToken();
          await clearRefreshToken();
          await wipeE2ee(); // oturum yok: yerel şifreli depo kimseye ait değil
        }
        set({ user: null, status: 'unauthenticated' });
      }
    })();
    return bootstrapPromise;
  },

  async login(identifier, password) {
    set({ errorMessage: null });
    try {
      const result = await authApi.login({ identifier, password });
      if ('twoFactorRequired' in result) {
        set({ challenge: { challengeToken: result.challengeToken } });
        return 'challenge';
      }
      // E1: yeni giriş = yeni oturum zinciri = yeni şifreleme cihazı. Eski oturumdan kalan yerel şifreli
      // depo bu oturuma ait değildir (cihaz kimliği/anahtarı uyuşmaz) ve başka hesaba ait olabilir: silinir.
      await wipeE2ee();
      setAccessToken(result.accessToken);
      if (result.refreshToken) {
        await setRefreshToken(result.refreshToken);
      }
      set({ user: result.user, status: 'authenticated', challenge: null });
      return 'ok';
    } catch (e) {
      set({ errorMessage: extractErrorMessage(e) });
      return 'error';
    }
  },

  async loginTwoFa(code) {
    const challenge = get().challenge;
    if (!challenge) return 'error';
    set({ errorMessage: null });
    try {
      const result = await authApi.loginTwoFa(challenge.challengeToken, code);
      // E1: yeni giriş = yeni oturum zinciri = yeni şifreleme cihazı. Eski oturumdan kalan yerel şifreli
      // depo bu oturuma ait değildir (cihaz kimliği/anahtarı uyuşmaz) ve başka hesaba ait olabilir: silinir.
      await wipeE2ee();
      setAccessToken(result.accessToken);
      if (result.refreshToken) {
        await setRefreshToken(result.refreshToken);
      }
      set({ user: result.user, status: 'authenticated', challenge: null });
      return 'ok';
    } catch (e) {
      set({ errorMessage: extractErrorMessage(e) });
      return 'error';
    }
  },

  async register(payload) {
    set({ errorMessage: null });
    try {
      const result = await authApi.register(payload);
      // E1: yeni giriş = yeni oturum zinciri = yeni şifreleme cihazı. Eski oturumdan kalan yerel şifreli
      // depo bu oturuma ait değildir (cihaz kimliği/anahtarı uyuşmaz) ve başka hesaba ait olabilir: silinir.
      await wipeE2ee();
      setAccessToken(result.accessToken);
      if (result.refreshToken) {
        await setRefreshToken(result.refreshToken);
      }
      set({ user: result.user, status: 'authenticated', challenge: null });
      return 'ok';
    } catch (e) {
      set({ errorMessage: extractErrorMessage(e) });
      return 'error';
    }
  },

  // Contract §4 — sunucu hata verse bile yerel temizlik yapılır.
  async logout() {
    try {
      await authApi.logout();
    } catch {
      // yerel temizlik yine de yapılır
    } finally {
      // Sprint M3 §3 — T&S: cihazı bırakan kullanıcının push'u bir sonrakine düşmesin. Access
      // token TEMİZLENMEDEN önce çağrılır — uç `Authorization` ister (kendi token'ını sil), sıra
      // değişirse 401 alır ve token sunucuda asılı kalır.
      await clearPushToken();
      // C38 — kaldığın yerden aç kaydı çıkışta silinir (kullanıcı kimliği silinmeden önce).
      await clearResume(get().user?.id);
      clearAccessToken();
      await clearRefreshToken();
      resetSocket();
      await wipeE2ee(); // çıkışta tüm yerel şifreli depo silinir (E1 §5)
      set({ user: null, status: 'unauthenticated', challenge: null, errorMessage: null });
    }
  },

  clearChallenge() {
    set({ challenge: null, errorMessage: null });
  },

  updateUser(user) {
    set({ user });
  },
}));

// PM bulgusu (2026-07-29): oturum sunucu tarafında düşünce (reuse-detection, başka cihazdan
// çıkış, token süresi) http.ts'in 401 handler'ı refresh'i dener; o da başarısızsa access+refresh
// temizleniyordu ama store'un `status`'ü 'authenticated' kalıyordu → (app) grubunda guard
// olmadığı için kullanıcı ortam listesinde "bağlanılamadı, tekrar dene" döngüsünde kilitli
// kalıyordu. http.ts store'u import edemez (döngü) — bunun yerine store kendini bir callback
// olarak kaydediyor; http.ts yalnız bu callback'i tetikliyor.
setSessionExpiredHandler(() => {
  resetSocket();
  void wipeE2ee(); // oturum zinciri bitti: cihaz sunucuda iptal edildi, yerel depo artık geçersiz
  useAuthStore.setState({ user: null, status: 'unauthenticated', challenge: null, errorMessage: null });
});
