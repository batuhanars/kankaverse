import axios, { create as createAxios, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isDefinitiveRefreshRejection } from '@/api/refreshRejection';

// Sprint M0 contract §3 — hedefe göre değişir (README "Ortam Kurulumu"). Emülatör varsayılanı
// 10.0.2.2 (host makine); .env / .env.example bunu belgeler.
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001';

const REFRESH_TOKEN_KEY = 'kv_refresh_token';

// [D91] Aktif Oturumlar listesindeki cihaz adı, ör. "Android - Xiaomi Redmi Note 13". Üretici model
// adında zaten geçiyorsa tekrar edilmez; değer yoksa başlık gönderilmez. ASCII ile sınırlı:
// okhttp başlık değerinde non-ASCII karakteri reddeder.
function buildDeviceHeader(): string | null {
  const model = Device.modelName?.trim() ?? '';
  const maker = Device.manufacturer?.trim() ?? '';
  const name =
    maker && !model.toLowerCase().includes(maker.toLowerCase()) ? `${maker} ${model}`.trim() : model || maker;
  if (!name) return null;
  const os = Platform.OS === 'ios' ? 'iOS' : 'Android';
  return `${os} - ${name}`.replace(/[^ -~]/g, '').slice(0, 60);
}

const DEVICE_HEADER = buildDeviceHeader();

function clientHeaders(): Record<string, string> {
  return DEVICE_HEADER
    ? { 'X-Client-Type': 'mobile', 'X-Client-Device': DEVICE_HEADER }
    : { 'X-Client-Type': 'mobile' };
}

// Access token contract §4 — YALNIZ bellekte. Diske asla yazılmaz; uygulama kapanınca gider,
// bootstrap (refresh → /auth/me) tazeler.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

// Refresh token contract §4 — YALNIZ expo-secure-store. AsyncStorage'a asla yazılmaz.
export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export function clearRefreshToken(): Promise<void> {
  return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// Timeout ZORUNLU (sahip bulgusu 2026-07-30, fiziksel cihaz): `EXPO_PUBLIC_API_URL` ulaşılamaz bir
// adresi gösterdiğinde (ör. telefonda emülatörün 10.0.2.2'si) TCP connect dakikalarca askıda kalıyor
// → giriş butonunda tekerlek sonsuza kadar dönüyor, kullanıcı hiçbir geri bildirim almıyor. Timeout
// isteği dürüstçe düşürür, `extractErrorMessage` `common.error`'a çevirir. Web'de bu tuzak yok
// (tarayıcı kendi süresini uyguluyor), o yüzden orada timeout aranmasın.
const REQUEST_TIMEOUT_MS = 15_000;

const http: AxiosInstance = createAxios({ baseURL: API_BASE, timeout: REQUEST_TIMEOUT_MS });

// Eş zamanlı 401'lerde tek refresh çağrısı — web/src/api/axios.ts refreshPromise dedup pattern'i.
let refreshPromise: Promise<string> | null = null;

// stores/auth.ts bu dosyayı zaten import ediyor; tersine bir import (http.ts -> stores/auth.ts)
// döngü kurar. Bunun yerine store kendini burada bir callback olarak kaydeder — 401 sonrası
// refresh de başarısız olursa (contract §4: "refresh de başarısızsa oturum düşer") store'un
// `status`'ünü 'unauthenticated'a çekmek için tetiklenir. Yalnız bu dosyanın 401 handler'ı
// çağırır; bootstrap kendi başarısızlığını doğrudan zustand state'inde yönetir (bkz. stores/auth.ts).
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

interface RawEnvelope<T> {
  success: boolean;
  statusCode: number;
  data: T;
}

async function doRefresh(): Promise<string> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    // Secure store'da hiç token yoksa ağ çağrısına gerek yok — bootstrap/401 handler'ı bunu
    // "oturum yok" olarak işler.
    throw new Error('NO_REFRESH_TOKEN');
  }
  // Çıplak axios (http instance değil) — X-Client-Type başlığı olmadan sunucu gövdede token vermez.
  const res = await axios.post<RawEnvelope<{ accessToken: string; refreshToken: string }>>(
    `${API_BASE}/auth/refresh`,
    { refreshToken },
    // Çıplak axios olduğu için instance timeout'u geçerli değil — bootstrap yolu da askıda
    // kalmasın diye aynı süre burada tekrar verilir (açılışta sonsuz splash olmaz).
    { headers: clientHeaders(), timeout: REQUEST_TIMEOUT_MS },
  );
  const data = res.data?.data;
  // Savunmacı kontrol (PM bulgusu 2026-07-29): sunucu beklenmedik bir gövde dönerse (ör. cookie
  // kanalına düşüp yalnız accessToken içeren bir yanıt), `undefined` SecureStore'a gitmesin —
  // "Values must be strings" gibi anlaşılmaz bir native hatasıyla oturum sessizce düşmesin.
  if (typeof data?.accessToken !== 'string' || typeof data?.refreshToken !== 'string') {
    if (__DEV__) {
      console.warn('[doRefresh] beklenmeyen /auth/refresh gövdesi (mobil kanal alanları eksik):', res.data);
    }
    throw new Error('REFRESH_RESPONSE_INVALID');
  }
  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = data;
  setAccessToken(newAccessToken);
  // KRİTİK (contract §4): rotasyon gereği HER refresh yanıtındaki yeni refresh token secure
  // store'un üstüne yazılır. Yazılmazsa bir sonraki açılışta kullanılmış token gönderilir →
  // reuse-detection tüm aileyi iptal eder → kullanıcı sebepsiz atılır.
  await setRefreshToken(newRefreshToken);
  return newAccessToken;
}

/** Access token'ı tazele (in-flight dedup'lı). Bootstrap ve 401 interceptor'ı bunu paylaşır. */
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// Request interceptor — Bearer + X-Client-Type: mobile (bu başlık olmadan sunucu gövdede
// refresh token vermez, mobil akış hiç çalışmaz — contract §2.2).
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers.set('X-Client-Type', 'mobile');
  if (DEVICE_HEADER) config.headers.set('X-Client-Device', DEVICE_HEADER);
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

// Response interceptor — envelope unwrap + 401 → tek-uçuş refresh.
http.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      response.data = (response.data as RawEnvelope<unknown>).data;
    }
    return response;
  },
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        const newToken = await refreshAccessToken();
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return http(original);
      } catch (refreshError) {
        // D97: yalnız kesin red oturumu düşürür; ağ/zaman aşımı/5xx'te token kalır, orijinal hata döner.
        if (isDefinitiveRefreshRejection(refreshError)) {
          clearAccessToken();
          await clearRefreshToken();
          onSessionExpired?.();
        }
      }
    }
    return Promise.reject(error);
  },
);

export default http;
