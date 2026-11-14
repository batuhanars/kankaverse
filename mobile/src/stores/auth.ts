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
import { isDefinitiveRefreshRejection, retryTransient } from '@/api/refreshRejection';
import { resetSocket } from '@/realtime/socket';
import { clearPushToken } from '@/notifications/push';
import { clearResume } from '@/utils/resumeLastScreen';
import { releaseE2ee, wipeE2ee } from '@/stores/e2ee';

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
  /** `wipeE2ee` yalnız hesap silmede true: yerel şifreli depo da silinir. Aksi hâlde cihaz park edilir (C69). */
  logout: (opts?: { wipeE2ee?: boolean }) => Promise<void>;
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

// D97: açılışta geçici hata (ağ/zaman aşımı/5xx) olursa 1 sn, sonra 3 sn bekleyip yeniden dener.
const BOOTSTRAP_RETRY_DELAYS_MS = [1000, 3000] as const;

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
        // Geçici hatada splash'ta kalıp 2 kez daha dener; kesin red beklemeden düşer.
        const user = await retryTransient(
          async () => {
            await refreshAccessToken();
            return authApi.me();
          },
          BOOTSTRAP_RETRY_DELAYS_MS,
          isDefinitiveRefreshRejection,
        );
        set({ user, status: 'authenticated' });
      } catch (e) {
        // D97: ağ/zaman aşımı/5xx oturumu bitirmez. Token ve şifreli depo korunur (bir sonraki açılış
        // yeniden dener); yalnız kesin red (401/403/token yok) oturumu siler.
        if (isDefinitiveRefreshRejection(e)) {
          clearAccessToken();
          await clearRefreshToken();
          // C69: yerel şifreli depo SİLİNMEZ (cihaz sunucuda park edilmiş olabilir). Sonraki girişte rebind
          // denenir; reddedilirse motor depoyu kendisi siler, başka kullanıcınınkini giriş siler.
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
  async logout(opts) {
    const wipe = opts?.wipeE2ee === true;
    // Sprint M3 §3 — T&S: cihazı bırakan kullanıcının push'u bir sonrakine düşmesin. 🔴 Sunucu
    // çıkışından ÖNCE çağrılır: uç `Authorization` ister ve JwtStrategy iptal edilmiş oturumun
    // access token'ını reddeder. Çıkıştan sonra çağrılınca 401 alıyor, token sunucuda asılı kalıyor,
    // çıkış yapmış cihaza bildirim gelmeye devam ediyordu (sahip bulgusu 2026-11-14).
    await clearPushToken();
    try {
      await authApi.logout({ keepE2eeDevice: !wipe });
    } catch {
      // yerel temizlik yine de yapılır
    } finally {
      // C38 — kaldığın yerden aç kaydı çıkışta silinir (kullanıcı kimliği silinmeden önce).
      await clearResume(get().user?.id);
      clearAccessToken();
      await clearRefreshToken();
      resetSocket();
      // C69: çıkışta motor düşer, yerel depo kalır (cihaz park). Hesap silmede her şey silinir.
      if (wipe) await wipeE2ee();
      else releaseE2ee();
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
  // C69: oturum sunucuda düştü; cihaz park EDİLMEMİŞ (iptal) olabilir ama yerel depo SİLİNMEZ: sonraki girişte
  // ensureDevice rebind dener, sunucu reddederse depoyu kendisi siler. Motor yalnız bellekten düşer.
  releaseE2ee();
  useAuthStore.setState({ user: null, status: 'unauthenticated', challenge: null, errorMessage: null });
});
