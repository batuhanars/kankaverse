import http from './http';

// Sprint M0 contract §2.7 — endpoint imzaları. Alan adları backend DTO'larından birebir okundu
// (contract'ın §2.7 tablosundaki `emailOrUsername` bir paraphrase'di; gerçek `LoginDto` alanı
// `identifier` — api/src/modules/auth/dto/login.dto.ts:11). Contract §2.7 dipnotu bunu emrediyor:
// "DTO alan adları mevcut LoginDto / Login2faDto'dan birebir okunur; dev tahmin etmez, dosyaya bakar."

export interface UserDto {
  id: string;
  username: string;
  email: string;
  // Sprint M1a — "Sen" sekmesi + mesaj yazarı avatarı için eklendi (api/src/modules/auth/utils/
  // user-dto.util.ts `toUserDto` — M0'da tiplenmemiş alt kümeye ihtiyaç doğdu, genişletildi).
  avatarUrl: string | null;
  // Sprint M1b — Arkadaş Ekle ekranı "kendi kodum" için (`toUserDto` zaten dönüyor, sıfır backend;
  // sözleşme §2 kanıt notu). 6 karakter (`send-friend-request.dto.ts` `@Length(6,6)`).
  friendCode: string;
  // Sprint M1c — contract §3.4: e-posta doğrulama bandı bu alana bakar. Sunucu zaten dönüyordu
  // (`toUserDto`: `emailVerifiedAt !== null`), mobil tipte hiç yoktu (sıfır backend değişikliği).
  emailVerified: boolean;
  // Sprint M1f — güvenlik ekranları. `toUserDto` bunu da zaten dönüyordu. **Reauth formlarının
  // TOTP alanını göstermesi buna bakar**: 2FA kapalıyken kod alanı çizilmez (sunucu `totpCode`'u
  // opsiyonel kabul ediyor), açıkken zorunlu gibi sunulur.
  twoFactorEnabled: boolean;
}

/**
 * Sprint M1f — hassas işlem kimlik doğrulaması. `api/.../dto/reauth-fields.dto.ts` ile **BİREBİR**:
 * `currentPassword` zorunlu, `totpCode` opsiyonel. Bu iki alan şifre/e-posta değişimi, 2FA kurma/
 * kapatma ve hesap silmede aynen tekrar ediyor — tek tip, beş uç.
 *
 * 🔴 Bu nesne yalnız isteğin gövdesinde yaşar. Hiçbir store'a, AsyncStorage'a veya loga yazılmaz.
 */
export interface ReauthFields {
  currentPassword: string;
  totpCode?: string;
}

/** `GET /auth/sessions` — `authService.getSessions` map'inden birebir okundu. */
export interface SessionDto {
  id: string;
  device: string | null;
  ip: string | null;
  lastActiveAt: string;
  createdAt: string;
  /** Bu isteği yapan oturum. Sunucu işaretler; istemci kendi kendine tahmin etmez. */
  current: boolean;
}

/** `POST /auth/2fa/setup` — `{ otpauthUrl, qrDataUrl, secret }`. Mobil yalnız `secret` kullanır (§2.5). */
export interface TwoFactorSetupDto {
  otpauthUrl: string;
  qrDataUrl: string;
  secret: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface LoginChallengeDto {
  twoFactorRequired: true;
  challengeToken: string;
}

export interface AuthSessionDto {
  user: UserDto;
  accessToken: string;
  // Yalnız `X-Client-Type: mobile` başlığıyla gelen istekte dolu (contract §2.2).
  refreshToken?: string;
}

// Sprint M1c contract §2 — `register.dto.ts`'ten birebir (dev tahmin etmez, dosyaya bakar).
export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  /** ISO 8601 `YYYY-MM-DD` — sunucu `@IsISO8601` bekliyor (birthdate.util.ts otorite orada). */
  birthDate: string;
  inviteCode?: string;
}

export interface RegistrationModeDto {
  mode: 'open' | 'invite' | 'closed';
}

export const authApi = {
  async login(payload: LoginPayload): Promise<AuthSessionDto | LoginChallengeDto> {
    const res = await http.post<AuthSessionDto | LoginChallengeDto>('/auth/login', payload);
    return res.data;
  },
  async loginTwoFa(challengeToken: string, code: string): Promise<AuthSessionDto> {
    const res = await http.post<AuthSessionDto>('/auth/login/2fa', { challengeToken, code });
    return res.data;
  },
  async me(): Promise<UserDto> {
    const res = await http.get<UserDto>('/auth/me');
    return res.data;
  },
  async logout(): Promise<null> {
    const res = await http.post<null>('/auth/logout');
    return res.data;
  },
  // Sprint M1c — auth YOK (public meta), kayıt formunun davet alanını göstermeden ÖNCE çağrılır.
  async getRegistrationMode(): Promise<RegistrationModeDto> {
    const res = await http.get<RegistrationModeDto>('/auth/registration-mode');
    return res.data;
  },
  // contract §2: mobil `X-Client-Type: mobile` gönderdiği için (http.ts request interceptor)
  // sunucu her zaman gövdede `refreshToken` döner — AuthSessionDto ile aynı şekil, login ile ortak.
  async register(payload: RegisterPayload): Promise<AuthSessionDto> {
    const res = await http.post<AuthSessionDto>('/auth/register', payload);
    return res.data;
  },
  // contract §3.3 — sızıntı yok: sunucu her koşulda 200/null döner, istemci bunu yorumlamaz.
  async forgotPassword(email: string): Promise<null> {
    const res = await http.post<null>('/auth/forgot-password', { email });
    return res.data;
  },
  // contract §3.4 — auth gerekir (JwtAuthGuard); zaten doğrulanmışta sunucu 409 döner.
  async resendVerification(): Promise<null> {
    const res = await http.post<null>('/auth/resend-verification');
    return res.data;
  },

  // ── Sprint M1f — hesap güvenliği ────────────────────────────────────────────
  // Tüm uçlar `auth.controller.ts`ten birebir okundu (M1f sözleşmesi §0 tablosu). Hiçbiri yeni
  // değil; mobil bugüne kadar yalnız çağırmıyordu.

  async getSessions(): Promise<SessionDto[]> {
    const res = await http.get<SessionDto[]>('/auth/sessions');
    return res.data;
  },
  async revokeSession(sessionId: string): Promise<null> {
    const res = await http.delete<null>(`/auth/sessions/${sessionId}`);
    return res.data;
  },
  async revokeOtherSessions(): Promise<null> {
    const res = await http.post<null>('/auth/sessions/revoke-others');
    return res.data;
  },

  /** Kurulumu başlatır; sunucu gizli anahtarı üretip kullanıcıya YAZAR ama 2FA'yı AÇMAZ. */
  async setupTwoFactor(reauth: ReauthFields): Promise<TwoFactorSetupDto> {
    const res = await http.post<TwoFactorSetupDto>('/auth/2fa/setup', reauth);
    return res.data;
  },
  /**
   * Doğrulama kodu geçerliyse 2FA açılır ve **kurtarma kodları bir kez** döner.
   * Alan adı `code` (`Enable2faDto`) — `totpCode` DEĞİL; iki uçta iki farklı ad var, karıştırma.
   */
  async enableTwoFactor(code: string): Promise<{ codes: string[] }> {
    const res = await http.post<{ codes: string[] }>('/auth/2fa/enable', { code });
    return res.data;
  },
  async disableTwoFactor(reauth: ReauthFields): Promise<null> {
    const res = await http.post<null>('/auth/2fa/disable', reauth);
    return res.data;
  },

  /** 🔴 Başarıda sunucu **diğer tüm oturumları düşürür** — ekran bunu kullanıcıya yazmak zorunda. */
  async changePassword(reauth: ReauthFields, newPassword: string): Promise<null> {
    const res = await http.post<null>('/auth/password/change', { ...reauth, newPassword });
    return res.data;
  },
  /** Yeni adrese doğrulama, eskisine geri-al postası gider. E-posta HENÜZ değişmez. */
  async changeEmail(reauth: ReauthFields, newEmail: string): Promise<null> {
    const res = await http.post<null>('/auth/email/change', { ...reauth, newEmail });
    return res.data;
  },

  /**
   * Hesap silme talebi: 30 gün grace + tüm oturumlar düşer. **İptal için ayrı uç YOK** — grace
   * içinde giriş yapmak talebi iptal eder (`cancelPendingDeletionOnLogin`).
   */
  async deleteAccount(reauth: ReauthFields): Promise<null> {
    const res = await http.post<null>('/auth/account/delete', reauth);
    return res.data;
  },
};
